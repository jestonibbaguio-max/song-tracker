const service = require('./legacy-tasks.service');

function listTasks(req, res) {
  res.json(service.getTasks());
}

function createTask(req, res) {
  const result = service.createTask(req.body);
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }
  return res.status(201).json(result.task);
}

function updateTask(req, res) {
  const result = service.editTask(Number(req.params.id), req.body);
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }
  if (!result.task) {
    return res.status(404).json({ error: 'task not found' });
  }
  return res.json(result.task);
}

// Unknown ids answer 200 { deleted: false } and still rewrite the file (bug L7).
function deleteTask(req, res) {
  const deleted = service.deleteTask(Number(req.params.id));
  res.json({ deleted });
}

module.exports = { listTasks, createTask, updateTask, deleteTask };
