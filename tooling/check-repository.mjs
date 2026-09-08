import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { diagnosticResult, pathExists, readJson, walkRepository } from './governance-utils.mjs';

const MANDATORY_PATHS = [
  'README.md',
  '.gitignore',
  '.github/CODEOWNERS',
  '.github/workflows/governance.yml',
  'docs/baselines/MANIFEST.md',
  'docs/evidence/INDEX.md',
  'docs/governance/BOUNDARIES.md',
  'docs/governance/CODEX_EXECUTION_PACKET_TEMPLATE.md',
  'docs/governance/DECISION_TEMPLATE.md',
  'docs/governance/VAL_EVIDENCE_TEMPLATE.md',
  'tooling/policies/boundaries.json',
  'tooling/policies/schema-source.json',
  'tooling/governance-utils.mjs',
  'tooling/check-repository.mjs',
  'tooling/check-boundaries.mjs',
  'tooling/check-schema-drift.mjs',
  'tooling/check-baseline-manifest.mjs',
  'tooling/run-governance-checks.mjs',
  'tooling/tests/governance.test.mjs',
  'package.json',
  'package-lock.json'
];

const ENVIRONMENT_FILE = /^\.env(?:\..+)?$/i;
const DOCUMENTED_ENVIRONMENT_FILE = /^\.env(?:\.[a-z0-9_-]+)?\.example(?:\.[a-z0-9_-]+)?$/i;
const KEY_OR_CERTIFICATE_FILE = /\.(?:pem|key|p12|pfx|crt|cer|der|csr|jks|keystore)$/i;
const KEY_BASENAME = /^(?:id_(?:rsa|dsa|ecdsa|ed25519)|authorized_keys|known_hosts)(?:\..*)?$/i;
const DATABASE_FILE = /\.(?:sqlite|sqlite3|sqlitedb|db|mdb)(?:[-.]?(?:wal|shm))?$/i;
const SECRET_FILE = /(?:^|[._-])(?:secret|secrets|credential|credentials|password|passwd|token|tokens|apikey|api-key|service-account)(?:[._-]|$)/i;

function artifactDiagnostic(entryPath) {
  const name = basename(entryPath);
  const segments = entryPath.split('/');
  if (ENVIRONMENT_FILE.test(name) && !DOCUMENTED_ENVIRONMENT_FILE.test(name)) {
    return `forbidden environment artifact: ${entryPath}`;
  }
  if (KEY_OR_CERTIFICATE_FILE.test(name) || KEY_BASENAME.test(name)) {
    return `forbidden key or certificate artifact: ${entryPath}`;
  }
  if (DATABASE_FILE.test(name)) return `forbidden database artifact: ${entryPath}`;
  if (SECRET_FILE.test(name) || segments.slice(0, -1).some((segment) => /^(?:secrets?|credentials?)$/i.test(segment))) {
    return `forbidden secret artifact: ${entryPath}`;
  }
  return null;
}

export async function checkRepository(root = process.cwd()) {
  const absoluteRoot = resolve(root);
  const diagnostics = [];
  for (const requiredPath of MANDATORY_PATHS) {
    if (!(await pathExists(resolve(absoluteRoot, requiredPath)))) {
      diagnostics.push(`missing mandatory WP-001 path: ${requiredPath}`);
    }
  }

  const policyPath = resolve(absoluteRoot, 'tooling/policies/boundaries.json');
  if (!(await pathExists(policyPath))) return diagnosticResult(diagnostics);
  const policy = await readJson(policyPath);
  const { entries, symlinks, missingRoot } = await walkRepository(absoluteRoot);
  if (missingRoot) diagnostics.push(`repository root does not exist: ${absoluteRoot}`);
  for (const link of symlinks) diagnostics.push(`repository symlink is not permitted during governance scan: ${link}`);

  const futureRoots = Object.keys(policy.futureRoots ?? {});
  for (const entry of entries) {
    const segments = entry.path.split('/');
    if (segments.some((segment) => segment.toLowerCase() === 'shared')) {
      const sharedPath = segments.slice(0, segments.findIndex((segment) => segment.toLowerCase() === 'shared') + 1).join('/');
      diagnostics.push(`generic shared name is prohibited: ${sharedPath}`);
    }
    for (const futureRoot of futureRoots) {
      if (entry.path === futureRoot || entry.path.startsWith(`${futureRoot}/`)) {
        diagnostics.push(`future root is not born in ${policy.currentWp}: ${futureRoot}`);
      }
    }
    if (entry.type !== 'file') continue;
    const diagnostic = artifactDiagnostic(entry.path);
    if (diagnostic) diagnostics.push(diagnostic);
  }
  return diagnosticResult([...new Set(diagnostics)]);
}

async function main() {
  const result = await checkRepository(process.argv[2] ?? process.cwd());
  if (result.ok) console.log('repository: PASS');
  else {
    for (const diagnostic of result.diagnostics) console.error(`repository: ${diagnostic}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
