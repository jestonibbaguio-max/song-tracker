// The sprints store (sprints and sprint retros) for the configured backend
// (docs/sqlite-migration-plan.md). read(fn) / write(fn) hand fn a session; see
// persistence/json/sprints.store.js for its operations.
const { selectStore } = require('../../persistence/select-store');

module.exports = selectStore('sprints', ['read', 'write'], {
  json: () => require('../../persistence/json/sprints.store'),
  sqlite: () => require('../../persistence/sqlite/sprints.store'),
});
