// The lookups store: persistence/sqlite/lookups.store.js. SQLite is the
// only backend since Phase 8 (docs/sqlite-migration-plan.md).
// read(fn) hands fn a session with attendanceOptions(), officeLocations()
// and plannerLabels().
module.exports = require('../../persistence/sqlite/lookups.store');
