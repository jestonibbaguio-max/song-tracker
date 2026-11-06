// Planner boards, buckets, tasks and deletion logs (db.json). One load and at
// most one save per call. Writes keep storing client fields as sent, with no
// referential checks: bugs L3, L12, M1, M11 and M12 in docs/found-bugs.md are kept.
const repository = require('./planner.repository');
const { nextId } = require('../../utils/ids');

// ── Boards ───────────────────────────────────────────────────────────────────

/** groupNumber is the raw query value (undefined when absent). */
function listBoards(groupNumber) {
  const db = repository.load();
  // Inline, not repository.boardsOf(db): when the collection is not an array the TypeError
  // names this exact expression (pinned in data-shape-edges.test.js).
  let boards = (db['planner-boards'] || []).map(b => ({ ...b, id: Number(b.id), groupNumber: Number(b.groupNumber) }));
  if (groupNumber !== undefined) {
    const gn = Number(groupNumber);
    boards = boards.filter(b => b.groupNumber === gn);
  }
  return boards;
}

// ── Buckets ──────────────────────────────────────────────────────────────────

/** boardId is the raw query value (undefined when absent). */
function listBuckets(boardId) {
  const db = repository.load();
  // Inline, not repository.bucketsOf(db): when the collection is not an array the TypeError
  // names this exact expression (pinned in data-shape-edges.test.js).
  let buckets = (db['planner-buckets'] || []).map(b => ({ ...b, id: Number(b.id), boardId: Number(b.boardId) }));
  if (boardId !== undefined) {
    const bid = Number(boardId);
    buckets = buckets.filter(b => b.boardId === bid);
  }
  return buckets;
}

/** { error } when boardId or name is missing (nothing read or written), otherwise { bucket }. */
function createBucket({ boardId, name, order }) {
  if (!boardId || !name) return { error: 'boardId and name are required' };
  const db = repository.load();
  const buckets = repository.bucketsOf(db);
  const id = nextId(buckets);
  const bucket = { id, boardId: Number(boardId), name: String(name).trim(), order: Number(order) || 0 };
  buckets.push(bucket);
  repository.setBuckets(db, buckets);
  repository.save(db);
  return { bucket };
}

// ── Tasks ────────────────────────────────────────────────────────────────────

/** boardId is the raw query value (undefined when absent). */
function listTasks(boardId) {
  const db = repository.load();
  // Inline, not repository.tasksOf(db): when the collection is not an array the TypeError
  // names this exact expression (pinned in data-shape-edges.test.js).
  let tasks = (db['planner-tasks'] || []).map(t => ({
    ...t,
    id: Number(t.id),
    boardId: Number(t.boardId),
    bucketId: Number(t.bucketId),
  }));
  if (boardId !== undefined) {
    const bid = Number(boardId);
    tasks = tasks.filter(t => t.boardId === bid);
  }
  return tasks;
}

/**
 * body is req.body as parsed. Stores every client field, then the server's id,
 * numeric boardId/bucketId and timestamps. With no body, reading body.boardId
 * throws after the load, as before (bug M1).
 */
function createTask(body) {
  const db = repository.load();
  const tasks = repository.tasksOf(db);
  const now = new Date().toISOString();
  const id = nextId(tasks);
  const task = { ...body, id, boardId: Number(body.boardId), bucketId: Number(body.bucketId), createdAt: now, updatedAt: now };
  tasks.push(task);
  repository.setTasks(db, tasks);
  repository.save(db);
  return task;
}

/** Merges body over the stored task (comments and checklists included). null when the id is unknown. */
function updateTask(id, body) {
  const db = repository.load();
  const tasks = repository.tasksOf(db);
  const idx = tasks.findIndex(t => Number(t.id) === id);
  if (idx === -1) return null;
  const changes = { ...body };
  if (changes.boardId !== undefined) changes.boardId = Number(changes.boardId);
  if (changes.bucketId !== undefined) changes.bucketId = Number(changes.bucketId);
  tasks[idx] = { ...tasks[idx], ...changes, id, updatedAt: new Date().toISOString() };
  repository.setTasks(db, tasks);
  repository.save(db);
  return tasks[idx];
}

/** false when the id is unknown (nothing written). */
function deleteTask(id) {
  const db = repository.load();
  const tasks = repository.tasksOf(db);
  const idx = tasks.findIndex(t => Number(t.id) === id);
  if (idx === -1) return false;
  tasks.splice(idx, 1);
  repository.setTasks(db, tasks);
  repository.save(db);
  return true;
}

// ── Deletion logs ────────────────────────────────────────────────────────────

/** eid is the raw query value; falsy means no filter. */
function listDeletionLogs(eid) {
  const db = repository.load();
  let logs = repository.deletionLogsOf(db);
  if (eid) logs = logs.filter(l => l.deletedByEid === eid);
  return logs;
}

/** body is req.body as parsed; every field is stored, then the new id and deletedAt. */
function createDeletionLog(body) {
  const db = repository.load();
  const logs = repository.deletionLogsOf(db);
  const id = nextId(logs);
  const log = { ...body, id, deletedAt: new Date().toISOString() };
  logs.push(log);
  repository.setDeletionLogs(db, logs);
  repository.save(db);
  return log;
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
