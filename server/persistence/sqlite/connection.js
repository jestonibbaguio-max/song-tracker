// The SQLite database behind PERSISTENCE=sqlite (docs/sqlite-migration-plan.md).
//
// Loading this module opens nothing: the database is opened on the first
// getDb() call, i.e. by the first query, and stays open until close(). Opening
// sets the pragmas and brings the schema up to date (migrations.js).
//
// prepare(sql) caches prepared statements on the open connection. That caches
// SQL, never data: every call still runs its statement against the file.
const Database = require('better-sqlite3');
const { sqlitePath } = require('../../config');
const { migrate } = require('./migrations');

let db = null;
let statements = null;

/** Sets the pragmas every connection uses (decision 9: no foreign keys). */
function configure(database) {
  database.pragma('journal_mode = WAL');
  database.pragma('busy_timeout = 5000');
  database.pragma('foreign_keys = OFF');
  return database;
}

/** The open connection, opening it (and migrating the schema) on first use. */
function getDb() {
  if (!db) {
    const opened = configure(new Database(sqlitePath, { verbose: traceHook }));
    try {
      migrate(opened);
    } catch (error) {
      opened.close();
      throw error;
    }
    db = opened;
    statements = new Map();
  }
  return db;
}

/** A prepared statement for sql on the open connection. */
function prepare(sql) {
  const database = getDb();
  let statement = statements.get(sql);
  if (!statement) {
    statement = database.prepare(sql);
    statements.set(sql, statement);
  }
  return statement;
}

/** Closes the connection if it is open. The next getDb() opens it again. */
function close() {
  if (db) {
    const open = db;
    db = null;
    statements = null;
    open.close();
  }
}

// ── Statement tracing (test/api/guardrails/sqlite-trace.test.js) ─────────────
// better-sqlite3 calls `verbose` with every statement it runs. A tracer set
// here receives them; with none set, the hook does nothing.

let tracer = null;

function traceHook(sql) {
  if (tracer) tracer(sql);
}

/** Sets (or, with null, clears) the function that receives every statement run. */
function setTracer(fn) {
  tracer = fn;
}

module.exports = { getDb, prepare, close, configure, setTracer };
