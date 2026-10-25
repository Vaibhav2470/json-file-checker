import { relative } from 'node:path';
import { checkPaths } from '../src/check-json.mjs';

const usage = `Usage: node bin/check-json.mjs <file-or-directory> [...paths]

Validate .json syntax without modifying files. Directories are scanned recursively,
excluding .git and node_modules. Symbolic links are not followed.
Use -- before a path beginning with a hyphen.

Exit codes: 0 = valid, 1 = invalid JSON, 2 = usage, IO error, or no JSON files.
`;

const inputs = [];
let positionalOnly = false;
for (const argument of process.argv.slice(2)) {
  if (!positionalOnly && argument === '--') {
    positionalOnly = true;
  } else if (!positionalOnly && (argument === '--help' || argument === '-h')) {
    process.stdout.write(usage);
    process.exit(0);
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
  const result = await checkPaths(inputs);
  const display = (path) => relative(process.cwd(), path) || '.';
  for (const path of result.invalid) {
    console.error(`INVALID ${JSON.stringify(display(path))}: invalid JSON syntax.`);
  }
  for (const error of result.errors) {
    console.error(`ERROR ${JSON.stringify(display(error.path))}: ${error.message}`);
  }
  const count = result.valid.length + result.invalid.length;
  if (count === 0) console.error('No JSON files were checked.');
  console.log(`Checked ${count} JSON file(s): ${result.valid.length} valid, ${result.invalid.length} invalid, ${result.errors.length} error(s).`);
  process.exitCode = result.errors.length > 0 || count === 0 ? 2 : result.invalid.length > 0 ? 1 : 0;
} catch {
  console.error('Unable to complete validation.');
  process.exitCode = 2;
}
