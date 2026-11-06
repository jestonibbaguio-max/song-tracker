const { tasksPath } = require('../../config');
const { readJson, writeJson } = require('../../persistence/tasks-file.repository');

function getTasks() {
  return readJson(tasksPath, [
    {
      id: 1,
      title: 'Prepare onboarding report',
      status: 'open',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ]);
}

function nextTaskId(tasks) {
  return tasks.reduce((max, task) => Math.max(max, Number(task.id) || 0), 0) + 1;
}

function addTask(payload) {
  const tasks = getTasks();
  const task = {
    id: nextTaskId(tasks),
    title: payload.title,
    status: payload.status,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  tasks.unshift(task);
  writeJson(tasksPath, tasks);
  return task;
}

function updateTask(id, payload) {
  const tasks = getTasks();
  const task = tasks.find((item) => Number(item.id) === id);
  if (!task) {
    return null;
  }
  task.title = payload.title === null ? task.title : payload.title;
  task.status = payload.status === null ? task.status : payload.status;
  task.updated_at = new Date().toISOString();
  writeJson(tasksPath, tasks);
  return task;
}

function deleteTask(id) {
  const tasks = getTasks();
  const remaining = tasks.filter((item) => Number(item.id) !== id);
  writeJson(tasksPath, remaining);
  return remaining.length !== tasks.length;
}

module.exports = {
  getTasks,
  addTask,
  updateTask,
  deleteTask
};
