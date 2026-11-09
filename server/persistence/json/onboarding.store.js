// The onboarding roster (custom-onboarding.json, seeded from custom.csv) for the
// onboarding store interface. Every operation goes through the roster file
// repository, which owns the file's rules, and each one re-reads the file, as
// before: list() may back-fill ids and rewrite the file, and append()/update()
// load again before they save. The number and order of roster reads and writes
// per request are pinned by test/api/guardrails/fs-trace.test.js.
const rosterFile = require('./roster-file.repository');

/** Every stored record (raw, mixed key styles). */
function list() {
  return rosterFile.loadOnboardingRecords();
}

/** Appends the record with the next id and fresh created_at/updated_at; returns it. */
function append(record) {
  return rosterFile.appendOnboardingRecord(record);
}

/** Assigns payload onto the record with that id (and a fresh updated_at); null when the id is unknown. */
function update(id, payload) {
  return rosterFile.updateOnboardingRecord(id, payload);
}

/** Removes the record with that id: one load, and one save only when it exists. false when the id is unknown. */
function remove(id) {
  const records = rosterFile.loadOnboardingRecords();
  const existing = records.find((record) => Number(record.id) === id);
  if (!existing) {
    return false;
  }
  const remaining = records.filter((record) => Number(record.id) !== id);
  rosterFile.saveOnboardingRecords(remaining);
  return true;
}

module.exports = { list, append, update, remove };
