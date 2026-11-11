// The planner store: persistence/sqlite/planner.store.js. SQLite is the
// only backend since Phase 8 (docs/sqlite-migration-plan.md).
// Boards, buckets, tasks and deletion logs. read(fn) / write(fn) hand fn a
// session; see the store for its operations.
module.exports = require('../../persistence/sqlite/planner.store');
