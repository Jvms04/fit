import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { diagnosticResult, pathExists, readText } from './governance-utils.mjs';

const EXPECTED_ROWS = [
  ['Product', '5', 'Approved Product Baseline 1.0', '2026-09-03', '00bb67ad06339524c4f0aac3c5fc0f3fb2bc445da8e6945b3b9fdf8633fbe7e2', '106 requirements (56/36/12/2); 23 flows; 14 acceptance groups; 30 PD'],
  ['Architecture', '6', 'Approved Architecture Baseline 1.0', '2026-09-04', '90b3eee328e55b318c0f8c3ae240981a48cf2bc9684cf15bc7147f415839181c', '10 AD-C; 8 UX-S; 32 INV; 10 FC; 38 AD-BL; 7 SP'],
  ['Technical Architecture', '10', 'Approved Technical Architecture Baseline 1.0', '2026-09-04', '4d3e1fe6ccbcc25c84d38bee548be1e32f797a31b771f66826b12402f2f5bb3b', 'inherited: 38 AD-BL; 7 SP; 32 INV; 10 FC; 10 AD-C; 8 UX-S; 30 PD; 23 flows; 14 acceptances'],
  ['Stack', '10', 'Approved Stack Baseline 1.0', '2026-09-04', '8f84f4946235abbb9e8ca4d1fdea1c13c6b81913ffda389c93edc478cd87006a', '38 AD-BL; 25 VAL; 7 SP; 22 Selected; 12 Selected with validation gate; 2 Blocked by external evidence; 2 Deferred by horizon'],
  ['Implementation', '10', 'Approved Implementation Plan Baseline 1.0', '2026-09-04', 'e85593bcb986e54f02d1b919a83582f5bd923d4a3cd9c47f672c0dede13c0601', '106 requirements (56/36/12/2); 23 flows; 14 acceptances; 38 AD-BL; 25 VAL; 7 SP; 16 increments; 44 WP; 24 IPD']
];

const EXPECTED_TOKENS = EXPECTED_ROWS.flat();

function parseTableRows(content) {
  return content.split(/\r?\n/)
    .filter((line) => /^\|/.test(line))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim().replace(/^`|`$/g, '')))
    .filter((row) => row[0] && !/^baseline$/i.test(row[0]) && !/^:?-{3,}:?$/.test(row[0]));
}

export async function checkBaselineManifest(root = process.cwd()) {
  const manifestPath = resolve(root, 'docs/baselines/MANIFEST.md');
  if (!(await pathExists(manifestPath))) return diagnosticResult(['missing baseline manifest: docs/baselines/MANIFEST.md']);
  const content = await readText(root, 'docs/baselines/MANIFEST.md');
  const diagnostics = [];
  for (const token of EXPECTED_TOKENS) {
    if (!content.includes(token)) diagnostics.push(`baseline manifest token missing: ${token}`);
  }
  const rows = parseTableRows(content);
  if (rows.length !== EXPECTED_ROWS.length) diagnostics.push(`baseline manifest must contain exactly ${EXPECTED_ROWS.length} baseline rows; found ${rows.length}`);
  for (const expected of EXPECTED_ROWS) {
    const actual = rows.find((row) => row[0] === expected[0]);
    if (!actual || actual.length !== expected.length || expected.some((value, index) => actual[index] !== value)) {
      diagnostics.push(`baseline manifest row altered or missing: ${expected[0]}`);
    }
  }
  return diagnosticResult([...new Set(diagnostics)]);
}

async function main() {
  const result = await checkBaselineManifest(process.argv[2] ?? process.cwd());
  if (result.ok) console.log('baseline-manifest: PASS');
  else {
    for (const diagnostic of result.diagnostics) console.error(`baseline-manifest: ${diagnostic}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
