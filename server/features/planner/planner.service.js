// Planner boards, buckets, tasks and deletion logs. Each call runs in one
// read() or write() of the planner store (one read session, or one transaction). Task
// and deletion-log writes store only their collection's fields, as sent;
// other fields, and a client's id or timestamps, are dropped (M12, storage
// part). There are still no referential checks or validation: bugs L3, L12,
// M1, M11 and the validation part of M12 in docs/found-bugs.md are kept.
const repository = require('./planner.repository');
const { pickWritable, inColumnOrder, rowsInColumnOrder } = require('../../utils/fields');
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
    const boards = store.listBoards(groupNumber === undefined ? {} : { groupNumber: Number(groupNumber) });
    return rowsInColumnOrder('planner-boards', boards);
  });
}

// ── Buckets ──────────────────────────────────────────────────────────────────

/** boardId is the raw query value (undefined when absent). */
function listBuckets(boardId) {
  return repository.read((store) => {
    const buckets = store.listBuckets(boardId === undefined ? {} : { boardId: Number(boardId) });
    return rowsInColumnOrder('planner-buckets', buckets);
  });
}

/** { error } when boardId or name is missing (nothing read or written), otherwise { bucket }. */
function createBucket({ boardId, name, order }) {
  if (!boardId || !name) return { error: 'boardId and name are required' };
  return repository.write((store) => ({
    bucket: inColumnOrder('planner-buckets', store.insertBucket({ boardId: Number(boardId), name: String(name).trim(), order: Number(order) || 0 }))
  }));
}

// ── Tasks ────────────────────────────────────────────────────────────────────

/** boardId is the raw query value (undefined when absent). */
function listTasks(boardId) {
  return repository.read((store) => {
    const tasks = store.listTasks(boardId === undefined ? {} : { boardId: Number(boardId) });
    return rowsInColumnOrder('planner-tasks', tasks);
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
    return inColumnOrder('planner-tasks', store.insertTask(withNumericLabels(pickWritable('planner-tasks', body)), {
      boardId: Number(body.boardId),
      bucketId: Number(body.bucketId),
      createdAt: now,
      updatedAt: now
    }));
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
    return inColumnOrder('planner-tasks', store.updateTask(id, changes, { updatedAt: new Date().toISOString() }));
  });
}

/** false when the id is unknown (nothing written). */
function deleteTask(id) {
  return repository.write((store) => store.removeTask(id));
}

// ── Deletion logs ────────────────────────────────────────────────────────────

/**
 * eid is the raw query value; falsy means no filter. A log matches when its
 * deletedByEid === the query value; a repeated parameter (an array) matches
 * nothing, so it's passed as null.
 */
function listDeletionLogs(eid) {
  return repository.read((store) => {
    const logs = store.listDeletionLogs(eid ? { deletedByEid: typeof eid === 'string' ? eid : null } : {});
    return rowsInColumnOrder('deletion-logs', logs);
  });
}

/** body is req.body as parsed; its deletion-log fields are stored, then the new id and deletedAt. */
function createDeletionLog(body) {
  return repository.write((store) => inColumnOrder('deletion-logs',
    store.insertDeletionLog(pickWritable('deletion-logs', body), { deletedAt: new Date().toISOString() })));
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
