// The attendance table. Records are stored as the service hands them over:
// every field is optional, and kept with its type.
const { createSqliteStore, selectWhere, selectOne, insertRow, updateRow, deleteRow } = require('./sqlite-store');

module.exports = createSqliteStore((changed) => ({
  /**
   * Every record, or only those whose year and month are the given numbers
   * (each filter applies when it isn't undefined). A stored value matches as
   * Number() of it did when the service filtered in JS: js_number()
   * (connection.js) converts text such as "2026" or "0x7EA", a missing field
   * matches nothing, and an infinite one (read back as null) counts as 0.
   */
  listRecords({ year, month } = {}) {
    const conditions = [];
    if (year !== undefined) conditions.push(['js_number(year)', year]);
    if (month !== undefined) conditions.push(['js_number(month)', month]);
    return selectWhere('attendance', conditions);
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
