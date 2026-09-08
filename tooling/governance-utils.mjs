import { lstat, readdir, readFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

export const IGNORED_DIRECTORIES = new Set(['.git', '.worktrees', '.superpowers', 'node_modules']);

export function displayPath(root, target) {
  return relative(root, target).split(sep).join('/');
}

export async function pathExists(target) {
  try {
    await lstat(target);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

export async function readJson(target) {
  return JSON.parse(await readFile(target, 'utf8'));
}

export async function walkRepository(root, { ignoredDirectories = IGNORED_DIRECTORIES } = {}) {
  const absoluteRoot = resolve(root);
  const entries = [];
  const symlinks = [];

  let rootStats;
  try {
    rootStats = await lstat(absoluteRoot);
  } catch (error) {
    if (error?.code === 'ENOENT') return { entries, symlinks: [], missingRoot: true };
    throw error;
  }
  if (rootStats.isSymbolicLink()) return { entries, symlinks: ['.'], missingRoot: false };
  if (!rootStats.isDirectory()) return { entries, symlinks: [], missingRoot: false };

  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
      const target = resolve(directory, entry.name);
      const stats = await lstat(target);
      if (stats.isSymbolicLink()) {
        symlinks.push(displayPath(absoluteRoot, target));
        continue;
      }
      if (stats.isDirectory()) {
        entries.push({ path: displayPath(absoluteRoot, target), type: 'directory' });
        await visit(target);
      } else if (stats.isFile()) {
        entries.push({ path: displayPath(absoluteRoot, target), type: 'file' });
      }
    }
  }

  await visit(absoluteRoot);
  return { entries, symlinks, missingRoot: false };
}

export function isWithin(path, root) {
  return path === root || path.startsWith(`${root}/`);
}

export function diagnosticResult(diagnostics) {
  return { ok: diagnostics.length === 0, diagnostics };
}

export async function readText(root, relativePath) {
  return readFile(resolve(root, relativePath), 'utf8');
}
