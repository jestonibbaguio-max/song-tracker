// Guardrail 1 (docs/server-restructure-plan.md, step 0): pin the real paths.
//
// The characterization snapshots treat "dist/ served" and "dist/ missing" as
// the same outcome, and every test sets DATA_DIR. So a wrong __dirname-relative
// path after moving code into server/config/ would pass the whole suite. These
// tests pin, independently of where the code lives:
//   - the default data directory (DATA_DIR unset) is <repo>/server/data
//   - a relative DATA_DIR resolves against the current working directory
//   - /test serves <DATA_DIR>/test_bwd
//   - the SPA is served from <repo>/dist/atcp-song-dashboard/browser
//
// They observe the paths by wrapping express.static and res.sendFile, which
// work wherever those calls end up, and by fetching the real built files when
// dist/ exists. Nothing here reads or writes the real server/data directory:
// the default-DATA_DIR test only loads the app and makes no requests, and
// fails if loading touches server/data at all.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const express = require('express');
const { startTestServer, loadFreshApp, createDataDir, SERVER_DIR } = require('../../helpers/test-server');
const { backendSkip } = require('../../helpers/backend');

const REPO_ROOT = path.resolve(SERVER_DIR, '..');
const REAL_DATA_DIR = path.join(REPO_ROOT, 'server', 'data');
const REAL_BROWSER_DIR = path.join(REPO_ROOT, 'dist', 'atcp-song-dashboard', 'browser');
const REAL_INDEX = path.join(REAL_BROWSER_DIR, 'index.html');
const DIST_BUILT = fs.existsSync(REAL_INDEX);
const CONFIG_MODULE = path.join(SERVER_DIR, 'config', 'index.js');

const samePath = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
const assertSamePath = (actual, expected, message) =>
  assert.ok(samePath(path.resolve(actual), path.resolve(expected)), `${message}\n  actual:   ${actual}\n  expected: ${expected}`);

/**
 * Record the root of every express.static() call and the path of every
 * res.sendFile() call made while the test runs. Install before the app loads.
 */
function spyOnStaticServing(t) {
  const staticRoots = [];
  const sentFiles = [];
  const originalStatic = express.static;
  const originalSendFile = express.response.sendFile;

  express.static = function spiedStatic(root, ...rest) {
    staticRoots.push(path.resolve(root));
    return originalStatic.call(this, root, ...rest);
  };
  express.response.sendFile = function spiedSendFile(filePath, ...rest) {
    sentFiles.push(path.resolve(filePath));
    return originalSendFile.call(this, filePath, ...rest);
  };
  t.after(() => {
    express.static = originalStatic;
    express.response.sendFile = originalSendFile;
  });
  return { staticRoots, sentFiles };
}

/** Run fn while recording every fs call whose path argument is inside `dir`. */
function recordFsCallsUnder(dir, fn) {
  const calls = [];
  const names = Object.keys(fs).filter((name) => typeof fs[name] === 'function' && /^[a-z]/.test(name));
  const originals = new Map(names.map((name) => [name, fs[name]]));
  const inside = (arg) => {
    if (typeof arg !== 'string' && !(arg instanceof URL) && !Buffer.isBuffer(arg)) return false;
    const p = path.resolve(arg instanceof URL ? arg.pathname : String(arg));
    const root = path.resolve(dir);
    return samePath(p, root) || samePath(p.slice(0, root.length + 1), root + path.sep);
  };
  for (const name of names) {
    const original = originals.get(name);
    fs[name] = Object.assign(function recorded(...args) {
      if (args.slice(0, 2).some(inside)) calls.push(`fs.${name}(${String(args[0])})`);
      return original.apply(this, args);
    }, original); // keeps properties such as fs.realpathSync.native
  }
  try {
    return { result: fn(), calls };
  } finally {
    for (const [name, original] of originals) fs[name] = original;
  }
}

describe('guardrail: real paths', () => {
  test('default DATA_DIR is <repo>/server/data, and loading the app touches nothing in it', (t) => {
    const spies = spyOnStaticServing(t);
    const previous = process.env.DATA_DIR;
    delete process.env.DATA_DIR;
    t.after(() => {
      if (previous === undefined) delete process.env.DATA_DIR;
      else process.env.DATA_DIR = previous;
    });

    const { calls } = recordFsCallsUnder(REAL_DATA_DIR, () => loadFreshApp());

    assert.deepEqual(calls, [], 'loading the app must not read or write the data directory');
    assert.equal(spies.staticRoots.length, 2, `expected two static mounts, got ${JSON.stringify(spies.staticRoots)}`);
    assertSamePath(spies.staticRoots[0], path.join(REAL_DATA_DIR, 'test_bwd'), '/test static root with DATA_DIR unset');
    assertSamePath(spies.staticRoots[1], REAL_BROWSER_DIR, 'dist static root with DATA_DIR unset');
  });

  test('a relative DATA_DIR resolves against the working directory', { skip: backendSkip() }, async (t) => {
    const spies = spyOnStaticServing(t);
    let relative;
    const api = await startTestServer(t, {
      beforeStart(dataDir) {
        relative = path.relative(process.cwd(), dataDir);
        assert.ok(!path.isAbsolute(relative), 'temp dir must be reachable by a relative path for this test');
        process.env.DATA_DIR = relative;
      },
    });

    assertSamePath(spies.staticRoots[0], path.join(api.dataDir, 'test_bwd'), `/test static root for DATA_DIR=${relative}`);
    const sprints = await api.request('GET', '/api/sprints');
    assert.equal(sprints.status, 200);
    assert.deepEqual(sprints.body.map((s) => s.name), ['Sprint 1', 'Sprint 2', 'Sprint 3']);
  });

  test('/test serves <DATA_DIR>/test_bwd, and the SPA comes from <repo>/dist/atcp-song-dashboard/browser', async (t) => {
    const spies = spyOnStaticServing(t);
    const api = await startTestServer(t);

    assert.equal(spies.staticRoots.length, 2, `expected two static mounts, got ${JSON.stringify(spies.staticRoots)}`);
    assertSamePath(spies.staticRoots[0], path.join(api.dataDir, 'test_bwd'), '/test static root');
    assertSamePath(spies.staticRoots[1], REAL_BROWSER_DIR, 'dist static root');

    const fruitsFile = await fetch(api.baseUrl + '/test/db.json');
    assert.equal(fruitsFile.status, 200);
    assert.equal(await fruitsFile.text(), fs.readFileSync(path.join(api.dataDir, 'test_bwd', 'db.json'), 'utf8'));

    const spa = await fetch(api.baseUrl + '/some/client/route');
    const spaBody = await spa.text();
    assert.equal(spies.sentFiles.length, 1, 'the GET fallback should call res.sendFile once');
    assertSamePath(spies.sentFiles[0], REAL_INDEX, 'GET fallback file');
    if (DIST_BUILT) {
      assert.equal(spa.status, 200);
      assert.equal(spaBody, fs.readFileSync(REAL_INDEX, 'utf8'), 'GET fallback should send the built index.html');
    } else {
      assert.equal(spa.status, 404);
      assert.ok(spaBody.includes('ENOENT') && spaBody.includes('index.html'), 'GET fallback should 404 on the missing index.html');
    }
  });

  test('a built dist/ asset is served byte-for-byte', { skip: !DIST_BUILT && 'dist/ is not built (run npm run build)' }, async (t) => {
    const api = await startTestServer(t);
    const asset = fs.readdirSync(REAL_BROWSER_DIR).find((name) => name !== 'index.html' && fs.statSync(path.join(REAL_BROWSER_DIR, name)).isFile());
    assert.ok(asset, 'dist/ has no file besides index.html');

    const res = await fetch(api.baseUrl + '/' + encodeURIComponent(asset));
    assert.equal(res.status, 200);
    assert.ok(Buffer.from(await res.arrayBuffer()).equals(fs.readFileSync(path.join(REAL_BROWSER_DIR, asset))), `/${asset} differs from the built file`);
  });

  test('server/config exports the same paths', { skip: !fs.existsSync(CONFIG_MODULE) && 'server/config/ does not exist yet (created in step 1)' }, (t) => {
    const previous = process.env.DATA_DIR;
    delete process.env.DATA_DIR;
    t.after(() => {
      if (previous === undefined) delete process.env.DATA_DIR;
      else process.env.DATA_DIR = previous;
    });
    loadFreshApp(); // clears server/ from require.cache so config re-reads DATA_DIR
    const config = require(CONFIG_MODULE);
    assertSamePath(config.browserDir, REAL_BROWSER_DIR, 'config.browserDir');
    assertSamePath(config.DATA_DIR, REAL_DATA_DIR, 'config.DATA_DIR with DATA_DIR unset');
    assertSamePath(config.sqlitePath, path.join(REAL_DATA_DIR, 'dashboard.sqlite'), 'config.sqlitePath with DATA_DIR unset');
  });
});

// docs/sqlite-migration-plan.md, Phase 0: the PERSISTENCE setting and the SQLite path.
describe('guardrail: persistence backend setting', () => {
  /** Set (or, with undefined, unset) env vars for this test only. */
  function withEnv(t, vars) {
    const previous = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
    for (const [key, value] of Object.entries(vars)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    t.after(() => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
  }

  /** A fresh copy of config/index.js for the current env. */
  function freshConfig() {
    loadFreshApp(); // clears server/ from require.cache, then loads app.js (and config) again
    return require(CONFIG_MODULE);
  }

  // Phase 6 (the cutover) made sqlite the default; json is the fallback.
  test('PERSISTENCE defaults to sqlite', (t) => {
    withEnv(t, { PERSISTENCE: undefined });
    assert.equal(freshConfig().PERSISTENCE, 'sqlite');
  });

  test('an empty PERSISTENCE also means sqlite', (t) => {
    withEnv(t, { PERSISTENCE: '' });
    assert.equal(freshConfig().PERSISTENCE, 'sqlite');
  });

  test('PERSISTENCE=json is accepted', (t) => {
    withEnv(t, { PERSISTENCE: 'json' });
    assert.equal(freshConfig().PERSISTENCE, 'json');
  });

  test('PERSISTENCE=sqlite is accepted', (t) => {
    withEnv(t, { PERSISTENCE: 'sqlite' });
    assert.equal(freshConfig().PERSISTENCE, 'sqlite');
  });

  test('an unknown PERSISTENCE value stops the app from loading', (t) => {
    withEnv(t, { PERSISTENCE: 'SQLite' });
    assert.throws(() => loadFreshApp(), { message: 'PERSISTENCE must be one of json, sqlite; got "SQLite"' });
  });

  test('sqlitePath is <DATA_DIR>/dashboard.sqlite', (t) => {
    const dataDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'song-tracker-config-'));
    t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
    withEnv(t, { DATA_DIR: dataDir });
    assertSamePath(freshConfig().sqlitePath, path.join(dataDir, 'dashboard.sqlite'), 'config.sqlitePath');
  });

  // Phase 4 replaced "loading the app with PERSISTENCE=sqlite creates no
  // database file": the harness now builds dashboard.sqlite before the app
  // loads, so the file's absence no longer says anything. The rule itself is
  // that nothing opens the database until the first query.
  test('loading the app with PERSISTENCE=sqlite opens no database until the first query', (t) => {
    const dataDir = createDataDir();
    withEnv(t, { PERSISTENCE: 'sqlite', DATA_DIR: dataDir });
    const { importJson } = require(path.join(SERVER_DIR, 'persistence', 'sqlite', 'import.js'));
    importJson({ dataDir, dbPath: path.join(dataDir, 'dashboard.sqlite') });
    const opened = spyOnDatabaseConstructor(t);
    let connection;
    t.after(() => {
      if (connection) connection.close();
      fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 3 });
    });

    loadFreshApp();
    assert.deepEqual(opened, [], 'loading the app must not open the database');

    connection = require(path.join(SERVER_DIR, 'persistence', 'sqlite', 'connection.js'));
    assert.deepEqual(opened, [], 'loading connection.js must not open the database');

    connection.getDb();
    connection.getDb();
    assert.equal(opened.length, 1, 'the first query opens the database, and later ones reuse it');
    assertSamePath(opened[0], path.join(dataDir, 'dashboard.sqlite'), 'the database file');
  });

  // An empty database created on the fly would hide the missing data, and a
  // later import would refuse to overwrite it.
  test('with PERSISTENCE=sqlite and no database file, requests fail and create none', async (t) => {
    const dataDir = createDataDir();
    withEnv(t, { PERSISTENCE: 'sqlite', DATA_DIR: dataDir });
    const server = http.createServer(loadFreshApp());
    t.after(async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 3 });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    for (const [method, urlPath, body] of [
      ['GET', '/api/onboarding-resources'],
      ['GET', '/api/sprints'],
      ['POST', '/api/sprints', { name: 'S', start: '2026-01-05', end: '2026-01-16' }],
    ]) {
      const res = await fetch(baseUrl + urlPath, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      assert.equal(res.status, 500, `${method} ${urlPath}`);
      assert.match(await res.text(), /No SQLite database at /, `${method} ${urlPath}`);
    }
    assert.deepEqual(fs.readdirSync(dataDir).filter((name) => name.includes('.sqlite')), [], 'no database file is created');
  });
});

/**
 * Record the path of every better-sqlite3 Database opened while the test runs,
 * by swapping the cached module's export for a recording subclass. server/
 * modules are reloaded by loadFreshApp(), but better-sqlite3 stays cached, so
 * they get the recording one.
 */
function spyOnDatabaseConstructor(t) {
  const id = require.resolve('better-sqlite3');
  require(id);
  const cached = require.cache[id];
  const Original = cached.exports;
  const opened = [];
  class Recording extends Original {
    constructor(filename, ...rest) {
      opened.push(filename);
      super(filename, ...rest);
    }
  }
  cached.exports = Recording;
  t.after(() => { cached.exports = Original; });
  return opened;
}
