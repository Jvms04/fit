import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkRepository } from './check-repository.mjs';
import { checkBoundaries } from './check-boundaries.mjs';
import { checkSchemaDrift } from './check-schema-drift.mjs';
import { checkBaselineManifest } from './check-baseline-manifest.mjs';

const CHECKS = [
  ['repository', checkRepository],
  ['boundaries', checkBoundaries],
  ['schema', checkSchemaDrift],
  ['baseline-manifest', checkBaselineManifest]
];

export async function runGovernanceChecks(root = process.cwd(), { quiet = false } = {}) {
  const results = [];
  for (const [name, check] of CHECKS) {
    const result = await check(root);
    results.push({ name, ...result });
    if (!quiet) console.log(`${name}: ${result.ok ? 'PASS' : `FAIL (${result.diagnostics.length})`}`);
    if (!quiet && !result.ok) for (const diagnostic of result.diagnostics) console.error(`  ${diagnostic}`);
  }
  return { ok: results.every((result) => result.ok), diagnostics: results.flatMap((result) => result.diagnostics), results };
}

async function main() {
  const result = await runGovernanceChecks(process.argv[2] ?? process.cwd());
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
