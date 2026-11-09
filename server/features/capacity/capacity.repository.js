// The capacity store for the configured backend (docs/sqlite-migration-plan.md).
// read(fn) / write(fn) hand fn a session; see persistence/json/capacity.store.js.
const { selectStore } = require('../../persistence/select-store');

module.exports = selectStore('capacity', ['read', 'write'], {
  json: () => require('../../persistence/json/capacity.store'),
  sqlite: () => require('../../persistence/sqlite/capacity.store'),
});
