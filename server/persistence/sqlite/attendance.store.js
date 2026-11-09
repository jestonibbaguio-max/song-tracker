// The attendance table (the SQLite counterpart of
// persistence/json/attendance.store.js). Records are stored as the service
// hands them over: every field is optional, and kept with its type.
const { createSqliteStore, selectAll, selectOne, insertRow, updateRow, deleteRow } = require('./sqlite-store');

module.exports = createSqliteStore((changed) => ({
  /** Every record (no filtering). */
  listRecords() {
    return selectAll('attendance');
  },

  /** Stores { ...body, id } with the next id and returns it. */
  insertRecord(body) {
    changed();
    return { ...body, id: insertRow('attendance', body) };
  },

  /** Replaces the stored record with { ...stored, ...body, id }; null when the id is unknown. */
  updateRecord(id, body) {
    const stored = selectOne('attendance', 'id', id);
    if (!stored) return null;
    changed();
    const record = { ...stored, ...body, id };
    updateRow('attendance', record);
    return record;
  },

  /** false when the id is unknown. */
  removeRecord(id) {
    changed();
    return deleteRow('attendance', 'id', id);
  },
}));
