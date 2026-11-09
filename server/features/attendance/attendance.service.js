// Attendance cells. Each call runs in one read() or write() of the attendance
// store (one load, at most one save). Writes store the body's attendance
// fields (eid, year, month, day, status, location) as sent, merged over the
// stored row on PATCH; other fields are dropped (M12, storage part). Ids are
// returned as numbers (M6, id type). The missing validation (M12) and the
// stale location after leaving RTO (M6) are kept on purpose.
const repository = require('./attendance.repository');
const { pickWritable } = require('../../utils/fields');
const { numericId } = require('../../utils/ids');

/**
 * year and month are the raw query values; falsy means no filter. Ids come
 * back as numbers, as POST and PATCH return them. A collection that isn't an
 * array is returned as it is, as before.
 */
function listRecords({ year, month }) {
  return repository.read((store) => {
    let records = store.listRecords();
    if (year) records = records.filter(r => Number(r.year) === Number(year));
    if (month) records = records.filter(r => Number(r.month) === Number(month));
    if (!Array.isArray(records)) return records;
    return records.map(r => ('id' in r ? { ...r, id: numericId(r.id) } : r));
  });
}

/** body is req.body as parsed; its attendance fields are stored, then the new id. */
function createRecord(body) {
  return repository.write((store) => store.insertRecord(pickWritable('attendance', body)));
}

/** Merges the body's attendance fields over the stored row and makes the id numeric. null when the id is unknown. */
function updateRecord(id, body) {
  return repository.write((store) => store.updateRecord(id, pickWritable('attendance', body)));
}

/** false when the id is unknown (nothing written). */
function deleteRecord(id) {
  return repository.write((store) => store.removeRecord(id));
}

module.exports = { listRecords, createRecord, updateRecord, deleteRecord };
