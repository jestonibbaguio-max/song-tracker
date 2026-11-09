// Guardrail (docs/sqlite-migration-plan.md, Phase 1): the store interface.
//
// Services reach stored data only through a feature's store: read(fn) and
// write(fn) (persistence/json/db-store.js), picked per call from
// config.PERSISTENCE (persistence/select-store.js). The characterization and
// fs-trace snapshots pin what each route does; these tests pin the contract the
// routes rely on, so a future store (SQLite, Phase 4) can be held to it:
//   - a backend without a store fails at request time, not when the app loads;
//   - read() never saves, and a read session can't change data;
//   - write() saves exactly once if an operation changed something, else never;
//   - a write() whose callback throws saves nothing.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startTestServer, SERVER_DIR } = require('../../helpers/test-server');

process.env.NODE_ENV = 'test'; // error messages in Express error pages, as in the other guardrails

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

/** Count fs.writeFileSync calls on one file while fn runs. */
function countWrites(file, fn) {
  const original = fs.writeFileSync;
  let writes = 0;
  fs.writeFileSync = function counted(target, ...rest) {
    if (path.resolve(String(target)) === path.resolve(file)) writes += 1;
    return original.call(this, target, ...rest);
  };
  try {
    const result = fn();
    return { result, writes };
  } catch (error) {
    return { error, writes };
  } finally {
    fs.writeFileSync = original;
  }
}

/**
 * A db.json store over the test's temp DATA_DIR, from the same module cache as
 * the running app, with two operations on the sprints collection.
 */
async function sprintsDbStore(t) {
  const api = await startTestServer(t);
  const { createDbStore } = require(path.join(SERVER_DIR, 'persistence', 'json', 'db-store.js'));
  const store = createDbStore((db, changed) => ({
    count: () => db.sprints.length,
    rename(name) { db.sprints[0].name = name; changed(); },
    touchWithoutChange() {},
  }));
  return { api, store, dbFile: path.join(api.dataDir, 'db.json') };
}

describe('guardrail: store selection', () => {
  test('PERSISTENCE=sqlite loads the app, and a request to a store without a sqlite implementation fails clearly', async (t) => {
    withEnv(t, { PERSISTENCE: 'sqlite' });
    const api = await startTestServer(t);
    const res = await api.request('GET', '/api/attendance-options');
    assert.equal(res.status, 500);
    assert.match(res.body, /The lookups store has no &quot;sqlite&quot; implementation yet/);
  });

  test('PERSISTENCE=json serves from the JSON store', async (t) => {
    withEnv(t, { PERSISTENCE: 'json' });
    const api = await startTestServer(t);
    const res = await api.request('GET', '/api/attendance-options');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, api.readData('db.json')['attendance-options']);
  });
});

describe('guardrail: db.json unit of work', () => {
  test('read() never saves, and a read session cannot mark a change', async (t) => {
    const { api, store, dbFile } = await sprintsDbStore(t);
    const before = fs.readFileSync(dbFile, 'utf8');

    const counted = countWrites(dbFile, () => store.read((s) => s.count()));
    assert.equal(counted.writes, 0);
    assert.equal(counted.result, api.readData('db.json').sprints.length);

    const refused = countWrites(dbFile, () => store.read((s) => s.rename('changed in a read')));
    assert.equal(refused.writes, 0);
    assert.match(refused.error.message, /a read\(\) session cannot change db\.json/);
    assert.equal(fs.readFileSync(dbFile, 'utf8'), before, 'db.json must be untouched');
  });

  test('write() saves exactly once when an operation changed something', async (t) => {
    const { api, store, dbFile } = await sprintsDbStore(t);
    const counted = countWrites(dbFile, () => store.write((s) => { s.rename('First'); s.rename('Second'); return 'done'; }));
    assert.equal(counted.result, 'done');
    assert.equal(counted.writes, 1, 'two changes in one write() must save once');
    assert.equal(api.readData('db.json').sprints[0].name, 'Second');
  });

  test('write() never saves when nothing changed', async (t) => {
    const { store, dbFile } = await sprintsDbStore(t);
    const before = fs.readFileSync(dbFile, 'utf8');
    const counted = countWrites(dbFile, () => store.write((s) => { s.touchWithoutChange(); return s.count(); }));
    assert.equal(counted.writes, 0);
    assert.equal(fs.readFileSync(dbFile, 'utf8'), before);
  });

  test('a write() callback that throws saves nothing, even after a change', async (t) => {
    const { store, dbFile } = await sprintsDbStore(t);
    const before = fs.readFileSync(dbFile, 'utf8');
    const counted = countWrites(dbFile, () => store.write((s) => { s.rename('lost'); throw new Error('boom'); }));
    assert.equal(counted.error.message, 'boom');
    assert.equal(counted.writes, 0);
    assert.equal(fs.readFileSync(dbFile, 'utf8'), before);
  });
});
