const path = require('path');

// Server configuration: everything below is resolved once, when this module
// loads, and never changes afterwards. Nothing here touches the filesystem.

// Directory holding the JSON data files. Override with the DATA_DIR env var
// (relative paths resolve against the current working directory).
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '..', 'data');

// Port the API listens on (used by server.js).
const PORT = Number(process.env.PORT || 3000);

// The built Angular app, served as static files with an index.html fallback.
const browserDir = path.join(__dirname, '..', '..', 'dist', 'atcp-song-dashboard', 'browser');
const browserIndexPath = path.join(browserDir, 'index.html');

// Data files. Each one has its own owner and its own read/write rules
// (see docs/server-restructure-plan.md).
const dbPath = path.join(DATA_DIR, 'db.json');
const tasksPath = path.join(DATA_DIR, 'tasks.json');
const onboardingCsvPath = path.join(DATA_DIR, 'custom.csv');
const onboardingJsonPath = path.join(DATA_DIR, 'custom-onboarding.json');
const testBenchDir = path.join(DATA_DIR, 'test_bwd');
const fruitsDbPath = path.join(testBenchDir, 'db.json');

module.exports = {
  DATA_DIR,
  PORT,
  browserDir,
  browserIndexPath,
  dbPath,
  tasksPath,
  onboardingCsvPath,
  onboardingJsonPath,
  testBenchDir,
  fruitsDbPath,
};
