// Lookup lists, as stored but with numeric ids ("1" comes back as 1: bug L16).
// One load per call, no writes.
const repository = require('./lookups.repository');
const { numericId } = require('../../utils/ids');

/** A collection that isn't an array is returned as it is, as before. */
function withNumericIds(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map(r => (r && typeof r === 'object' && 'id' in r ? { ...r, id: numericId(r.id) } : r));
}

function listAttendanceOptions() {
  return repository.read((store) => withNumericIds(store.attendanceOptions()));
}

function listOfficeLocations() {
  return repository.read((store) => withNumericIds(store.officeLocations()));
}

function listPlannerLabels() {
  return repository.read((store) => withNumericIds(store.plannerLabels()));
}

module.exports = { listAttendanceOptions, listOfficeLocations, listPlannerLabels };
