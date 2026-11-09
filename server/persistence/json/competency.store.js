// The competency-records collection in db.json, keyed by eid (rows have no id).
// Same variable names and expressions as the code the competency service ran
// before the store interface, so a non-array collection still fails with the
// pinned TypeError text (e.g. "records.findIndex is not a function"). Rows are
// stored with the fields the service hands over.
const { createDbStore } = require('./db-store');

module.exports = createDbStore((db, changed) => {
  const recordsOf = () => db['competency-records'] || [];

  return {
    /** Every saved row, as stored. */
    listRecords() {
      return recordsOf();
    },

    /**
     * Merges body into the row for eid (exactly as given), or appends
     * { eid, ...body }. Returns the row found by eid afterwards (undefined
     * only if body renamed it, which the service never allows).
     */
    upsertRecord(eid, body) {
      const records = recordsOf();
      const idx = records.findIndex(r => r.eid === eid);
      if (idx === -1) {
        records.push({ eid, ...body });
      } else {
        records[idx] = { ...records[idx], ...body };
      }
      db['competency-records'] = records;
      changed();
      return records.find(r => r.eid === eid);
    },
  };
});
