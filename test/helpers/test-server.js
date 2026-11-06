// Test harness for the Express API.
//
// Every call to startTestServer() copies test/fixtures/data/ into a brand-new
// temp directory, points DATA_DIR at it, loads a fresh instance of server/app.js
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

const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const FIXTURES_DIR = path.resolve(__dirname, '..', 'fixtures', 'data');
const SERVER_DIR = path.resolve(__dirname, '..', '..', 'server');

/** Copy the fixture dataset into a new, empty temp directory and return its path. */
function createDataDir() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'song-tracker-data-'));
  fs.cpSync(FIXTURES_DIR, dataDir, { recursive: true });
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
  const dataDir = createDataDir();
  const previousDataDir = process.env.DATA_DIR;
  process.env.DATA_DIR = dataDir;

  let server;
  try {
    if (options.beforeStart) options.beforeStart(dataDir);
    const app = loadFreshApp();
    server = http.createServer(app);
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
  } catch (error) {
    restoreDataDir(previousDataDir);
    fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 3 });
    throw error;
  }

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  let closed = false;

  async function close() {
    if (closed) return;
    closed = true;
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    restoreDataDir(previousDataDir);
    fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 3 });
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

function restoreDataDir(previous) {
  if (previous === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = previous;
}

module.exports = { startTestServer, createDataDir, loadFreshApp, FIXTURES_DIR, SERVER_DIR };
