// The onboarding store for the configured backend (docs/sqlite-migration-plan.md):
// list(), append(record), update(id, payload) and remove(id). See
// persistence/json/onboarding.store.js. Each call reads the roster again.
const { selectStore } = require('../../persistence/select-store');

module.exports = selectStore('onboarding', ['list', 'append', 'update', 'remove'], {
  json: () => require('../../persistence/json/onboarding.store'),
});
