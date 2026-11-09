// The planner store (boards, buckets, tasks, deletion logs) for the configured
// backend (docs/sqlite-migration-plan.md). read(fn) / write(fn) hand fn a
// session; see persistence/json/planner.store.js for its operations.
const { selectStore } = require('../../persistence/select-store');

module.exports = selectStore('planner', ['read', 'write'], {
  json: () => require('../../persistence/json/planner.store'),
});
