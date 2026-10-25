import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { checkPaths } from '../src/check-json.mjs';

const cli = fileURLToPath(new URL('../bin/check-json.mjs', import.meta.url));
async function fixture(t, files = {}) {
  const root = await mkdtemp(join(tmpdir(), 'json-file-checker-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [path, contents] of Object.entries(files)) {
    const target = join(root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents);
  }
  return root;
}
function run(root, args) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' });
  assert.ifError(result.error);
  return result;
}

test('accepts objects, arrays and JSON scalar values', async (t) => {
  const root = await fixture(t, {
    'object.json': '{"ok":true}', 'array.json': '[1,2]',
    'null.json': 'null', 'bool.json': 'false', 'number.json': '0', 'string.json': '"hello"',
  });
  const result = await checkPaths([root]);
  assert.equal(result.valid.length, 6);
  assert.deepEqual(result.invalid, []);
  assert.deepEqual(result.errors, []);
});

test('collects syntax failures and still validates other files', async (t) => {
  const root = await fixture(t, {
    'good.json': '{}', 'trailing.json': '{"a":1,}', 'comment.json': '// comment\n{}', 'empty.json': '',
  });
  const result = await checkPaths([root]);
  assert.equal(result.valid.length, 1);
  assert.equal(result.invalid.length, 3);
  assert.deepEqual(result.errors, []);
});

test('accepts UTF-8 BOM and uppercase JSON extensions', async (t) => {
  const root = await fixture(t, { 'config.JSON': '\uFEFF{"name":"demo"}\n' });
  assert.equal((await checkPaths([root])).valid.length, 1);
});

test('recurses, skips dependency and Git directories, and ignores other extensions', async (t) => {
  const root = await fixture(t, {
    'nested/config.json': '{}', 'node_modules/bad.json': 'bad',
    '.git/bad.json': 'bad', 'nested/node_modules/bad.json': 'bad',
    'notes.txt': 'not JSON', 'config.jsonc': '// comment',
  });
  const result = await checkPaths([root]);
  assert.deepEqual(result.valid, [join(root, 'nested/config.json')]);
  assert.deepEqual(result.invalid, []);
});

test('deduplicates overlapping directory and file arguments', async (t) => {
  const root = await fixture(t, { 'nested/config.json': '{}' });
  const path = join(root, 'nested/config.json');
  assert.deepEqual((await checkPaths([root, join(root, 'nested'), path, path])).valid, [path]);
});

test('returns exit 0 for valid JSON and leaves contents unchanged', async (t) => {
  const contents = '\uFEFF{ "answer": 42 }\n';
  const root = await fixture(t, { 'config with spaces.json': contents });
  const result = run(root, ['config with spaces.json']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /1 valid, 0 invalid, 0 error/);
  assert.equal(result.stderr, '');
  assert.equal(await readFile(join(root, 'config with spaces.json'), 'utf8'), contents);
});

test('returns exit 1 for invalid JSON without exposing configuration values', async (t) => {
  const root = await fixture(t, { 'config.json': 'PRIVATE_CONFIGURATION_VALUE' });
  const result = run(root, ['.']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /INVALID "config.json"/);
  assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_CONFIGURATION_VALUE/);
});

test('returns exit 2 for a missing input while checking valid inputs', async (t) => {
  const root = await fixture(t, { 'good.json': '{}' });
  const result = run(root, ['good.json', 'missing.json']);
  assert.equal(result.status, 2);
  assert.match(result.stdout, /1 valid/);
  assert.match(result.stderr, /ENOENT/);
});

test('does not report an empty directory or non-JSON file as a successful check', async (t) => {
  const root = await fixture(t, { 'readme.txt': 'hello' });
  assert.equal(run(root, ['.']).status, 2);
  assert.equal(run(root, ['readme.txt']).status, 2);
});

test('shows help and rejects missing arguments and unknown options', async (t) => {
  const root = await fixture(t);
  assert.equal(run(root, ['--help']).status, 0);
  assert.match(run(root, ['--help']).stdout, /Usage:/);
  assert.equal(run(root, []).status, 2);
  assert.equal(run(root, ['--typo']).status, 2);
});

test('supports a literal path beginning with a hyphen after --', async (t) => {
  const root = await fixture(t, { '-config.json': '{}' });
  assert.equal(run(root, ['--', '-config.json']).status, 0);
});

test('does not follow symlinks or directory cycles', { skip: process.platform === 'win32' }, async (t) => {
  const root = await fixture(t, { 'good.json': '{}' });
  await symlink(root, join(root, 'cycle'), 'dir');
  await symlink(join(root, 'good.json'), join(root, 'alias.json'));
  const result = await checkPaths([root]);
  assert.deepEqual(result.valid, [join(root, 'good.json')]);
  assert.equal(run(root, ['alias.json']).status, 2);
});
