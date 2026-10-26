import { relative } from 'node:path';
import { checkPaths, isDirectoryName } from '../src/check-json.mjs';

const usage = `Usage: node bin/check-json.mjs [--format text|json] [--exclude <directory-name>] <file-or-directory> [...paths]

Validate .json syntax without modifying files. Directories are scanned recursively,
excluding .git and node_modules. Symbolic links are not followed.
Repeat --exclude <directory-name> to skip additional nested directories.
Exclusions match exact, case-sensitive names, not paths or glob patterns.
Explicitly supplied input paths are always inspected.
Use --format json for a single machine-readable validation report on stdout.
Help and invalid arguments are still reported as text.
Use -- before a path beginning with a hyphen.

Exit codes: 0 = valid, 1 = invalid JSON, 2 = usage, IO error, or no JSON files.
`;

const inputs = [];
const excludeDirectories = [];
const args = process.argv.slice(2);
let format = 'text';
let positionalOnly = false;
for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (!positionalOnly && argument === '--') {
    positionalOnly = true;
  } else if (!positionalOnly && (argument === '--help' || argument === '-h')) {
    process.stdout.write(usage);
    process.exit(0);
  } else if (!positionalOnly && argument === '--exclude') {
    const name = args[index + 1];
    if (!isDirectoryName(name) || name.startsWith('-') || /[*?\[\]{}]/.test(name)) {
      process.stderr.write('Expected a directory name after --exclude (no paths or patterns).\n');
      process.exit(2);
    }
    excludeDirectories.push(name);
    index += 1;
  } else if (!positionalOnly && argument === '--format') {
    const value = args[index + 1];
    if (value !== 'text' && value !== 'json') {
      process.stderr.write('Expected text or json after --format.\n');
      process.exit(2);
    }
    format = value;
    index += 1;
  } else if (!positionalOnly && argument.startsWith('-')) {
    process.stderr.write(`Unknown option: ${argument}\n${usage}`);
    process.exit(2);
  } else {
    inputs.push(argument);
  }
}

if (inputs.length === 0) {
  process.stderr.write(usage);
  process.exit(2);
}

try {
  const result = await checkPaths(inputs, { excludeDirectories });
  const display = (path) => relative(process.cwd(), path) || '.';
  const count = result.valid.length + result.invalid.length;
  process.exitCode = result.errors.length > 0 || count === 0 ? 2 : result.invalid.length > 0 ? 1 : 0;
  if (format === 'json') {
    console.log(JSON.stringify({
      schemaVersion: 1,
      summary: {
        checked: count,
        valid: result.valid.length,
        invalid: result.invalid.length,
        errors: result.errors.length,
      },
      valid: result.valid.map(display),
      invalid: result.invalid.map(display),
      errors: result.errors.map(({ path, message }) => ({ path: display(path), message })),
    }));
  } else {
    for (const path of result.invalid) {
      console.error(`INVALID ${JSON.stringify(display(path))}: invalid JSON syntax.`);
    }
    for (const error of result.errors) {
      console.error(`ERROR ${JSON.stringify(display(error.path))}: ${error.message}`);
    }
    if (count === 0) console.error('No JSON files were checked.');
    console.log(`Checked ${count} JSON file(s): ${result.valid.length} valid, ${result.invalid.length} invalid, ${result.errors.length} error(s).`);
  }
} catch {
  console.error('Unable to complete validation.');
  process.exitCode = 2;
}
