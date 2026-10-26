import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const cli = fileURLToPath(new URL('../bin/check-json.mjs', import.meta.url));
async function fixture(t, files = {}) {
  const root = await mkdtemp(join(tmpdir(), 'json-report-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return root;
}
function run(root, args) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' });
  assert.ifError(result.error);
  return result;
}
function parseReport(result) {
  assert.equal(result.stderr, '');
  // Parsing the whole output also rejects extra human-readable lines or reports.
  return JSON.parse(result.stdout);
}

test('JSON mode emits one versioned report with relative paths and valid counts', async (t) => {
  const contents = '\uFEFF{ "enabled": true }\n';
  const root = await fixture(t, { 'config with spaces.json': contents });
  const result = run(root, ['--format', 'json', 'config with spaces.json']);
  assert.equal(result.status, 0);
  assert.deepEqual(parseReport(result), {
    schemaVersion: 1,
    summary: { checked: 1, valid: 1, invalid: 0, errors: 0 },
    valid: ['config with spaces.json'], invalid: [], errors: [],
  });
  assert.equal(await readFile(join(root, 'config with spaces.json'), 'utf8'), contents);
});

test('JSON syntax failures return exit 1 without configuration values or parser excerpts', async (t) => {
  const root = await fixture(t, {
    'bad.json': '{"secret":"DO_NOT_PRINT_THIS_VALUE",}', 'good.json': '{}',
  });
  const result = run(root, ['--format', 'json', '.']);
  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stdout + result.stderr, /DO_NOT_PRINT_THIS_VALUE|Unexpected|SyntaxError/);
  assert.deepEqual(parseReport(result), {
    schemaVersion: 1,
    summary: { checked: 2, valid: 1, invalid: 1, errors: 0 },
    valid: ['good.json'], invalid: ['bad.json'], errors: [],
  });
});

test('JSON mode reports missing paths and operational errors take precedence', async (t) => {
  const root = await fixture(t, { 'good.json': '{}', 'bad.json': 'bad' });
  const result = run(root, ['--format', 'json', 'good.json', 'bad.json', 'missing.json']);
  assert.equal(result.status, 2);
  const report = parseReport(result);
  assert.deepEqual(report.summary, { checked: 2, valid: 1, invalid: 1, errors: 1 });
  assert.deepEqual(report.valid, ['good.json']);
  assert.deepEqual(report.invalid, ['bad.json']);
  assert.deepEqual(report.errors, [{ path: 'missing.json', message: 'Cannot inspect path (ENOENT).' }]);
});

test('JSON mode reports unsupported explicit files without reading their contents', async (t) => {
  const root = await fixture(t, { 'notes.txt': 'DO_NOT_PRINT_THIS_VALUE' });
  const result = run(root, ['--format', 'json', 'notes.txt']);
  assert.equal(result.status, 2);
  const report = parseReport(result);
  assert.deepEqual(report.summary, { checked: 0, valid: 0, invalid: 0, errors: 1 });
  assert.deepEqual(report.errors, [{ path: 'notes.txt', message: 'Expected a .json file or directory.' }]);
  assert.doesNotMatch(result.stdout, /DO_NOT_PRINT_THIS_VALUE/);
});

test('empty JSON scans produce a parseable zero-count report and exit 2', async (t) => {
  const root = await fixture(t);
  const result = run(root, ['--format', 'json', '.']);
  assert.equal(result.status, 2);
  assert.deepEqual(parseReport(result), {
    schemaVersion: 1,
    summary: { checked: 0, valid: 0, invalid: 0, errors: 0 },
    valid: [], invalid: [], errors: [],
  });
});

test('JSON reports respect exclusions, overlap deduplication and option order', async (t) => {
  const root = await fixture(t, {
    'nested/good.json': '{}', 'build/bad.json': 'bad',
    '.git/bad.json': 'bad', 'node_modules/bad.json': 'bad',
  });
  const result = run(root, ['.', '--exclude', 'build', 'nested/good.json', '--format', 'json']);
  assert.equal(result.status, 0);
  const report = parseReport(result);
  assert.deepEqual(report.summary, { checked: 1, valid: 1, invalid: 0, errors: 0 });
  assert.deepEqual(report.valid, [join('nested', 'good.json')]);
  assert.deepEqual(report.invalid, []);
  assert.deepEqual(report.errors, []);
});

test('excluding all files in JSON mode still exits 2', async (t) => {
  const root = await fixture(t, { 'build/bad.json': 'bad' });
  const result = run(root, ['--exclude', 'build', '--format', 'json', '.']);
  assert.equal(result.status, 2);
  assert.deepEqual(parseReport(result).summary, { checked: 0, valid: 0, invalid: 0, errors: 0 });
});

test('explicit text format keeps existing stdout, stderr and exit codes', async (t) => {
  const root = await fixture(t, { 'good.json': '{}', 'bad.json': 'bad' });
  for (const inputs of [['good.json'], ['bad.json'], ['missing.json'], ['.']]) {
    const original = run(root, inputs);
    const explicit = run(root, ['--format', 'text', ...inputs]);
    assert.equal(explicit.status, original.status);
    assert.equal(explicit.stdout, original.stdout);
    assert.equal(explicit.stderr, original.stderr);
  }
});

test('format options require a supported value and missing paths remain usage errors', async (t) => {
  const root = await fixture(t);
  for (const args of [['--format'], ['--format', 'yaml', '.'], ['--format', '--help', '.']]) {
    const result = run(root, args);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /Expected text or json after --format/);
  }
  const noInputs = run(root, ['--format', 'json']);
  assert.equal(noInputs.status, 2);
  assert.equal(noInputs.stdout, '');
  assert.match(noInputs.stderr, /Usage:/);
});

test('help remains text and -- preserves literal filenames in JSON mode', async (t) => {
  const root = await fixture(t, { '--format.json': '{}' });
  const help = run(root, ['--format', 'json', '--help']);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Usage:/);
  assert.equal(help.stderr, '');
  const result = run(root, ['--format', 'json', '--', '--format.json']);
  assert.equal(result.status, 0);
  assert.deepEqual(parseReport(result).valid, ['--format.json']);
});
