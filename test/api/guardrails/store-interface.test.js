// Guardrail (docs/sqlite-migration-plan.md, Phase 1): the store interface.
//
// Services reach stored data only through a feature's store: read(fn) and
// write(fn) (persistence/sqlite/sqlite-store.js). The characterization and
// sqlite-trace snapshots pin what each route does; these tests pin the
// contract the routes rely on:
//   - every feature repository is its SQLite store (Phase 8 removed the
//     per-call switch between the JSON and SQLite stores);
//   - a read() session can't change the database, and runs no write;
//   - write() is one transaction that commits everything or nothing.
// The db.json unit of work and the store switch were tested here too, until
// Phase 8 deleted them with the JSON backend.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { startTestServer, SERVER_DIR } = require('../../helpers/test-server');

process.env.NODE_ENV = 'test'; // error messages in Express error pages, as in the other guardrails

describe('guardrail: store selection', () => {
  test('every feature repository is its SQLite store', async (t) => {
    await startTestServer(t);
    const features = ['lookups', 'sprints', 'capacity', 'attendance', 'planner', 'reachouts', 'competency', 'onboarding'];
    for (const feature of features) {
      const repository = require(path.join(SERVER_DIR, 'features', feature, `${feature}.repository.js`));
      const store = require(path.join(SERVER_DIR, 'persistence', 'sqlite', `${feature}.store.js`));
      assert.equal(repository, store, `${feature}.repository.js exports persistence/sqlite/${feature}.store.js`);
    }
  });
});

// The SQLite unit of work
// (persistence/sqlite/sqlite-store.js): read() can't change the database, and
// write() is one transaction that commits everything or nothing.
describe('guardrail: SQLite unit of work', () => {
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
// their order, but the store keeps it (the seq column), as db.json's array
// order did.
describe('guardrail: competency rows keep their insertion order', () => {
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
