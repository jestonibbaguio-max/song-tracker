// Legacy tasks (tasks.json). Every call re-reads the file; a read can write it
// (the seed task when it's missing or unreadable, bug H3). Bugs L2 and L7 are kept.
const repository = require('./legacy-tasks.repository');

function getTasks() {
  return repository.load([
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
  repository.save(tasks);
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
  repository.save(tasks);
  return task;
}

function deleteTask(id) {
  const tasks = getTasks();
  const remaining = tasks.filter((item) => Number(item.id) !== id);
  repository.save(remaining);
  return remaining.length !== tasks.length;
}

// ── Request-level operations (input parsing and validation) ──────────────────
// body is req.body exactly as Express parsed it (possibly undefined).

/** { error } when the title is missing (nothing read or written), otherwise { task }. */
function createTask(body) {
  const title = String(body?.title || '').trim();
  const status = String(body?.status || 'open').trim() || 'open';

  if (!title) {
    return { error: 'title is required' };
  }

  return { task: addTask({ title, status }) };
}

/** { error } when title or status is blank (nothing read or written), otherwise { task } (null when the id is unknown). */
function editTask(id, body) {
  const title = body?.title === undefined ? null : String(body.title).trim();
  const status = body?.status === undefined ? null : String(body.status).trim();

  if (title === '' || status === '') {
    return { error: 'title and status cannot be empty' };
  }

  return { task: updateTask(id, { title, status }) };
}

module.exports = {
  getTasks,
  addTask,
  updateTask,
  deleteTask,
  createTask,
  editTask
};
