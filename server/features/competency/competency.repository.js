// The competency store for the configured backend (docs/sqlite-migration-plan.md).
// read(fn) / write(fn) hand fn a session; see persistence/json/competency.store.js.
const { selectStore } = require('../../persistence/select-store');

module.exports = selectStore('competency', ['read', 'write'], {
  json: () => require('../../persistence/json/competency.store'),
});
