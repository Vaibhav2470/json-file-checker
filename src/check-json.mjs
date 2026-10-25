import { lstat, readFile, readdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const excludedDirectories = new Set(['.git', 'node_modules']);

/** Validate syntax only. File contents and parser excerpts never leave this function. */
export async function checkPaths(inputs) {
  const result = { valid: [], invalid: [], errors: [] };
  const files = new Set();
  const directories = new Set();

  async function visit(path, explicit = false) {
    try {
      const info = await lstat(path);
      if (info.isSymbolicLink()) {
        if (explicit) result.errors.push({ path, message: 'Symbolic links are not followed.' });
        return;
      }
      if (info.isDirectory()) {
        if (directories.has(path)) return;
        directories.add(path);
        const entries = await readdir(path, { withFileTypes: true });
        entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
        for (const entry of entries) {
          if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
          if (entry.isSymbolicLink()) continue;
          if (entry.isDirectory() || extname(entry.name).toLowerCase() === '.json') {
            await visit(join(path, entry.name));
          }
        }
      } else if (info.isFile() && extname(path).toLowerCase() === '.json') {
        files.add(path);
      } else if (explicit) {
        result.errors.push({ path, message: 'Expected a .json file or directory.' });
      }
    } catch (error) {
      result.errors.push({ path, message: `Cannot inspect path (${error.code ?? 'IO_ERROR'}).` });
    }
  }

  for (const input of inputs) await visit(resolve(input), true);
  for (const path of [...files].sort()) {
    let text;
    try {
      text = await readFile(path, 'utf8');
    } catch (error) {
      result.errors.push({ path, message: `Cannot read file (${error.code ?? 'IO_ERROR'}).` });
      continue;
    }
    try {
      // Common Windows editors may save UTF-8 JSON with a leading byte-order mark.
      JSON.parse(text.replace(/^\uFEFF/, ''));
      result.valid.push(path);
    } catch {
      // JSON.parse error messages can echo configuration values; don't print them.
      result.invalid.push(path);
    }
  }
  return result;
}
