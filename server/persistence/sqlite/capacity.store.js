// The capacity_entries table (the SQLite counterpart of
// persistence/json/capacity.store.js). An entry is found by (sprintName, eid)
// compared by value and type, as === does on db.json: sprint_name and eid are
// ANY columns, so 1 and "1" are different keys (decision of 2026-11-10).
const { prepare } = require('./connection');
const { spec, fromColumns, bindValue } = require('./tables');
const { createSqliteStore, selectAll, insertRow, updateRow } = require('./sqlite-store');

const COLUMNS = spec('capacity-entries').columns;
const column = (api) => COLUMNS.find((c) => c.api === api);

function find(sprintName, eid) {
  const record = prepare('SELECT * FROM capacity_entries WHERE sprint_name = ? AND eid = ?')
    .get(bindValue('capacity-entries', column('sprintName'), sprintName), bindValue('capacity-entries', column('eid'), eid));
  return record ? fromColumns('capacity-entries', record) : undefined;
}

module.exports = createSqliteStore((changed) => ({
  /** Every entry (no filtering). */
  listEntries() {
    return selectAll('capacity-entries');
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
