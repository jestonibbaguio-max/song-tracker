// The project reachouts store for the configured backend
// (docs/sqlite-migration-plan.md). read(fn) / write(fn) hand fn a session; see
// persistence/json/reachouts.store.js for its operations.
const { selectStore } = require('../../persistence/select-store');

module.exports = selectStore('reachouts', ['read', 'write'], {
  json: () => require('../../persistence/json/reachouts.store'),
});
