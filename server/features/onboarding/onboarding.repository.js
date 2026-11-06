// Data access for onboarding resources. Delegates to the roster file repository
// (custom-onboarding.json, seeded from custom.csv), which owns the file's rules.
// Each call there re-reads the file: load() may back-fill ids and rewrite it,
// and append()/update() load again before they save.
const rosterFile = require('../../persistence/roster-file.repository');

function load() {
  return rosterFile.loadOnboardingRecords();
}

function save(records) {
  rosterFile.saveOnboardingRecords(records);
}

function append(record) {
  return rosterFile.appendOnboardingRecord(record);
}

function update(id, payload) {
  return rosterFile.updateOnboardingRecord(id, payload);
}

module.exports = { load, save, append, update };
