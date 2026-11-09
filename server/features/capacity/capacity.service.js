// Sprint capacity entries (db.json). One load and at most one save per call.
// Bugs M1, M7, M9 and M11 in docs/found-bugs.md are kept.
const repository = require('./capacity.repository');
const { nextId } = require('../../utils/ids');

/** sprintName is the raw query value; falsy means no filter. */
function listEntries(sprintName) {
  const db = repository.load();
  let entries = repository.entriesOf(db);
  if (sprintName) entries = entries.filter(e => e.sprintName === sprintName);
  return entries;
}

/**
 * Updates the entry for (sprintName, eid) or creates one.
 * { error } when either key is missing (nothing read or written), otherwise
 * { entry, created }.
 */
function upsertEntry({ sprintName, eid, cadence, admin, holiday }) {
  if (!sprintName || !eid) return { error: 'sprintName and eid are required' };
  const db = repository.load();
  const entries = repository.entriesOf(db);
  const existing = entries.find(e => e.sprintName === sprintName && e.eid === eid);
  if (existing) {
    if (cadence !== undefined) existing.cadence = Number(cadence);
    if (admin !== undefined) existing.admin = Number(admin);
    if (holiday !== undefined) existing.holiday = Number(holiday);
    repository.setEntries(db, entries);
    repository.save(db);
    return { entry: existing, created: false };
  }
  const id = nextId(entries);
  const entry = { id, sprintName, eid, cadence: Number(cadence) || 0, admin: Number(admin) || 0, holiday: Number(holiday) || 0 };
  entries.push(entry);
  repository.setEntries(db, entries);
  repository.save(db);
  return { entry, created: true };
}

module.exports = { listEntries, upsertEntry };
