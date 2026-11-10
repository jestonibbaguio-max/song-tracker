// The attendance store for the configured backend (docs/sqlite-migration-plan.md).
// read(fn) / write(fn) hand fn a session; see persistence/json/attendance.store.js.
const { selectStore } = require('../../persistence/select-store');

module.exports = selectStore('attendance', ['read', 'write'], {
  json: () => require('../../persistence/json/attendance.store'),
  sqlite: () => require('../../persistence/sqlite/attendance.store'),
});
