// The capacity-entries collection in db.json. Same variable names and
// expressions as the code the capacity service ran before the store interface,
// so a non-array collection still fails with the pinned TypeError text (e.g.
// "entries.find is not a function"). Entries are returned as stored.
const { createDbStore } = require('./db-store');
const { nextId } = require('../../utils/ids');

module.exports = createDbStore((db, changed) => {
  const entriesOf = () => db['capacity-entries'] || [];

  return {
    /** Every entry, as stored (no filtering). */
    listEntries() {
      return entriesOf();
    },

    /** The stored entry for (sprintName, eid), or undefined. */
    findEntry(sprintName, eid) {
      const entries = entriesOf();
      return entries.find(e => e.sprintName === sprintName && e.eid === eid);
    },

    /** Assigns changes onto the stored entry for (sprintName, eid) and returns it (undefined when there is none). */
    updateEntry(sprintName, eid, changes) {
      const entries = entriesOf();
      const existing = entries.find(e => e.sprintName === sprintName && e.eid === eid);
      if (!existing) return undefined;
      Object.assign(existing, changes);
      db['capacity-entries'] = entries;
      changed();
      return existing;
    },

    /** Stores { id, ...fields } with the next id and returns it. */
    insertEntry(fields) {
      const entries = entriesOf();
      const id = nextId(entries);
      const entry = { id, ...fields };
      entries.push(entry);
      db['capacity-entries'] = entries;
      changed();
      return entry;
    },
  };
});
