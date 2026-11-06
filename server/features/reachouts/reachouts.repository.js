// The project-reachouts collection in db.json. load()/save() go through the
// db.json file repository; rowsOf()/setRows() are pure functions on the loaded
// db object (the stored array itself, or a new [] when missing).
const dbFile = require('../../persistence/db-file.repository');

function load() {
  return dbFile.loadDb();
}

function save(db) {
  dbFile.saveDb(db);
}

function rowsOf(db) {
  return db['project-reachouts'] || [];
}

function setRows(db, rows) {
  db['project-reachouts'] = rows;
}

module.exports = { load, save, rowsOf, setRows };
