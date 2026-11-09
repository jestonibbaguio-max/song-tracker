const service = require('./planner.service');

// ── Boards ───────────────────────────────────────────────────────────────────

function listBoards(req, res) {
  res.json(service.listBoards(req.query.groupNumber));
}

// ── Buckets ──────────────────────────────────────────────────────────────────

function listBuckets(req, res) {
  res.json(service.listBuckets(req.query.boardId));
}

function createBucket(req, res) {
  // Destructured here, from req.body itself: with no JSON body this must keep
  // throwing "Cannot destructure property 'boardId' of 'req.body'..." (bug M1).
  const { boardId, name, order } = req.body;
  const result = service.createBucket({ boardId, name, order });
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(201).json(result.bucket);
}

// ── Tasks ────────────────────────────────────────────────────────────────────

function listTasks(req, res) {
  res.json(service.listTasks(req.query.boardId));
}

function createTask(req, res) {
  res.status(201).json(service.createTask(req.body));
}

function updateTask(req, res) {
  const task = service.updateTask(Number(req.params.id), req.body);
  if (!task) return res.status(404).json({ error: 'task not found' });
  res.json(task);
}

function deleteTask(req, res) {
  if (!service.deleteTask(Number(req.params.id))) return res.status(404).json({ error: 'task not found' });
  res.json({ deleted: true });
}

// ── Deletion logs ────────────────────────────────────────────────────────────

function listDeletionLogs(req, res) {
  res.json(service.listDeletionLogs(req.query.eid));
}

function createDeletionLog(req, res) {
  res.status(201).json(service.createDeletionLog(req.body));
}

module.exports = {
  listBoards,
  listBuckets,
  createBucket,
  listTasks,
  createTask,
  updateTask,
  deleteTask,
  listDeletionLogs,
  createDeletionLog
};
