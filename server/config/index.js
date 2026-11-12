const path = require('path');

// Server configuration: everything below is resolved once, when this module
// loads, and never changes afterwards. Nothing here touches the filesystem.

// Directory holding the data: the SQLite database, the JSON seed it's built
// from, legacy tasks.json and the fruits test bench. Override with the
// DATA_DIR env var (relative paths resolve against the current working
// directory).
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '..', 'data');

// Port the API listens on (used by server.js).
const PORT = Number(process.env.PORT || 3000);

// The built Angular app, served as static files with an index.html fallback.
const browserDir = path.join(__dirname, '..', '..', 'dist', 'atcp-song-dashboard', 'browser');
const browserIndexPath = path.join(browserDir, 'index.html');

// Data files that stay on JSON (docs/sqlite-migration-plan.md, decision 10).
// Each one has its own owner and its own read/write rules
// (see docs/server-restructure-plan.md).
const tasksPath = path.join(DATA_DIR, 'tasks.json');
const testBenchDir = path.join(DATA_DIR, 'test_bwd');
const fruitsDbPath = path.join(testBenchDir, 'db.json');

// The SQLite database that holds the dashboard data. Built from the JSON seed
// (db.json and custom-onboarding.json in DATA_DIR) by `npm run db:migrate`;
// gitignored. Nothing opens it when this loads. SQLite is the only backend
// since Phase 8 of docs/sqlite-migration-plan.md, so a PERSISTENCE env var
// left over from the fallback is ignored.
const sqlitePath = path.join(DATA_DIR, 'dashboard.sqlite');

module.exports = {
  DATA_DIR,
  PORT,
  sqlitePath,
  browserDir,
  browserIndexPath,
  tasksPath,
  testBenchDir,
  fruitsDbPath,
};
