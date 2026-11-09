// The sprints and sprint-retros collections in db.json. load()/save() go through
// the db.json file repository; the rest are pure functions on the loaded db
// object. The *Of() getters return the stored array itself (or a new [] when the
// collection is missing), and set*() assigns it back, so a missing collection is
// added at the end of db.json, as before.
const dbFile = require('../../persistence/db-file.repository');

function load() {
  return dbFile.loadDb();
}

function save(db) {
  dbFile.saveDb(db);
}

function sprintsOf(db) {
  return db['sprints'] || [];
}

function setSprints(db, sprints) {
  db['sprints'] = sprints;
}

function retrosOf(db) {
  return db['sprint-retros'] || [];
}

function setRetros(db, items) {
  db['sprint-retros'] = items;
}

module.exports = { load, save, sprintsOf, setSprints, retrosOf, setRetros };
