// The onboarding store: persistence/sqlite/onboarding.store.js. SQLite is the
// only backend since Phase 8 (docs/sqlite-migration-plan.md).
// list(), append(record), update(id, payload) and remove(id), each one a
// fresh query.
module.exports = require('../../persistence/sqlite/onboarding.store');
