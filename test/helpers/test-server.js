// Test harness for the Express API.
//
// Every call to startTestServer() copies test/fixtures/data/ into a brand-new
// temp directory, points DATA_DIR at it (with PERSISTENCE=sqlite, also builds
// dashboard.sqlite there from the JSON), loads a fresh instance of server/app.js
// and listens on a random localhost port. Pass the node:test context (`t`) and
// cleanup (close server, restore DATA_DIR, delete the temp dir) runs automatically
// when the test finishes.
//
//   const { test } = require('node:test');
//   const { startTestServer } = require('../helpers/test-server');
//
//   test('lists sprints', async (t) => {
//     const api = await startTestServer(t);
//     const res = await api.request('GET', '/api/sprints');
//     ...
//   });
//
// Tests in one file run sequentially by default; keep it that way. DATA_DIR is
// process-wide, so running tests concurrently inside a file would race. Separate
// files run in separate processes and are safe to parallelise.
//
// Only one app can be open at a time: close() the previous one before starting
// the next. The feature repositories load their store on every call, through
// require.cache, so once a second app has loaded, the first one's requests
// would reach the second one's stores and data. startTestServer() refuses
// instead.

const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

/** The base URL of the app startTestServer() has open, or null. */
let openApp = null;

const FIXTURES_DIR = path.resolve(__dirname, '..', 'fixtures', 'data');
const SERVER_DIR = path.resolve(__dirname, '..', '..', 'server');

/**
 * Copy the fixture dataset into a new, empty temp directory and return its path.
 * With TEST_FIXTURES_DIR set (npm run test:api:exported), the dataset comes
 * from there instead: the fixtures after a round trip through SQLite
 * (test/helpers/exported-fixtures.js). FIXTURES_DIR itself always names the
 * committed fixtures.
 */
function createDataDir() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'song-tracker-data-'));
  fs.cpSync(process.env.TEST_FIXTURES_DIR || FIXTURES_DIR, dataDir, { recursive: true });
  return dataDir;
}

/**
 * The server modules resolve DATA_DIR once, at require time, so drop every cached
 * module under server/ and require app.js again. Third-party modules (express,
 * cors) stay cached.
 */
function loadFreshApp() {
  const prefix = normalise(SERVER_DIR + path.sep);
  for (const id of Object.keys(require.cache)) {
    if (normalise(id).startsWith(prefix)) delete require.cache[id];
  }
  return require(path.join(SERVER_DIR, 'app.js'));
}

function normalise(p) {
  return process.platform === 'win32' ? p.toLowerCase() : p;
}

/**
 * @param {import('node:test').TestContext} [t]  registers cleanup via t.after()
 * @param {{ beforeStart?: (dataDir: string) => void }} [options]
 *   beforeStart runs after the fixtures are copied and before the app loads,
 *   e.g. to delete custom-onboarding.json and exercise CSV seeding.
 */
async function startTestServer(t, options = {}) {
  if (openApp) {
    throw new Error(`startTestServer: the app on ${openApp} is still open; close() it before starting another (see test/helpers/test-server.js)`);
  }
  const dataDir = createDataDir();
  const previousDataDir = process.env.DATA_DIR;
  process.env.DATA_DIR = dataDir;

  let server;
  try {
    if (options.beforeStart) options.beforeStart(dataDir);
    if ((process.env.PERSISTENCE || 'json') === 'sqlite') buildDatabase(dataDir);
    const app = loadFreshApp();
    server = http.createServer(app);
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
  } catch (error) {
    closeDatabase();
    restoreDataDir(previousDataDir);
    fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 3 });
    throw error;
  }

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  openApp = baseUrl;
  let closed = false;

  async function close() {
    if (closed) return;
    closed = true;
    try {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      closeDatabase();
      restoreDataDir(previousDataDir);
      fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 3 });
    } finally {
      openApp = null;
    }
  }

  /** JSON request helper. Returns { status, headers, body } with body parsed when it is JSON. */
  async function request(method, urlPath, body) {
    const res = await fetch(baseUrl + urlPath, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const isJson = (res.headers.get('content-type') || '').includes('application/json');
    return { status: res.status, headers: res.headers, body: isJson && text ? JSON.parse(text) : text };
  }

  /** Read a data file straight from this test's temp DATA_DIR, e.g. readData('db.json'). */
  function readData(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(dataDir, relativePath), 'utf8'));
  }

  if (t && typeof t.after === 'function') t.after(close);

  return { baseUrl, dataDir, request, readData, close };
}

/**
 * PERSISTENCE=sqlite: build <dataDir>/dashboard.sqlite from the JSON files,
 * after the test's setup has edited them (docs/sqlite-migration-plan.md,
 * Phase 4 step 3). Setups keep working on the JSON; one that breaks the JSON
 * on purpose belongs to a json-only test. The import is the server's own
 * (persistence/sqlite/import.js); loadFreshApp() drops it from the module cache
 * again, with the rest of server/.
 */
function buildDatabase(dataDir) {
  const { importJson } = require(path.join(SERVER_DIR, 'persistence', 'sqlite', 'import.js'));
  importJson({ dataDir, dbPath: path.join(dataDir, 'dashboard.sqlite') });
}

/**
 * Close the SQLite connection the running app opened, if any, so its temp
 * directory can be deleted (Windows refuses to delete an open file). The
 * connection module is the one in the same module cache as the app; it's only
 * closed if the app loaded it, so a JSON run never loads better-sqlite3.
 */
function closeDatabase() {
  const connection = require.cache[SQLITE_CONNECTION] || require.cache[findCachedId(SQLITE_CONNECTION)];
  if (connection) connection.exports.close();
}

const SQLITE_CONNECTION = path.join(SERVER_DIR, 'persistence', 'sqlite', 'connection.js');

function findCachedId(file) {
  const wanted = normalise(file);
  return Object.keys(require.cache).find((id) => normalise(id) === wanted);
}

function restoreDataDir(previous) {
  if (previous === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = previous;
}

module.exports = { startTestServer, createDataDir, loadFreshApp, FIXTURES_DIR, SERVER_DIR };
