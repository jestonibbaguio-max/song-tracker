// Data access for the legacy tasks. Delegates to the tasks.json file repository,
// which owns the file's fallback and formatting rules.
const tasksFile = require('../../persistence/tasks-file.repository');

/** defaultValue is returned (and written to disk) when tasks.json is missing or unreadable. */
function load(defaultValue) {
  return tasksFile.readTasks(defaultValue);
}

function save(tasks) {
  tasksFile.writeTasks(tasks);
}

module.exports = { load, save };
