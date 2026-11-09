// The project-reachouts collection in db.json. Same variable names and
// expressions as the code the reachouts service ran before the store
// interface, so a non-array collection still fails with the pinned TypeError
// text (e.g. "rows.findIndex is not a function"). Rows are returned as stored;
// the service makes ids numeric.
const { createDbStore } = require('./db-store');
const { nextId } = require('../../utils/ids');

module.exports = createDbStore((db, changed) => {
  const rowsOf = () => db['project-reachouts'] || [];

  return {
    /** Every row, as stored (no filtering, ids as stored). */
    listRows() {
      return rowsOf();
    },

    /** A copy of the stored row, or null. */
    findRow(id) {
      const rows = rowsOf();
      const idx = rows.findIndex(r => Number(r.id) === id);
      return idx === -1 ? null : { ...rows[idx] };
    },

    /** Stores { id, ...fields } with the next id and returns it. */
    insertRow(fields) {
      const rows = rowsOf();
      const row = { id: nextId(rows), ...fields };
      rows.push(row);
      db['project-reachouts'] = rows;
      changed();
      return row;
    },

    /** Assigns changes onto the stored row, in their key order; returns it with a numeric id, or null when the id is unknown. */
    updateRow(id, changes) {
      const rows = rowsOf();
      const idx = rows.findIndex(r => Number(r.id) === id);
      if (idx === -1) return null;
      Object.assign(rows[idx], changes);
      db['project-reachouts'] = rows;
      changed();
      return { ...rows[idx], id: Number(rows[idx].id) };
    },

    /** false when the id is unknown. */
    removeRow(id) {
      const rows = rowsOf();
      const idx = rows.findIndex(r => Number(r.id) === id);
      if (idx === -1) return false;
      rows.splice(idx, 1);
      db['project-reachouts'] = rows;
      changed();
      return true;
    },
  };
});
