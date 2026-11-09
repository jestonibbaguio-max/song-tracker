// The attendance collection in db.json. Same variable names and expressions as
// the code the attendance service ran before the store interface, so a
// non-array collection still fails with the pinned TypeError text (e.g.
// "records.findIndex is not a function"). Records are stored and returned as
// sent, with every client field (bugs M6 and M12 are kept).
const { createDbStore } = require('./db-store');
const { nextId } = require('../../utils/ids');

module.exports = createDbStore((db, changed) => {
  const recordsOf = () => db['attendance'] || [];

  return {
    /** Every record, as stored (no filtering). */
    listRecords() {
      return recordsOf();
    },

    /** Stores { ...body, id } with the next id and returns it. */
    insertRecord(body) {
      const records = recordsOf();
      const id = nextId(records);
      const record = { ...body, id };
      records.push(record);
      db['attendance'] = records;
      changed();
      return record;
    },

    /** Replaces the stored record with { ...stored, ...body, id }; null when the id is unknown. */
    updateRecord(id, body) {
      const records = recordsOf();
      const idx = records.findIndex(r => Number(r.id) === id);
      if (idx === -1) return null;
      records[idx] = { ...records[idx], ...body, id };
      db['attendance'] = records;
      changed();
      return records[idx];
    },

    /** false when the id is unknown. */
    removeRecord(id) {
      const records = recordsOf();
      const idx = records.findIndex(r => Number(r.id) === id);
      if (idx === -1) return false;
      records.splice(idx, 1);
      db['attendance'] = records;
      changed();
      return true;
    },
  };
});
