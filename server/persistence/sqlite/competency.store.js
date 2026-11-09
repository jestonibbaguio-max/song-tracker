// The competency_records table, keyed by eid (the SQLite counterpart of
// persistence/json/competency.store.js). Rows are listed in insertion order
// (rowid), as they were appended to db.json.
const { createSqliteStore, selectAll, selectOne, insertRow, updateRow } = require('./sqlite-store');

module.exports = createSqliteStore((changed) => ({
  /** Every saved row. */
  listRecords() {
    return selectAll('competency-records', 'rowid');
  },

  /**
   * Merges body into the row for eid, or appends { eid, ...body }. Returns
   * the row for eid afterwards.
   */
  upsertRecord(eid, body) {
    changed();
    const stored = selectOne('competency-records', 'eid', eid);
    if (!stored) {
      insertRow('competency-records', { eid, ...body });
      return { eid, ...body };
    }
    const record = { ...stored, ...body };
    updateRow('competency-records', record, 'eid');
    return record;
  },
}));
