// Planner boards, buckets, tasks and deletion logs. Each call runs in one
// read() or write() of the planner store (one load, at most one save). Task
// and deletion-log writes store only their collection's fields, as sent;
// other fields, and a client's id or timestamps, are dropped (M12, storage
// part). There are still no referential checks or validation: bugs L3, L12,
// M1, M11 and the validation part of M12 in docs/found-bugs.md are kept.
const repository = require('./planner.repository');
const { pickWritable } = require('../../utils/fields');
const { numericId } = require('../../utils/ids');

/** A task's label ids as numbers ("5" → 5), as they're stored and returned (L16). */
function withNumericLabels(fields) {
  if (Array.isArray(fields.labels)) fields.labels = fields.labels.map(numericId);
  return fields;
}

// ── Boards ───────────────────────────────────────────────────────────────────

/** groupNumber is the raw query value (undefined when absent). */
function listBoards(groupNumber) {
  return repository.read((store) => {
    let boards = store.listBoards();
    if (groupNumber !== undefined) {
      const gn = Number(groupNumber);
      boards = boards.filter(b => b.groupNumber === gn);
    }
    return boards;
  });
}

// ── Buckets ──────────────────────────────────────────────────────────────────

/** boardId is the raw query value (undefined when absent). */
function listBuckets(boardId) {
  return repository.read((store) => {
    let buckets = store.listBuckets();
    if (boardId !== undefined) {
      const bid = Number(boardId);
      buckets = buckets.filter(b => b.boardId === bid);
    }
    return buckets;
  });
}

/** { error } when boardId or name is missing (nothing read or written), otherwise { bucket }. */
function createBucket({ boardId, name, order }) {
  if (!boardId || !name) return { error: 'boardId and name are required' };
  return repository.write((store) => ({
    bucket: store.insertBucket({ boardId: Number(boardId), name: String(name).trim(), order: Number(order) || 0 })
  }));
}

// ── Tasks ────────────────────────────────────────────────────────────────────

/** boardId is the raw query value (undefined when absent). */
function listTasks(boardId) {
  return repository.read((store) => {
    let tasks = store.listTasks();
    if (boardId !== undefined) {
      const bid = Number(boardId);
      tasks = tasks.filter(t => t.boardId === bid);
    }
    return tasks;
  });
}

/**
 * body is req.body as parsed. Stores the body's task fields, then the server's
 * id, numeric boardId/bucketId and timestamps. With no body, reading
 * body.boardId throws after the load, as before (bug M1).
 */
function createTask(body) {
  return repository.write((store) => {
    const now = new Date().toISOString();
    return store.insertTask(withNumericLabels(pickWritable('planner-tasks', body)), {
      boardId: Number(body.boardId),
      bucketId: Number(body.bucketId),
      createdAt: now,
      updatedAt: now
    });
  });
}

/**
 * Merges the body's task fields over the stored task (comments and checklists
 * included). null when the id is unknown; the body is only read once the task
 * is found.
 */
function updateTask(id, body) {
  return repository.write((store) => {
    if (!store.findTask(id)) return null;
    const changes = withNumericLabels(pickWritable('planner-tasks', body));
    if (changes.boardId !== undefined) changes.boardId = Number(changes.boardId);
    if (changes.bucketId !== undefined) changes.bucketId = Number(changes.bucketId);
    return store.updateTask(id, changes, { updatedAt: new Date().toISOString() });
  });
}

/** false when the id is unknown (nothing written). */
function deleteTask(id) {
  return repository.write((store) => store.removeTask(id));
}

// ── Deletion logs ────────────────────────────────────────────────────────────

/** eid is the raw query value; falsy means no filter. */
function listDeletionLogs(eid) {
  return repository.read((store) => {
    let logs = store.listDeletionLogs();
    if (eid) logs = logs.filter(l => l.deletedByEid === eid);
    return logs;
  });
}

/** body is req.body as parsed; its deletion-log fields are stored, then the new id and deletedAt. */
function createDeletionLog(body) {
  return repository.write((store) => store.insertDeletionLog(pickWritable('deletion-logs', body), { deletedAt: new Date().toISOString() }));
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
