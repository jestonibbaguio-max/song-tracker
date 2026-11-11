// The planner tables: boards, buckets, tasks and deletion logs. The list
// operations make boardId/bucketId numbers with Number(), as the JSON store
// did before Phase 8, so a task or bucket stored with a null boardId lists
// with boardId 0, while the write that stored it returned null.
const { numericId } = require('../../utils/ids');
const { createSqliteStore, selectAll, selectOne, insertRow, updateRow, deleteRow } = require('./sqlite-store');

module.exports = createSqliteStore((changed) => ({
  // ── Boards ─────────────────────────────────────────────────────────────────

  /** Every board, with id and groupNumber as numbers. */
  listBoards() {
    return selectAll('planner-boards').map(b => ({ ...b, id: Number(b.id), groupNumber: Number(b.groupNumber) }));
  },

  // ── Buckets ────────────────────────────────────────────────────────────────

  /** Every bucket, with id and boardId as numbers. */
  listBuckets() {
    return selectAll('planner-buckets').map(b => ({ ...b, id: Number(b.id), boardId: Number(b.boardId) }));
  },

  /** Stores { id, ...fields } with the next id and returns it. */
  insertBucket(fields) {
    changed();
    return { id: insertRow('planner-buckets', fields), ...fields };
  },

  // ── Tasks ──────────────────────────────────────────────────────────────────

  /** Every task, with id, boardId, bucketId and the label ids as numbers. */
  listTasks() {
    return selectAll('planner-tasks').map(t => ({
      ...t,
      id: Number(t.id),
      boardId: Number(t.boardId),
      bucketId: Number(t.bucketId),
      ...(Array.isArray(t.labels) ? { labels: t.labels.map(numericId) } : {}),
    }));
  },

  /** A copy of the stored task, or null. */
  findTask(id) {
    return selectOne('planner-tasks', 'id', id);
  },

  /** Stores { ...body, id, ...serverFields } with the next id and returns it. */
  insertTask(body, serverFields) {
    changed();
    const id = insertRow('planner-tasks', { ...body, ...serverFields });
    return { ...body, id, ...serverFields };
  },

  /** Replaces the stored task with { ...stored, ...changes, id, updatedAt }; null when the id is unknown. */
  updateTask(id, changes, { updatedAt }) {
    const stored = selectOne('planner-tasks', 'id', id);
    if (!stored) return null;
    changed();
    const task = { ...stored, ...changes, id, updatedAt };
    updateRow('planner-tasks', task);
    return task;
  },

  /** false when the id is unknown. */
  removeTask(id) {
    changed();
    return deleteRow('planner-tasks', 'id', id);
  },

  // ── Deletion logs ──────────────────────────────────────────────────────────

  /** Every deletion log (no filtering). */
  listDeletionLogs() {
    return selectAll('deletion-logs');
  },

  /** Stores { ...body, id, ...serverFields } with the next id and returns it. */
  insertDeletionLog(body, serverFields) {
    changed();
    const id = insertRow('deletion-logs', { ...body, ...serverFields });
    return { ...body, id, ...serverFields };
  },
}));
