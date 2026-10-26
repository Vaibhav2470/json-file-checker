# JSON File Checker

A small, read-only command-line tool for validating JSON configuration files.
Check one file or a whole project before committing changes, without installing
any dependencies. Requires Node.js 22 or newer and Git to clone the repository.

## Quick start

```sh
git clone https://github.com/Vaibhav2470/json-file-checker.git
cd json-file-checker
node bin/check-json.mjs examples/valid.json
```

Expected output:

```text
Checked 1 JSON file(s): 1 valid, 0 invalid, 0 error(s).
```

No `npm install` step is needed. You can also use `npm run check -- examples/valid.json`.

## Check your own project

```sh
node bin/check-json.mjs ../my-project
node bin/check-json.mjs ../my-project/package.json ../my-project/config
node bin/check-json.mjs "../project with spaces/config.json"
node bin/check-json.mjs --exclude build --exclude coverage ../my-project
```

Directories are scanned recursively for `.json` files (case-insensitive).
Nested `.git` and `node_modules` directories are skipped. Overlapping input paths
are checked once, and symbolic links are not followed. Explicitly supplying a
symlink is an error. Use `--` before a filename starting with a hyphen.

Use repeated `--exclude <directory-name>` options to skip additional generated
folders at any depth. Names are exact and case-sensitive; paths and glob patterns
are not supported. The built-in exclusions remain in effect. An explicitly
supplied file or directory is still inspected, even when its name matches an
exclusion. If the scan finds no JSON files, it exits with code `2`.

Files are read as UTF-8, and a leading UTF-8 byte-order mark is accepted. All JSON
values are supported, including arrays and scalars. The checker never rewrites
files and does not print file contents or parser excerpts in error messages.

| Exit code | Meaning |
| --- | --- |
| `0` | At least one JSON file was checked and every file was valid. Also used for `--help`. |
| `1` | One or more files contain invalid JSON syntax. |
| `2` | Invalid arguments, an unreadable/missing path, an unsupported explicit file, or no JSON files found. |

Operational errors take precedence over syntax failures. Other readable inputs
are still checked when one path fails.

## Machine-readable reports

Use `--format json` when a CI job or another program needs structured results:

```sh
node bin/check-json.mjs --format json examples/valid.json
```

The command emits one JSON object to stdout, including on validation or file-access
failures. Validation diagnostics are included in that object, so stderr is empty.
The process still returns the exit codes above; a parseable report alone does not
mean the check succeeded.

```json
{
  "schemaVersion": 1,
  "summary": { "checked": 1, "valid": 1, "invalid": 0, "errors": 0 },
  "valid": ["examples/valid.json"],
  "invalid": [],
  "errors": []
}
```

Paths are relative to the working directory and use the operating system's path
separator (`/` on Linux, `\\` on Windows). `valid` and `invalid` contain path
strings. `errors` contains objects with `path` and a safe `message`. `checked`
counts files successfully read and parsed or rejected, excluding file-access
errors. An empty scan reports all-zero counts but still exits with code `2`.
No configuration contents or parser excerpts are included. Help and invalid
command-line arguments still use text output; choose `--format text` to explicitly
select the default output format.

For example, a Node.js script in this repository can consume the report without
discarding the checker's failure status:

```js
import { spawnSync } from 'node:child_process';

const child = spawnSync(process.execPath,
  ['bin/check-json.mjs', '--format', 'json', '.'], { encoding: 'utf8' });
if (child.error) throw child.error;
if (child.status === null) throw new Error('JSON checker did not exit normally');
if (!child.stdout.trim()) throw new Error(child.stderr || 'No report received');
const report = JSON.parse(child.stdout);
console.log(`${report.summary.invalid} invalid files, ${report.summary.errors} errors`);
process.exitCode = child.status;
```

## Development and verification

```sh
npm test
npm run check -- .
```

Tests use Node's built-in test runner and temporary fixtures. They cover valid
and malformed JSON, BOMs, recursion, exclusions, duplicate inputs, unchanged file
contents, private-value redaction, exit codes, and CLI arguments. Symlink tests
run on Linux and are skipped on Windows, where creating links may require extra
privileges. GitHub Actions runs Node 22 and 24 on Linux and Windows.

## Scope

This validates JSON syntax only, not JSON Schema, duplicate object keys, or an
application's configuration rules. Comments and trailing commas are rejected;
`.jsonc` files are ignored during directory scanning. Files are read into memory,
so this is intended for configuration files rather than very large datasets.
The tool does not make network requests.

## Contribute

Open an issue with a small example and expected behavior, or submit a focused
pull request with regression tests. Use synthetic configuration values in bug
reports. Run the two verification commands above before submitting a PR.
Real collaborators should agree to any co-author attribution for their work.
