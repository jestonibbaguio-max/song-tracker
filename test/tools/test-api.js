#!/usr/bin/env node
// Runs the API tests against one storage backend: npm run test:api:sqlite,
// npm run test:api:exported.
//
//   node test/tools/test-api.js <json|sqlite> [--exported] [extra node --test flags]
//
// It only sets PERSISTENCE for the test processes (test/helpers/backend.js),
// so it works the same in every shell, cmd.exe included.
//
// --exported (docs/sqlite-migration-plan.md, Phase 5 step 2): every test's data
// comes from the fixtures after a round trip through SQLite (import, then
// export; test/helpers/exported-fixtures.js), through TEST_FIXTURES_DIR. With
// json, that proves the exported files work as the fallback: every shared test
// must pass with no snapshot change. The json-only tests are skipped, because
// they pin the committed fixture files themselves.
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const [backend, ...rest] = process.argv.slice(2);
if (!['json', 'sqlite'].includes(backend)) {
  console.error('usage: node test/tools/test-api.js <json|sqlite> [--exported] [node --test flags]');
  process.exit(2);
}
const exported = rest.includes('--exported');
const flags = rest.filter((flag) => flag !== '--exported');

const env = { ...process.env, PERSISTENCE: backend };
let fixturesDir = null;
if (exported) {
  const { createExportedFixtures } = require('../helpers/exported-fixtures');
  fixturesDir = createExportedFixtures();
  env.TEST_FIXTURES_DIR = fixturesDir;
  console.log(`# fixtures exported through SQLite to ${fixturesDir}`);
}

let result;
try {
  result = spawnSync(process.execPath, ['--test', ...flags, 'test/**/*.test.js'], {
    cwd: path.resolve(__dirname, '..', '..'),
    env,
    stdio: 'inherit',
  });
} finally {
  if (fixturesDir) fs.rmSync(fixturesDir, { recursive: true, force: true, maxRetries: 3 });
}
process.exit(result.status ?? 1);
