// The sprints store: persistence/sqlite/sprints.store.js. SQLite is the
// only backend since Phase 8 (docs/sqlite-migration-plan.md).
// Sprints and sprint retros. read(fn) / write(fn) hand fn a session; see the
// store for its operations.
module.exports = require('../../persistence/sqlite/sprints.store');
