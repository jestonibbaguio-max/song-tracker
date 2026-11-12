#!/usr/bin/env node
// Runs the API tests: npm run test:api, and npm run test:api:update (which
// passes --test-update-snapshots).
//
//   node test/tools/test-api.js [extra node --test flags]
//
// SQLite is the only backend since Phase 8 of docs/sqlite-migration-plan.md,
// so every test runs and none is skipped for its backend. That makes
// --test-update-snapshots safe: node rewrites each snapshot file from the
// tests that ran, so a skipped test's entries would be lost.
//
// The script passes the test glob to node itself, so it works the same in
// every shell, cmd.exe included.
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const result = spawnSync(process.execPath, ['--test', ...process.argv.slice(2), 'test/**/*.test.js'], {
  cwd: path.resolve(__dirname, '..', '..'),
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
