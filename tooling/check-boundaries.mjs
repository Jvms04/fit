import { readFile } from 'node:fs/promises';
import { dirname, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { diagnosticResult, isWithin, pathExists, readJson, walkRepository } from './governance-utils.mjs';

const CODE_FILE = /\.(?:js|jsx|mjs|cjs|ts|tsx)$/i;

function layerForPath(path) {
  if (isWithin(path, 'apps/mobile/src/presentation')) return 'presentation';
  if (isWithin(path, 'packages/domain')) return 'domain';
  if (isWithin(path, 'packages/application')) return 'application';
  if (isWithin(path, 'database/local')) return 'database-local';
  if (isWithin(path, 'database/remote')) return 'database-remote';
  return null;
}

function skipQuoted(source, start, quote) {
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === '\\') index += 2;
    else if (source[index] === quote) return index + 1;
    else index += 1;
  }
  return source.length;
}

function skipTrivia(source, start) {
  let index = start;
  while (index < source.length) {
    if (/\s/.test(source[index])) index += 1;
    else if (source.startsWith('//', index)) {
      const end = source.indexOf('\n', index + 2);
      index = end === -1 ? source.length : end + 1;
    } else if (source.startsWith('/*', index)) {
      const end = source.indexOf('*/', index + 2);
      index = end === -1 ? source.length : end + 2;
    } else break;
  }
  return index;
}

function previousSignificant(source, start) {
  let index = start - 1;
  while (index >= 0 && /\s/.test(source[index])) index -= 1;
  return source[index] ?? '';
}

function isEscaped(source, index) {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === '\\'; cursor -= 1) backslashes += 1;
  return backslashes % 2 === 1;
}

function maskComments(source) {
  const masked = source.split('');
  let index = 0;
  const blank = (start, end) => {
    for (let cursor = start; cursor < end; cursor += 1) {
      if (masked[cursor] !== '\n' && masked[cursor] !== '\r') masked[cursor] = ' ';
    }
  };
  while (index < source.length) {
    if (source[index] === "'" || source[index] === '"' || source[index] === '`') {
      index = skipQuoted(source, index, source[index]);
    } else if (source.startsWith('//', index) && !isEscaped(source, index)) {
      const end = source.indexOf('\n', index + 2);
      const commentEnd = end === -1 ? source.length : end;
      blank(index, commentEnd);
      index = commentEnd;
    } else if (source.startsWith('/*', index) && !isEscaped(source, index)) {
      const end = source.indexOf('*/', index + 2);
      const commentEnd = end === -1 ? source.length : end + 2;
      blank(index, commentEnd);
      index = commentEnd;
    } else index += 1;
  }
  return masked.join('');
}

function identifierAt(source, index) {
  const match = /^[A-Za-z_$][\w$]*/.exec(source.slice(index));
  return match ? { value: match[0], end: index + match[0].length } : null;
}

function stringAfterTrivia(source, start) {
  const index = skipTrivia(source, start);
  const quote = source[index];
  if (quote !== "'" && quote !== '"') return null;
  const end = skipQuoted(source, index, quote);
  return { value: source.slice(index + 1, Math.max(index + 1, end - 1)), end };
}

function specifierAfterFrom(source, start) {
  let index = start;
  while (index < source.length) {
    index = skipTrivia(source, index);
    if (index >= source.length || source[index] === ';') return null;
    if (source[index] === "'" || source[index] === '"') {
      index = skipQuoted(source, index, source[index]);
      continue;
    }
    const token = identifierAt(source, index);
    if (token?.value === 'from') {
      const literal = stringAfterTrivia(source, token.end);
      if (literal) return literal;
    }
    index = token ? token.end : index + 1;
  }
  return null;
}

/** Extract only literal ESM/CommonJS import specifiers; non-literal expressions are ignored. */
function importSpecifiers(originalSource) {
  const source = maskComments(originalSource);
  const result = [];
  let index = 0;
  while (index < source.length) {
    if (source.startsWith('//', index)) {
      const end = source.indexOf('\n', index + 2);
      index = end === -1 ? source.length : end + 1;
      continue;
    }
    if (source.startsWith('/*', index)) {
      const end = source.indexOf('*/', index + 2);
      index = end === -1 ? source.length : end + 2;
      continue;
    }
    if (source[index] === "'" || source[index] === '"' || source[index] === '`') {
      index = skipQuoted(source, index, source[index]);
      continue;
    }
    const token = identifierAt(source, index);
    if (!token) {
      index += 1;
      continue;
    }
    if (token.value === 'import' && previousSignificant(source, index) === '.') {
      index = token.end;
      continue;
    }
    if (token.value === 'import') {
      const next = skipTrivia(source, token.end);
      if (source[next] === '(') {
        const literal = stringAfterTrivia(source, next + 1);
        if (literal) result.push(literal.value);
      } else if (source[next] === "'" || source[next] === '"') {
        const literal = stringAfterTrivia(source, next);
        if (literal) result.push(literal.value);
      } else {
        const literal = specifierAfterFrom(source, next);
        if (literal) result.push(literal.value);
      }
    } else if (token.value === 'export') {
      const literal = specifierAfterFrom(source, token.end);
      if (literal) result.push(literal.value);
    } else if (token.value === 'require' && previousSignificant(source, index) !== '.') {
      const next = skipTrivia(source, token.end);
      if (source[next] === '(') {
        const literal = stringAfterTrivia(source, next + 1);
        if (literal) result.push(literal.value);
      }
    }
    index = token.end;
  }
  return result;
}

function normalizedSpecifier(specifier, sourcePath) {
  if (!specifier.startsWith('.')) return specifier;
  const normalized = normalize(`${dirname(sourcePath)}/${specifier}`).replaceAll('\\', '/');
  return normalized.replace(/^\.\//, '').replace(/\.(?:[cm]?[jt]sx?)$/i, '');
}

export async function checkBoundaries(root = process.cwd()) {
  const absoluteRoot = resolve(root);
  const policyPath = resolve(absoluteRoot, 'tooling/policies/boundaries.json');
  if (!(await pathExists(policyPath))) return diagnosticResult(['missing boundary policy: tooling/policies/boundaries.json']);
  const policy = await readJson(policyPath);
  const { entries, symlinks } = await walkRepository(absoluteRoot);
  const codeEntries = entries.filter((entry) => entry.type === 'file' && CODE_FILE.test(entry.path) && layerForPath(entry.path));
  const diagnostics = symlinks.map((link) => `repository symlink is not permitted during boundary scan: ${link}`);
  // Boundary checking is intentionally a no-op until a governed code root is born.
  if (codeEntries.length === 0) return diagnosticResult(diagnostics);
  for (const entry of codeEntries) {
    const layer = layerForPath(entry.path);
    const source = await readFile(resolve(absoluteRoot, entry.path), 'utf8');
    for (const specifier of importSpecifiers(source)) {
      const candidates = [specifier, normalizedSpecifier(specifier, entry.path)];
      for (const forbidden of policy.forbiddenImports?.[layer] ?? []) {
        const pattern = new RegExp(forbidden.pattern);
        if (candidates.some((candidate) => pattern.test(candidate))) {
          diagnostics.push(`forbidden ${layer} import "${specifier}" (${forbidden.category}) in ${entry.path}`);
        }
      }
    }
  }
  return diagnosticResult([...new Set(diagnostics)]);
}

async function main() {
  const result = await checkBoundaries(process.argv[2] ?? process.cwd());
  if (result.ok) console.log('boundaries: PASS');
  else {
    for (const diagnostic of result.diagnostics) console.error(`boundaries: ${diagnostic}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
