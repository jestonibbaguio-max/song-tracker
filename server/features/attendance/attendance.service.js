// Attendance cells (db.json). One load and at most one save per call.
// Writes store the request body as is, merged over the stored row on PATCH:
// bugs M6 and M12 in docs/found-bugs.md are kept on purpose.
const repository = require('./attendance.repository');
const { nextId } = require('../../utils/ids');

/** year and month are the raw query values; falsy means no filter. */
function listRecords({ year, month }) {
  const db = repository.load();
  let records = repository.recordsOf(db);
  if (year) records = records.filter(r => Number(r.year) === Number(year));
  if (month) records = records.filter(r => Number(r.month) === Number(month));
  return records;
}

/** body is req.body as parsed; every field is stored, then the new id. */
function createRecord(body) {
  const db = repository.load();
  const records = repository.recordsOf(db);
  const id = nextId(records);
  const record = { ...body, id };
  records.push(record);
  repository.setRecords(db, records);
  repository.save(db);
  return record;
}

/** Merges body over the stored row and makes the id numeric. null when the id is unknown. */
function updateRecord(id, body) {
  const db = repository.load();
  const records = repository.recordsOf(db);
  const idx = records.findIndex(r => Number(r.id) === id);
  if (idx === -1) return null;
  records[idx] = { ...records[idx], ...body, id };
  repository.setRecords(db, records);
  repository.save(db);
  return records[idx];
}

/** false when the id is unknown (nothing written). */
function deleteRecord(id) {
  const db = repository.load();
  const records = repository.recordsOf(db);
  const idx = records.findIndex(r => Number(r.id) === id);
  if (idx === -1) return false;
  records.splice(idx, 1);
  repository.setRecords(db, records);
  repository.save(db);
  return true;
}

module.exports = { listRecords, createRecord, updateRecord, deleteRecord };
