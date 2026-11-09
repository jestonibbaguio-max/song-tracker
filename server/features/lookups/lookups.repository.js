// Read-only lookup collections in db.json. load() goes through the db.json file
// repository; the other functions are pure reads of the loaded db object.
const dbFile = require('../../persistence/json/db-file.repository');

function load() {
  return dbFile.loadDb();
}

function attendanceOptions(db) {
  return db['attendance-options'] || [];
}

function officeLocations(db) {
  return db['office-locations'] || [];
}

function plannerLabels(db) {
  return db['planner-labels'] || [];
}

module.exports = { load, attendanceOptions, officeLocations, plannerLabels };
