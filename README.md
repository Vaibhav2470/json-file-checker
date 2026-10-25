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
```

Directories are scanned recursively for `.json` files (case-insensitive).
Nested `.git` and `node_modules` directories are skipped. Overlapping input paths
are checked once, and symbolic links are not followed. Explicitly supplying a
symlink is an error. Use `--` before a filename starting with a hyphen.

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
