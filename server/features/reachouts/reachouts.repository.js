// The reachouts store: persistence/sqlite/reachouts.store.js. SQLite is the
// only backend since Phase 8 (docs/sqlite-migration-plan.md).
// read(fn) / write(fn) hand fn a session; see the store for its operations.
module.exports = require('../../persistence/sqlite/reachouts.store');
