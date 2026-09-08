import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { checkRepository } from '../check-repository.mjs';
import { checkBoundaries } from '../check-boundaries.mjs';
import { checkSchemaDrift } from '../check-schema-drift.mjs';
import { checkBaselineManifest } from '../check-baseline-manifest.mjs';
import { runGovernanceChecks } from '../run-governance-checks.mjs';

const repositoryRoot = new URL('../..', import.meta.url).pathname;

async function write(root, relativePath, content = '') {
  const target = join(root, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'fit-governance-'));
  await cp(join(repositoryRoot, 'docs'), join(root, 'docs'), { recursive: true });
  await cp(join(repositoryRoot, 'tooling', 'policies'), join(root, 'tooling', 'policies'), { recursive: true });
  return root;
}

async function withFixture(callback) {
  const root = await fixture();
  try {
    await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('current repository passes all governance checks', async () => {
  const result = await runGovernanceChecks(repositoryRoot, { quiet: true });
  assert.deepEqual(result.diagnostics, []);
});

test('generic shared path fails with a specific diagnostic', async () => {
  await withFixture(async (root) => {
    await write(root, 'packages/shared/index.mjs');
    const result = await checkRepository(root);
    assert.ok(result.diagnostics.some((message) => message.includes('generic shared name is prohibited: packages/shared')));
  });
});

test('future root created during WP-001 fails with a specific diagnostic', async () => {
  await withFixture(async (root) => {
    await write(root, 'apps/mobile/index.mjs');
    const result = await checkRepository(root);
    assert.ok(result.diagnostics.some((message) => message.includes('future root is not born in WP-001: apps/mobile')));
  });
});

test('forbidden future domain import fails with a specific diagnostic', async () => {
  await withFixture(async (root) => {
    await write(root, 'packages/domain/index.mjs', "import React from 'react';\n");
    const result = await checkBoundaries(root);
    assert.ok(result.diagnostics.some((message) => message.includes('forbidden domain import "react"')));
  });
});

test('forbidden future domain relative infrastructure import fails specifically', async () => {
  await withFixture(async (root) => {
    await write(root, 'packages/domain/index.mjs', "import db from '../../database/local/adapter.mjs';\n");
    const result = await checkBoundaries(root);
    assert.ok(result.diagnostics.some((message) => message.includes('forbidden domain import')));
  });
});

test('forbidden future application UI SDK import fails with a specific diagnostic', async () => {
  await withFixture(async (root) => {
    await write(root, 'packages/application/index.mjs', "import { View } from 'react-native';\n");
    const result = await checkBoundaries(root);
    assert.ok(result.diagnostics.some((message) => message.includes('forbidden application import "react-native"')));
  });
});

test('forbidden future application relative mobile import fails specifically', async () => {
  await withFixture(async (root) => {
    await write(root, 'packages/application/index.mjs', "import screen from '../../apps/mobile/src/presentation/screen.mjs';\n");
    const result = await checkBoundaries(root);
    assert.ok(result.diagnostics.some((message) => message.includes('forbidden application import')));
  });
});

test('forbidden future application relative database import fails specifically', async () => {
  await withFixture(async (root) => {
    await write(root, 'packages/application/index.mjs', "import db from '../../database/local/adapter.mjs';\n");
    const result = await checkBoundaries(root);
    assert.ok(result.diagnostics.some((message) => message.includes('forbidden application import')));
  });
});

test('forbidden future application database driver import fails specifically', async () => {
  await withFixture(async (root) => {
    await write(root, 'packages/application/index.mjs', "import pg from 'pg';\n");
    const result = await checkBoundaries(root);
    assert.ok(result.diagnostics.some((message) => message.includes('forbidden application import "pg"')));
  });
});

test('forbidden future application database aliases fail specifically', async () => {
  await withFixture(async (root) => {
    await write(root, 'packages/application/index.mjs', "import localDb from '@fit/database-local';\nimport remoteDb from '@fit/database-remote/client';\n");
    const result = await checkBoundaries(root);
    assert.ok(result.diagnostics.some((message) => message.includes('forbidden application import "@fit/database-local"')));
    assert.ok(result.diagnostics.some((message) => message.includes('forbidden application import "@fit/database-remote/client"')));
  });
});

test('boundary scan rejects symlinks even when no future code root exists', async () => {
  await withFixture(async (root) => {
    const linkPath = join(root, 'tooling/external-link');
    await symlink('/tmp', linkPath);
    const result = await checkBoundaries(root);
    assert.ok(result.diagnostics.some((message) => message.includes('repository symlink is not permitted during boundary scan: tooling/external-link')));
  });
});

test('boundary import parser handles valid forms and ignores member require', async () => {
  await withFixture(async (root) => {
    await write(root, 'packages/domain/static.mjs', "import { from as value } from 'react';\n");
    await write(root, 'packages/domain/dynamic.mjs', "import('react-native');\n");
    await write(root, 'packages/domain/export.mjs', "export { from as value } from 'hono';\n");
    await write(root, 'packages/domain/commonjs.mjs', "const db = require('pg');\n");
    await write(root, 'packages/domain/member.mjs', "api.require('react');\n");
    const result = await checkBoundaries(root);
    assert.ok(result.diagnostics.some((message) => message.includes('forbidden domain import "react"')));
    assert.ok(result.diagnostics.some((message) => message.includes('forbidden domain import "react-native"')));
    assert.ok(result.diagnostics.some((message) => message.includes('forbidden domain import "hono"')));
    assert.ok(result.diagnostics.some((message) => message.includes('forbidden domain import "pg"')));
    assert.equal(result.diagnostics.some((message) => message.includes('member.mjs')), false);
  });
});

test('boundary import parser ignores member require separated by comments', async () => {
  await withFixture(async (root) => {
    await write(root, 'packages/domain/member-comments.mjs', "api./* member */require('react');\napi.// member\n  require('react-native');\n");
    const result = await checkBoundaries(root);
    assert.deepEqual(result.diagnostics, []);
  });
});

test('boundary comment masking preserves UTF-16 offsets before bare require', async () => {
  await withFixture(async (root) => {
    await write(root, 'packages/domain/unicode-bare.mjs', "const label = '😀'; /* comment */ require('react');\n");
    const result = await checkBoundaries(root);
    assert.ok(result.diagnostics.some((message) => message.includes('forbidden domain import "react"')));
  });
});

test('boundary comment masking preserves UTF-16 offsets before member require', async () => {
  await withFixture(async (root) => {
    await write(root, 'packages/domain/unicode-member.mjs', "const label = '😀'; api.// comment\n  require('react');\n");
    const result = await checkBoundaries(root);
    assert.deepEqual(result.diagnostics, []);
  });
});

test('schema source outside canonical root fails with a specific diagnostic', async () => {
  await withFixture(async (root) => {
    await write(root, 'packages/contracts/account.mjs', "const account = z.object({ id: z.string() });\n");
    const result = await checkSchemaDrift(root);
    assert.ok(result.diagnostics.some((message) => message.includes('canonical schema source outside packages/schemas: packages/contracts/account.mjs')));
  });
});

test('schema scanner ignores marker text in a string literal', async () => {
  await withFixture(async (root) => {
    await write(root, 'packages/contracts/note.mjs', `const note = 'z.object({ not: "a schema" })';\n`);
    const result = await checkSchemaDrift(root);
    assert.deepEqual(result.diagnostics, []);
  });
});

test('schema scanner ignores canonical schema examples in comments', async () => {
  await withFixture(async (root) => {
    await write(root, 'packages/contracts/comment.mjs', '// Example: z.object({ not: "a schema" })\n');
    const result = await checkSchemaDrift(root);
    assert.deepEqual(result.diagnostics, []);
  });
});

test('explicit canonical schema marker in a comment is enforced', async () => {
  await withFixture(async (root) => {
    await write(root, 'packages/contracts/marked.mjs', '// @canonical-schema\nconst value = makeSchema();\n');
    const result = await checkSchemaDrift(root);
    assert.ok(result.diagnostics.some((message) => message.includes('canonical schema source outside packages/schemas: packages/contracts/marked.mjs')));
  });
});

test('named schema artifact without schema markers fails outside generated root', async () => {
  await withFixture(async (root) => {
    await write(root, 'packages/contracts/account.schema.json', '{"type":"object"}\n');
    const result = await checkSchemaDrift(root);
    assert.ok(result.diagnostics.some((message) => message.includes('JSON Schema/OpenAPI artifact outside packages/schemas/generated: packages/contracts/account.schema.json')));
  });
});

test('conventional schema.json without markers fails outside generated root', async () => {
  await withFixture(async (root) => {
    await write(root, 'packages/contracts/schema.json', '{"type":"object"}\n');
    const result = await checkSchemaDrift(root);
    assert.ok(result.diagnostics.some((message) => message.includes('JSON Schema/OpenAPI artifact outside packages/schemas/generated: packages/contracts/schema.json')));
  });
});

test('schema source after URL regex is still detected', async () => {
  await withFixture(async (root) => {
    await write(root, 'packages/contracts/regex.mjs', 'const url = /https?:\\/\\//; const account = z.object({});\n');
    const result = await checkSchemaDrift(root);
    assert.ok(result.diagnostics.some((message) => message.includes('canonical schema source outside packages/schemas: packages/contracts/regex.mjs')));
  });
});

test('named OpenAPI artifact without markers fails outside generated root', async () => {
  await withFixture(async (root) => {
    await write(root, 'services/api/openapi.yaml', 'paths: {}\n');
    const result = await checkSchemaDrift(root);
    assert.ok(result.diagnostics.some((message) => message.includes('JSON Schema/OpenAPI artifact outside packages/schemas/generated: services/api/openapi.yaml')));
  });
});

test('generated schema without provenance and hash fails with specific diagnostics', async () => {
  await withFixture(async (root) => {
    await write(root, 'packages/schemas/generated/account.schema.json', '{"type":"object"}\n');
    const result = await checkSchemaDrift(root);
    assert.ok(result.diagnostics.some((message) => message.includes('generated schema lacks provenance source: packages/schemas/generated/account.schema.json')));
    assert.ok(result.diagnostics.some((message) => message.includes('generated schema lacks SHA-256 marker: packages/schemas/generated/account.schema.json')));
  });
});

test('secret environment and key filenames fail with specific diagnostics', async () => {
  await withFixture(async (root) => {
    await write(root, '.env.local', 'SECRET=not-a-real-secret\n');
    await write(root, 'certs/release.key');
    const result = await checkRepository(root);
    assert.ok(result.diagnostics.some((message) => message.includes('forbidden environment artifact: .env.local')));
    assert.ok(result.diagnostics.some((message) => message.includes('forbidden key or certificate artifact: certs/release.key')));
  });
});

test('altered baseline status hash and count fail with specific diagnostics', async () => {
  await withFixture(async (root) => {
    const manifestPath = join(root, 'docs/baselines/MANIFEST.md');
    const manifest = await readFile(manifestPath, 'utf8');
    await writeFile(manifestPath, manifest
      .replace('Approved Product Baseline 1.0', 'Draft Product Baseline 1.0')
      .replace('00bb67ad06339524c4f0aac3c5fc0f3fb2bc445da8e6945b3b9fdf8633fbe7e2', '0'.repeat(64))
      .replace('106 requirements (56/36/12/2)', '105 requirements (56/36/12/2)'));
    const result = await checkBaselineManifest(root);
    assert.ok(result.diagnostics.some((message) => message.includes('baseline manifest token missing: Approved Product Baseline 1.0')));
    assert.ok(result.diagnostics.some((message) => message.includes('baseline manifest token missing: 00bb67ad06339524c4f0aac3c5fc0f3fb2bc445da8e6945b3b9fdf8633fbe7e2')));
    assert.ok(result.diagnostics.some((message) => message.includes('baseline manifest token missing: 106 requirements (56/36/12/2)')));
  });
});

test('extra baseline data row fails with a specific diagnostic', async () => {
  await withFixture(async (root) => {
    const manifestPath = join(root, 'docs/baselines/MANIFEST.md');
    const manifest = await readFile(manifestPath, 'utf8');
    await writeFile(manifestPath, `${manifest}\n| Unapproved | 1 | Draft | 2026-09-08 | ${'0'.repeat(64)} | extra |\n`);
    const result = await checkBaselineManifest(root);
    assert.ok(result.diagnostics.some((message) => message.includes('baseline manifest must contain exactly 5 baseline rows; found 6')));
  });
});
