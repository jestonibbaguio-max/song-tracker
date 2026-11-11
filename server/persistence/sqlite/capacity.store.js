// The capacity_entries table. An entry is found by (sprintName, eid)
// compared by value and type, as === did on db.json: sprint_name and eid are
// ANY columns, so 1 and "1" are different keys (decision of 2026-11-10).
const { prepare } = require('./connection');
const { spec, fromColumns, bindValue } = require('./tables');
const { createSqliteStore, selectWhere, insertRow, updateRow } = require('./sqlite-store');

const COLUMNS = spec('capacity-entries').columns;
const column = (api) => COLUMNS.find((c) => c.api === api);

function find(sprintName, eid) {
  const record = prepare('SELECT * FROM capacity_entries WHERE sprint_name = ? AND eid = ?')
    .get(bindValue('capacity-entries', column('sprintName'), sprintName), bindValue('capacity-entries', column('eid'), eid));
  return record ? fromColumns('capacity-entries', record) : undefined;
}

module.exports = createSqliteStore((changed) => ({
  /**
   * Every entry, or only those whose sprintName is exactly sprintName (when it
   * isn't undefined): same value and type, as === did, so the text "1" doesn't
   * match a numeric 1, and null matches nothing.
   */
  listEntries({ sprintName } = {}) {
    return selectWhere('capacity-entries', sprintName === undefined ? [] : [['sprint_name', sprintName]]);
  },

  /** The stored entry for (sprintName, eid), or undefined. */
  findEntry(sprintName, eid) {
    return find(sprintName, eid);
  },

  /** Assigns changes onto the stored entry for (sprintName, eid) and returns it (undefined when there is none). */
  updateEntry(sprintName, eid, changes) {
    const existing = find(sprintName, eid);
    if (!existing) return undefined;
    changed();
    Object.assign(existing, changes);
    updateRow('capacity-entries', existing);
    return existing;
  },

  /** Stores { id, ...fields } with the next id and returns it. */
  insertEntry(fields) {
    changed();
    return { id: insertRow('capacity-entries', fields), ...fields };
  },
}));
