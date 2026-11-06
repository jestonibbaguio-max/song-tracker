// Data access for the fruits test bench. Delegates to the file repository,
// which owns test_bwd/db.json and its own load fallback and next-id rule.
const fruitsFile = require('../../persistence/fruits-file.repository');

function load() {
  return fruitsFile.loadFruitsDb();
}

function save(db) {
  fruitsFile.saveFruitsDb(db);
}

function nextId(fruits) {
  return fruitsFile.fruitsNextId(fruits);
}

module.exports = { load, save, nextId };
