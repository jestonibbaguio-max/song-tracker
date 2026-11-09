// The attendance collection in db.json. load()/save() go through the db.json
// file repository; recordsOf()/setRecords() are pure functions on the loaded db
// object (the stored array itself, or a new [] when missing).
const dbFile = require('../../persistence/json/db-file.repository');

function load() {
  return dbFile.loadDb();
}

function save(db) {
  dbFile.saveDb(db);
}

function recordsOf(db) {
  return db['attendance'] || [];
}

function setRecords(db, records) {
  db['attendance'] = records;
}

module.exports = { load, save, recordsOf, setRecords };
