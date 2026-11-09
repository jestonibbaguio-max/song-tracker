// Read-only lookup collections in db.json, returned exactly as stored
// (string ids included).
const { createDbStore } = require('./db-store');

module.exports = createDbStore((db) => ({
  attendanceOptions() {
    return db['attendance-options'] || [];
  },
  officeLocations() {
    return db['office-locations'] || [];
  },
  plannerLabels() {
    return db['planner-labels'] || [];
  },
}));
