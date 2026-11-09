// Lookup lists, returned exactly as stored (string ids included). One load per call, no writes.
const repository = require('./lookups.repository');

function listAttendanceOptions() {
  return repository.attendanceOptions(repository.load());
}

function listOfficeLocations() {
  return repository.officeLocations(repository.load());
}

function listPlannerLabels() {
  return repository.plannerLabels(repository.load());
}

module.exports = { listAttendanceOptions, listOfficeLocations, listPlannerLabels };
