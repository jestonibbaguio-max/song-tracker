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
const path = require('node:path');
const express = require('express');
const { startTestServer, loadFreshApp, SERVER_DIR } = require('../../helpers/test-server');

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

  test('a relative DATA_DIR resolves against the working directory', async (t) => {
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
  });
});
