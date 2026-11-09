// The capacity-entries collection in db.json. load()/save() go through the
// db.json file repository; entriesOf()/setEntries() are pure functions on the
// loaded db object (the stored array itself, or a new [] when missing).
const dbFile = require('../../persistence/json/db-file.repository');

function load() {
  return dbFile.loadDb();
}

function save(db) {
  dbFile.saveDb(db);
}

function entriesOf(db) {
  return db['capacity-entries'] || [];
}

function setEntries(db, entries) {
  db['capacity-entries'] = entries;
}

module.exports = { load, save, entriesOf, setEntries };
