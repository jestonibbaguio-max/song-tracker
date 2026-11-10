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
const { backendSkip, jsonOnly } = require('../../helpers/backend');

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
  // Phase 4 replaced "a request to a store without a sqlite implementation
  // fails clearly": every store has one now. selectStore still fails clearly
  // for a backend a store doesn't implement, at request time, not on load.
  test('every feature store has a json and a sqlite implementation', () => {
    const { selectStore } = require(path.join(SERVER_DIR, 'persistence', 'select-store.js'));
    const config = require(path.join(SERVER_DIR, 'config', 'index.js'));
    const features = ['lookups', 'sprints', 'capacity', 'attendance', 'planner', 'reachouts', 'competency', 'onboarding'];
    for (const feature of features) {
      for (const backend of ['json', 'sqlite']) {
        const file = path.join(SERVER_DIR, 'persistence', backend, `${feature}.store.js`);
        assert.ok(fs.existsSync(file), `missing ${path.relative(SERVER_DIR, file)}`);
      }
      const source = fs.readFileSync(path.join(SERVER_DIR, 'features', feature, `${feature}.repository.js`), 'utf8');
      assert.match(source, /sqlite: \(\) => require\('\.\.\/\.\.\/persistence\/sqlite\//, `${feature}.repository.js doesn't pick the sqlite store`);
    }

    const store = selectStore('example', ['read'], { json: () => ({ read: () => 'json' }) });
    const previous = config.PERSISTENCE;
    config.PERSISTENCE = 'sqlite';
    try {
      assert.throws(() => store.read(), { message: 'The example store has no "sqlite" implementation yet (docs/sqlite-migration-plan.md)' });
    } finally {
      config.PERSISTENCE = previous;
    }
  });

  for (const backend of ['json', 'sqlite']) {
    test(`PERSISTENCE=${backend} serves from the ${backend} store`, async (t) => {
      withEnv(t, { PERSISTENCE: backend });
      const api = await startTestServer(t);
      const res = await api.request('GET', '/api/attendance-options');
      assert.equal(res.status, 200);
      // The rows in the fixture's db.json, with ids as numbers ("1" → 1, bug L16).
      const stored = api.readData('db.json')['attendance-options'].map((o) => ({ ...o, id: Number(o.id) }));
      assert.deepEqual(res.body, stored);
    });
  }
});

describe('guardrail: db.json unit of work', { skip: jsonOnly('the db.json store') }, () => {
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

// The SQLite counterpart of the db.json unit of work above
// (persistence/sqlite/sqlite-store.js): read() can't change the database, and
// write() is one transaction that commits everything or nothing.
describe('guardrail: SQLite unit of work', { skip: backendSkip('sqlite', 'the SQLite store') }, () => {
  const NEW_SPRINT = { name: 'Unit of work', start: '2026-03-02', end: '2026-03-13' };

  test('a read() session cannot change the database, and runs no write', async (t) => {
    const { store, statements, names, before } = await sqliteSprintsStore(t);

    assert.equal(store.read((s) => s.listSprints().length), before.length);
    assert.throws(() => store.read((s) => s.insertSprint(NEW_SPRINT)), { message: 'a read() session cannot change the database; use write()' });
    assert.throws(() => store.read((s) => s.removeSprint(1)), { message: 'a read() session cannot change the database; use write()' });

    assert.deepEqual(statements().filter((sql) => !/^SELECT /i.test(sql)), [], 'a read runs only SELECTs');
    assert.deepEqual(names(), before);
  });

  test('write() commits every change in one transaction', async (t) => {
    const { store, statements, names, before } = await sqliteSprintsStore(t);

    const result = store.write((s) => {
      s.insertSprint({ ...NEW_SPRINT, name: 'First' });
      s.insertSprint({ ...NEW_SPRINT, name: 'Second' });
      return 'done';
    });

    assert.equal(result, 'done');
    const run = statements();
    assert.equal(run.filter((sql) => /^BEGIN\b/.test(sql)).length, 1, 'one BEGIN');
    assert.equal(run.filter((sql) => sql === 'COMMIT').length, 1, 'one COMMIT');
    assert.match(run[0], /^BEGIN\b/);
    assert.equal(run.at(-1), 'COMMIT');
    assert.deepEqual(names(), [...before, 'First', 'Second']);
  });

  test('a write() callback that throws after a change rolls everything back', async (t) => {
    const { store, statements, names, before } = await sqliteSprintsStore(t);

    assert.throws(() => store.write((s) => {
      s.insertSprint({ ...NEW_SPRINT, name: 'Lost' });
      s.removeSprint(1);
      throw new Error('boom');
    }), { message: 'boom' });

    const run = statements();
    assert.ok(run.some((sql) => /^INSERT /i.test(sql)), 'the insert ran before the throw');
    assert.equal(run.at(-1), 'ROLLBACK');
    assert.ok(!run.includes('COMMIT'));
    assert.deepEqual(names(), before);
  });

  test('a statement that fails inside write() rolls back the ones before it', async (t) => {
    const { store, names, before } = await sqliteSprintsStore(t);

    assert.throws(() => store.write((s) => {
      s.insertSprint({ ...NEW_SPRINT, name: 'Lost' });
      s.insertSprint({ ...NEW_SPRINT, name: true }); // L18: a boolean can't be bound
    }), TypeError);

    assert.deepEqual(names(), before);
  });
});

/**
 * The SQLite sprints store of the running app (the same module cache, so the
 * same connection), the stored sprint names (now as `before`, and later
 * through names(), a fresh read()), and the statements run since the last
 * statements() call, starting after `before` was read.
 */
async function sqliteSprintsStore(t) {
  await startTestServer(t);
  const store = require(path.join(SERVER_DIR, 'persistence', 'sqlite', 'sprints.store.js'));
  const connection = require(path.join(SERVER_DIR, 'persistence', 'sqlite', 'connection.js'));
  const names = () => store.read((s) => s.listSprints().map((sprint) => sprint.name));
  const before = names(); // also opens the connection, so the statements traced below are the test's own
  const run = [];
  connection.setTracer((sql) => run.push(sql));
  t.after(() => connection.setTracer(null));
  return { store, names, before, statements: () => run.splice(0) };
}

// Competency rows have no id: GET joins them by eid, so no response shows
// their order, but the stores keep it (db.json's array order; on SQLite, the
// seq column) and the Phase 5 export writes them in it.
describe('guardrail: competency rows keep their insertion order', { skip: backendSkip() }, () => {
  test('new eids are appended, and updating a row doesn\'t move it', async (t) => {
    const api = await startTestServer(t);
    const fixtureOrder = api.readData('db.json')['competency-records'].map((row) => row.eid);
    const store = require(path.join(SERVER_DIR, 'features', 'competency', 'competency.repository.js'));
    const eids = () => store.read((s) => s.listRecords().map((row) => row.eid));

    assert.deepEqual(eids(), fixtureOrder);
    for (const [eid, body] of [['zz.new', { notes: 'z' }], ['aa.new', { notes: 'a' }], [fixtureOrder[0], { notes: 'moved?' }]]) {
      assert.equal((await api.request('PATCH', '/api/competency-records/' + eid, body)).status, 200, eid);
    }
    assert.deepEqual(eids(), [...fixtureOrder, 'zz.new', 'aa.new']);
  });
});
