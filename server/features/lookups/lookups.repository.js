// The lookups store for the configured backend (docs/sqlite-migration-plan.md).
// read(fn) hands fn a session with attendanceOptions(), officeLocations() and
// plannerLabels().
const { selectStore } = require('../../persistence/select-store');

module.exports = selectStore('lookups', ['read'], {
  json: () => require('../../persistence/json/lookups.store'),
});
