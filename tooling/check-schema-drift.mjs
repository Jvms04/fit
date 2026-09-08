import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { diagnosticResult, isWithin, pathExists, readJson, walkRepository } from './governance-utils.mjs';

const SOURCE_FILE = /\.(?:js|jsx|mjs|cjs|ts|tsx)$/i;
const SCHEMA_FILE = /\.(?:json|ya?ml)$/i;
const NAMED_SCHEMA_ARTIFACT = /(?:^|\/)(?:schema|(?:openapi|swagger)(?:[.-][^/]*)?|[^/]+\.(?:schema|openapi|swagger))\.(?:json|ya?ml)$/i;
const NAMED_OPENAPI_ARTIFACT = /(?:^|\/)(?:openapi|swagger)(?:[.-][^/]*)?\.(?:json|ya?ml)$/i;
const CANONICAL_SCHEMA_MARKER = /\bz\s*\.\s*(?:object|array|union|record|discriminatedUnion|intersection)\s*\(|\bZodObject\b/;
const JSON_SCHEMA_OR_OPENAPI_MARKER = /"\$schema"\s*:|'\$schema'\s*:|"openapi"\s*:|'openapi'\s*:|^\s*openapi\s*:/im;
const CANONICAL_SOURCE_MARKER = ['@canonical', '-schema'].join('');

function maskStringsAndComments(content) {
  let masked = '';
  let explicitMarker = false;
  let index = 0;
  const maskRange = (start, end, preserveMarker = false) => {
    const range = content.slice(start, end);
    const markerOffset = preserveMarker ? range.indexOf(CANONICAL_SOURCE_MARKER) : -1;
    for (let offset = 0; offset < range.length; offset += 1) {
      if (offset === markerOffset) {
        masked += CANONICAL_SOURCE_MARKER;
        offset += CANONICAL_SOURCE_MARKER.length - 1;
      } else {
        masked += range[offset] === '\n' ? '\n' : ' ';
      }
    }
  };
  const isEscaped = (position) => {
    let backslashes = 0;
    for (let cursor = position - 1; cursor >= 0 && content[cursor] === '\\'; cursor -= 1) backslashes += 1;
    return backslashes % 2 === 1;
  };
  while (index < content.length) {
    const character = content[index];
    if (content.startsWith('//', index) && !isEscaped(index)) {
      const end = content.indexOf('\n', index + 2);
      const commentEnd = end === -1 ? content.length : end;
      const body = content.slice(index + 2, commentEnd);
      const deliberate = /^\s*@canonical-schema(?:\s|$)/.test(body);
      if (deliberate) explicitMarker = true;
      maskRange(index, commentEnd, deliberate);
      index = commentEnd;
      continue;
    }
    if (content.startsWith('/*', index) && !isEscaped(index)) {
      const end = content.indexOf('*/', index + 2);
      const commentEnd = end === -1 ? content.length : end + 2;
      const body = content.slice(index + 2, end === -1 ? content.length : end);
      const deliberate = /^\s*\*?\s*@canonical-schema(?:\s|$)/.test(body);
      if (deliberate) explicitMarker = true;
      maskRange(index, commentEnd, deliberate);
      index = commentEnd;
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      const quote = character;
      const start = index;
      index += 1;
      while (index < content.length) {
        if (content[index] === '\\') index += 2;
        else if (content[index] === quote) {
          index += 1;
          break;
        } else index += 1;
      }
      maskRange(start, index);
    } else {
      masked += character;
      index += 1;
    }
  }
  return { masked, explicitMarker };
}

function markerValue(content, marker) {
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const quoted = new RegExp(`(?:"${escaped}"|'${escaped}')\\s*:\\s*["']([^"'\\n]+)["']`, 'i');
  const comment = new RegExp(`${escaped}\\s*[:=]\\s*([^\\s#]+)`, 'i');
  return content.match(quoted)?.[1]?.trim() || content.match(comment)?.[1]?.trim() || '';
}

export async function checkSchemaDrift(root = process.cwd()) {
  const absoluteRoot = resolve(root);
  const policyPath = resolve(absoluteRoot, 'tooling/policies/schema-source.json');
  if (!(await pathExists(policyPath))) return diagnosticResult(['missing schema policy: tooling/policies/schema-source.json']);
  const policy = await readJson(policyPath);
  const { entries, symlinks } = await walkRepository(absoluteRoot);
  const diagnostics = symlinks.map((link) => `repository symlink is not permitted during schema scan: ${link}`);
  for (const entry of entries) {
    if (entry.type !== 'file' || (!SOURCE_FILE.test(entry.path) && !SCHEMA_FILE.test(entry.path))) continue;
    const content = await readFile(resolve(absoluteRoot, entry.path), 'utf8');
    const { masked: sourceContent, explicitMarker } = maskStringsAndComments(content);
    const hasCanonicalSource = CANONICAL_SCHEMA_MARKER.test(sourceContent) || explicitMarker;
    if (SOURCE_FILE.test(entry.path) && hasCanonicalSource && !isWithin(entry.path, policy.canonicalSourceRoot)) {
      diagnostics.push(`canonical schema source outside ${policy.canonicalSourceRoot}: ${entry.path}`);
    }
    const artifact = SCHEMA_FILE.test(entry.path)
      && (NAMED_SCHEMA_ARTIFACT.test(entry.path)
        || NAMED_OPENAPI_ARTIFACT.test(entry.path)
        || JSON_SCHEMA_OR_OPENAPI_MARKER.test(content)
        || isWithin(entry.path, policy.generatedRoot));
    if (artifact && !isWithin(entry.path, policy.generatedRoot)) {
      diagnostics.push(`JSON Schema/OpenAPI artifact outside ${policy.generatedRoot}: ${entry.path}`);
    }
    if (artifact && isWithin(entry.path, policy.generatedRoot)) {
      const source = markerValue(content, policy.requiredMarkers.provenanceSource);
      const hash = markerValue(content, policy.requiredMarkers.sha256);
      if (!source) diagnostics.push(`generated schema lacks provenance source: ${entry.path}`);
      if (!/^[a-f0-9]{64}$/i.test(hash)) diagnostics.push(`generated schema lacks SHA-256 marker: ${entry.path}`);
    }
  }
  return diagnosticResult([...new Set(diagnostics)]);
}

async function main() {
  const result = await checkSchemaDrift(process.argv[2] ?? process.cwd());
  if (result.ok) console.log('schema: PASS');
  else {
    for (const diagnostic of result.diagnostics) console.error(`schema: ${diagnostic}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
