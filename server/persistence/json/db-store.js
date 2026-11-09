// The unit of work for the db.json feature stores.
//
// read(fn)  loads db.json once and calls fn(session). Nothing is saved.
// write(fn) loads db.json once, calls fn(session), and saves once, but only if
//           an operation on the session changed something. If fn throws,
//           nothing is saved.
//
// That keeps today's "one load and at most one save per request" exactly
// (pinned by test/api/guardrails/fs-trace.test.js), however many operations a
// service runs on the session.
//
// openSession(db, changed) builds the feature's operations on the loaded db
// object; every operation that modifies db must call changed().
const { loadDb, saveDb } = require('./db-file.repository');

function createDbStore(openSession) {
  function read(fn) {
    const db = loadDb();
    return fn(openSession(db, () => {
      throw new Error('a read() session cannot change db.json; use write()');
    }));
  }

  function write(fn) {
    const db = loadDb();
    let isChanged = false;
    const result = fn(openSession(db, () => { isChanged = true; }));
    if (isChanged) saveDb(db);
    return result;
  }

  return { read, write };
}

module.exports = { createDbStore };
