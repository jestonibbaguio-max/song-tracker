// The planner tables: boards, buckets, tasks and deletion logs. The list
// operations make boardId/bucketId numbers with Number(), as the JSON store
// did before Phase 8, so a task or bucket stored with a null boardId lists
// with boardId 0, while the write that stored it returned null.
const { numericId } = require('../../utils/ids');
const { createSqliteStore, selectAll, selectWhere, selectOne, insertRow, updateRow, deleteRow } = require('./sqlite-store');

// board_id as the list operations return it: Number() of the stored value,
// where NULL (a NaN written by the service) and an infinity (read back as
// null) both list as 0. Filters compare this, so ?boardId=0 matches them, as
// the JS filter on the listed rows did.
const LISTED_BOARD_ID = 'CASE WHEN board_id IS NULL OR abs(board_id) = 9e999 THEN 0 ELSE board_id END';

module.exports = createSqliteStore((changed) => ({
  // ── Boards ─────────────────────────────────────────────────────────────────

  /** Every board, or those of one groupNumber (when it isn't undefined), with id and groupNumber as numbers. */
  listBoards({ groupNumber } = {}) {
    return selectWhere('planner-boards', groupNumber === undefined ? [] : [['group_number', groupNumber]]).map(b => ({ ...b, id: Number(b.id), groupNumber: Number(b.groupNumber) }));
  },

  // ── Buckets ────────────────────────────────────────────────────────────────

  /** Every bucket, or those of one boardId (when it isn't undefined), with id and boardId as numbers. */
  listBuckets({ boardId } = {}) {
    return selectWhere('planner-buckets', boardId === undefined ? [] : [[LISTED_BOARD_ID, boardId]]).map(b => ({ ...b, id: Number(b.id), boardId: Number(b.boardId) }));
  },

  /** Stores { id, ...fields } with the next id and returns it. */
  insertBucket(fields) {
    changed();
    return { id: insertRow('planner-buckets', fields), ...fields };
  },

  // ── Tasks ──────────────────────────────────────────────────────────────────

  /** Every task, or those of one boardId (when it isn't undefined), with id, boardId, bucketId and the label ids as numbers. */
  listTasks({ boardId } = {}) {
    return selectWhere('planner-tasks', boardId === undefined ? [] : [[LISTED_BOARD_ID, boardId]]).map(t => ({
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

  /**
   * Every deletion log, or only those whose deletedByEid is exactly
   * deletedByEid (when it isn't undefined): same value and type, as ===
   * did; null matches nothing.
   */
  listDeletionLogs({ deletedByEid } = {}) {
    return selectWhere('deletion-logs', deletedByEid === undefined ? [] : [['deleted_by_eid', deletedByEid]]);
  },

  /** Stores { ...body, id, ...serverFields } with the next id and returns it. */
  insertDeletionLog(body, serverFields) {
    changed();
    const id = insertRow('deletion-logs', { ...body, ...serverFields });
    return { ...body, id, ...serverFields };
  },
}));
