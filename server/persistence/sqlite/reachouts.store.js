// The project_reachouts table. group_number is always written, null when the
// reachout has no group.
const { createSqliteStore, selectWhere, selectOne, insertRow, updateRow, deleteRow } = require('./sqlite-store');

module.exports = createSqliteStore((changed) => ({
  /**
   * Every row, or only those whose groupNumber reads as the text group (when
   * it isn't undefined), as String(groupNumber) did: a row with no group
   * reads as "null".
   */
  listRows({ group } = {}) {
    return selectWhere('project-reachouts', group === undefined ? [] : [["IFNULL(CAST(group_number AS TEXT), 'null')", group]]);
  },

  /** A copy of the stored row, or null. */
  findRow(id) {
    return selectOne('project-reachouts', 'id', id);
  },

  /** Stores { id, ...fields } with the next id and returns it. */
  insertRow(fields) {
    changed();
    return { id: insertRow('project-reachouts', fields), ...fields };
  },

  /** Assigns changes onto the stored row; returns it with a numeric id, or null when the id is unknown. */
  updateRow(id, changes) {
    const stored = selectOne('project-reachouts', 'id', id);
    if (!stored) return null;
    changed();
    const row = Object.assign(stored, changes);
    updateRow('project-reachouts', row);
    return { ...row, id: Number(row.id) };
  },

  /** false when the id is unknown. */
  removeRow(id) {
    changed();
    return deleteRow('project-reachouts', 'id', id);
  },
}));
