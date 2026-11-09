// The planner collections in db.json: boards, buckets, tasks and deletion logs.
//
// Same variable names and expressions as the code the planner service ran
// before the store interface, so a non-array collection still fails with the
// pinned TypeError text, e.g. "(db.planner-tasks || []).map is not a function"
// or "tasks.findIndex is not a function". Tasks and deletion logs keep every
// client field (bug M12), in the same key order as before.
const { createDbStore } = require('./db-store');
const { nextId } = require('../../utils/ids');

module.exports = createDbStore((db, changed) => {
  const bucketsOf = () => db['planner-buckets'] || [];
  const tasksOf = () => db['planner-tasks'] || [];
  const deletionLogsOf = () => db['deletion-logs'] || [];

  return {
    // ── Boards ───────────────────────────────────────────────────────────────

    /** Every board, with id and groupNumber as numbers. */
    listBoards() {
      return (db['planner-boards'] || []).map(b => ({ ...b, id: Number(b.id), groupNumber: Number(b.groupNumber) }));
    },

    // ── Buckets ──────────────────────────────────────────────────────────────

    /** Every bucket, with id and boardId as numbers. */
    listBuckets() {
      return (db['planner-buckets'] || []).map(b => ({ ...b, id: Number(b.id), boardId: Number(b.boardId) }));
    },

    /** Stores { id, ...fields } with the next id and returns it. */
    insertBucket(fields) {
      const buckets = bucketsOf();
      const id = nextId(buckets);
      const bucket = { id, ...fields };
      buckets.push(bucket);
      db['planner-buckets'] = buckets;
      changed();
      return bucket;
    },

    // ── Tasks ────────────────────────────────────────────────────────────────

    /** Every task, with id, boardId and bucketId as numbers. */
    listTasks() {
      return (db['planner-tasks'] || []).map(t => ({
        ...t,
        id: Number(t.id),
        boardId: Number(t.boardId),
        bucketId: Number(t.bucketId),
      }));
    },

    /** A copy of the stored task, or null. */
    findTask(id) {
      const tasks = tasksOf();
      const idx = tasks.findIndex(t => Number(t.id) === id);
      return idx === -1 ? null : { ...tasks[idx] };
    },

    /** Stores { ...body, id, ...serverFields } with the next id and returns it. */
    insertTask(body, serverFields) {
      const tasks = tasksOf();
      const id = nextId(tasks);
      const task = { ...body, id, ...serverFields };
      tasks.push(task);
      db['planner-tasks'] = tasks;
      changed();
      return task;
    },

    /** Replaces the stored task with { ...stored, ...changes, id, updatedAt }; null when the id is unknown. */
    updateTask(id, changes, { updatedAt }) {
      const tasks = tasksOf();
      const idx = tasks.findIndex(t => Number(t.id) === id);
      if (idx === -1) return null;
      tasks[idx] = { ...tasks[idx], ...changes, id, updatedAt };
      db['planner-tasks'] = tasks;
      changed();
      return tasks[idx];
    },

    /** false when the id is unknown. */
    removeTask(id) {
      const tasks = tasksOf();
      const idx = tasks.findIndex(t => Number(t.id) === id);
      if (idx === -1) return false;
      tasks.splice(idx, 1);
      db['planner-tasks'] = tasks;
      changed();
      return true;
    },

    // ── Deletion logs ────────────────────────────────────────────────────────

    /** Every deletion log, as stored (no filtering). */
    listDeletionLogs() {
      return deletionLogsOf();
    },

    /** Stores { ...body, id, ...serverFields } with the next id and returns it. */
    insertDeletionLog(body, serverFields) {
      const logs = deletionLogsOf();
      const id = nextId(logs);
      const log = { ...body, id, ...serverFields };
      logs.push(log);
      db['deletion-logs'] = logs;
      changed();
      return log;
    },
  };
});
