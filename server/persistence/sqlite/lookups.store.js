// Read-only lookup tables, filled by the import. Ids are numbers.
const { createSqliteStore, selectAll } = require('./sqlite-store');

module.exports = createSqliteStore(() => ({
  attendanceOptions() {
    return selectAll('attendance-options');
  },
  officeLocations() {
    return selectAll('office-locations');
  },
  plannerLabels() {
    return selectAll('planner-labels');
  },
}));
