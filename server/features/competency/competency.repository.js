// The competency-records collection in db.json. load()/save() go through the
// db.json file repository; recordsOf()/setRecords() are pure functions on the
// loaded db object (the stored array itself, or a new [] when missing).
const dbFile = require('../../persistence/db-file.repository');

function load() {
  return dbFile.loadDb();
}

function save(db) {
  dbFile.saveDb(db);
}

function recordsOf(db) {
  return db['competency-records'] || [];
}

function setRecords(db, records) {
  db['competency-records'] = records;
}

module.exports = { load, save, recordsOf, setRecords };
