// Lookup lists, returned exactly as stored (string ids included). One load per call, no writes.
const repository = require('./lookups.repository');

function listAttendanceOptions() {
  return repository.read((store) => store.attendanceOptions());
}

function listOfficeLocations() {
  return repository.read((store) => store.officeLocations());
}

function listPlannerLabels() {
  return repository.read((store) => store.plannerLabels());
}

module.exports = { listAttendanceOptions, listOfficeLocations, listPlannerLabels };
