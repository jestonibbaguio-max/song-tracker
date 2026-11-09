// Attendance cells. Each call runs in one read() or write() of the attendance
// store (one load, at most one save). Writes store the request body as is,
// merged over the stored row on PATCH: bugs M6 and M12 in docs/found-bugs.md
// are kept on purpose.
const repository = require('./attendance.repository');

/** year and month are the raw query values; falsy means no filter. */
function listRecords({ year, month }) {
  return repository.read((store) => {
    let records = store.listRecords();
    if (year) records = records.filter(r => Number(r.year) === Number(year));
    if (month) records = records.filter(r => Number(r.month) === Number(month));
    return records;
  });
}

/** body is req.body as parsed; every field is stored, then the new id. */
function createRecord(body) {
  return repository.write((store) => store.insertRecord(body));
}

/** Merges body over the stored row and makes the id numeric. null when the id is unknown. */
function updateRecord(id, body) {
  return repository.write((store) => store.updateRecord(id, body));
}

/** false when the id is unknown (nothing written). */
function deleteRecord(id) {
  return repository.write((store) => store.removeRecord(id));
}

module.exports = { listRecords, createRecord, updateRecord, deleteRecord };
