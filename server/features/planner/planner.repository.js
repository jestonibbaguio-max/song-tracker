// The planner collections in db.json: boards, buckets, tasks and deletion logs.
// load()/save() go through the db.json file repository; the rest are pure
// functions on the loaded db object. The *Of() getters return the stored array
// itself (or a new [] when the collection is missing) and set*() assigns it back.
const dbFile = require('../../persistence/db-file.repository');

function load() {
  return dbFile.loadDb();
}

function save(db) {
  dbFile.saveDb(db);
}

function boardsOf(db) {
  return db['planner-boards'] || [];
}

function bucketsOf(db) {
  return db['planner-buckets'] || [];
}

function setBuckets(db, buckets) {
  db['planner-buckets'] = buckets;
}

function tasksOf(db) {
  return db['planner-tasks'] || [];
}

function setTasks(db, tasks) {
  db['planner-tasks'] = tasks;
}

function deletionLogsOf(db) {
  return db['deletion-logs'] || [];
}

function setDeletionLogs(db, logs) {
  db['deletion-logs'] = logs;
}

module.exports = {
  load,
  save,
  boardsOf,
  bucketsOf,
  setBuckets,
  tasksOf,
  setTasks,
  deletionLogsOf,
  setDeletionLogs
};
