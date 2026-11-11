// Sprint capacity entries. Each call runs in one read() or write() of the
// capacity store (one read session, or one transaction).
// Bugs M1, M9 and M11 in docs/found-bugs.md are kept.
const repository = require('./capacity.repository');
const { inColumnOrder, rowsInColumnOrder } = require('../../utils/fields');

/**
 * sprintName is the raw query value; falsy means no filter. An entry matches
 * when its sprintName === the query value; a repeated parameter (an array)
 * matches nothing, so it's passed as null.
 */
function listEntries(sprintName) {
  return repository.read((store) => {
    const filter = sprintName ? { sprintName: typeof sprintName === 'string' ? sprintName : null } : {};
    return rowsInColumnOrder('capacity-entries', store.listEntries(filter));
  });
}

/**
 * Updates the entry for (sprintName, eid) or creates one.
 * { error } when either key is missing (nothing read or written), otherwise
 * { entry, created }.
 */
function upsertEntry({ sprintName, eid, cadence, admin, holiday }) {
  if (!sprintName || !eid) return { error: 'sprintName and eid are required' };
  return repository.write((store) => {
    if (store.findEntry(sprintName, eid)) {
      const changes = {};
      // A value that isn't a number becomes 0, the same as on a new entry (M7).
      if (cadence !== undefined) changes.cadence = Number(cadence) || 0;
      if (admin !== undefined) changes.admin = Number(admin) || 0;
      if (holiday !== undefined) changes.holiday = Number(holiday) || 0;
      return { entry: inColumnOrder('capacity-entries', store.updateEntry(sprintName, eid, changes)), created: false };
    }
    const entry = store.insertEntry({
      sprintName,
      eid,
      cadence: Number(cadence) || 0,
      admin: Number(admin) || 0,
      holiday: Number(holiday) || 0
    });
    return { entry: inColumnOrder('capacity-entries', entry), created: true };
  });
}

module.exports = { listEntries, upsertEntry };
