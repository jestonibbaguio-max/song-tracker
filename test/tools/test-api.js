#!/usr/bin/env node
// Runs the API tests against one storage backend: npm run test:api:sqlite.
//
//   node test/tools/test-api.js <json|sqlite> [extra node --test flags]
//
// It only sets PERSISTENCE for the test processes (test/helpers/backend.js),
// so it works the same in every shell, cmd.exe included.
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const [backend, ...flags] = process.argv.slice(2);
if (!['json', 'sqlite'].includes(backend)) {
  console.error('usage: node test/tools/test-api.js <json|sqlite> [node --test flags]');
  process.exit(2);
}

const result = spawnSync(process.execPath, ['--test', ...flags, 'test/**/*.test.js'], {
  cwd: path.resolve(__dirname, '..', '..'),
  env: { ...process.env, PERSISTENCE: backend },
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
