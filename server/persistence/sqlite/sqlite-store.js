// The unit of work for the SQLite feature stores
// (docs/sqlite-migration-plan.md, layer rules).
//
// read(fn)  calls fn(session). A session's mutating operation throws, so a
//           read can never change data.
// write(fn) runs fn(session) in one transaction (db.transaction()): every
//           change commits together, and if fn throws, none of them do.
//           It starts with BEGIN IMMEDIATE, which takes the write lock up
//           front: a write reads before it writes, and with a deferred BEGIN
//           another connection committing in between would fail it with
//           SQLITE_BUSY at once, without waiting for busy_timeout.
//
// openSession(changed) builds the feature's operations; every operation that
// modifies data calls changed() first. The statements run against the file on
// every call; nothing read is kept between calls.
const { getDb, prepare } = require('./connection');
const { spec, fromColumns, toColumns, insertSql, updateSql } = require('./tables');

function createSqliteStore(openSession) {
  function read(fn) {
    return fn(openSession(() => {
      throw new Error('a read() session cannot change the database; use write()');
    }));
  }

  function write(fn) {
    return getDb().transaction(() => fn(openSession(() => {}))).immediate();
  }

  return { read, write };
}

/** Every row of a collection as API fields, ordered by `orderBy` (a column list). */
function selectAll(collection, orderBy = 'id') {
  return prepare(`SELECT * FROM ${spec(collection).table} ORDER BY ${orderBy}`).all()
    .map((record) => fromColumns(collection, record));
}

/** The row with this key as API fields, or null. */
function selectOne(collection, key, value) {
  const record = prepare(`SELECT * FROM ${spec(collection).table} WHERE ${key} = ?`).get(value);
  return record ? fromColumns(collection, record) : null;
}

/**
 * Inserts a row and returns its id. A row without an id gets max(id)+1
 * (INTEGER PRIMARY KEY without AUTOINCREMENT, like nextId() on db.json).
 */
function insertRow(collection, row) {
  return Number(prepare(insertSql(collection)).run(toColumns(collection, row)).lastInsertRowid);
}

/** Writes every column of the row with this key (the row as a whole, as db.json saves it). */
function updateRow(collection, row, key = 'id') {
  prepare(updateSql(collection, key)).run(toColumns(collection, row));
}

/** Deletes the row with this key; false when there was none. */
function deleteRow(collection, key, value) {
  return prepare(`DELETE FROM ${spec(collection).table} WHERE ${key} = ?`).run(value).changes > 0;
}

module.exports = { createSqliteStore, selectAll, selectOne, insertRow, updateRow, deleteRow };
