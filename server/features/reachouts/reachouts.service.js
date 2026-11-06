// Project reachouts (db.json). One load and at most one save per call. Bugs
// M11 and L11 in docs/found-bugs.md are kept (no roster check; changing a
// reachout's eid keeps its old groupNumber).
const repository = require('./reachouts.repository');
const { normalizeEid } = require('../../utils/eid');
const { nextId } = require('../../utils/ids');

const REACHOUT_DEFAULT_STATUS = 'CV Requested';
const REACHOUT_REQUIRED_FIELDS = ['eid', 'projectName', 'techRole', 'pocEid'];

function normalizeReachoutGroup(value) {
  const group = Number(value);
  return Number.isInteger(group) && group >= 1 && group <= 6 ? group : null;
}

function normalizeReachoutPayload(body) {
  return {
    eid: normalizeEid(body?.eid),
    projectName: String(body?.projectName || '').trim(),
    techRole: String(body?.techRole || '').trim(),
    pocEid: normalizeEid(body?.pocEid),
    status: String(body?.status || '').trim() || REACHOUT_DEFAULT_STATUS,
    details: String(body?.details || '').trim(),
    groupNumber: normalizeReachoutGroup(body?.groupNumber),
  };
}

/** group is the raw query value; falsy means no filter. Ids come back numeric. */
function listReachouts(group) {
  const db = repository.load();
  let rows = repository.rowsOf(db);
  if (group) rows = rows.filter(r => String(r.groupNumber) === String(group));
  return rows.map(r => ({ ...r, id: Number(r.id) }));
}

/** body is req.body as parsed. { error } when a required field is missing (nothing read or written), otherwise { row }. */
function createReachout(body) {
  const payload = normalizeReachoutPayload(body);
  const missing = REACHOUT_REQUIRED_FIELDS.filter(field => !payload[field]);
  if (missing.length) return { error: `${missing.join(', ')} required` };

  const db = repository.load();
  const rows = repository.rowsOf(db);
  const row = { id: nextId(rows), ...payload, createdAt: new Date().toISOString() };
  rows.push(row);
  repository.setRows(db, rows);
  repository.save(db);
  return { row };
}

/**
 * { notFound } for an unknown id. Otherwise the fields sent are applied to the
 * loaded row FIRST and the required fields are checked AFTER, on the changed
 * row: { error } then returns without saving (the change is discarded with the
 * in-memory db). On success sets updatedAt, saves once and returns { row }.
 */
function updateReachout(id, body) {
  const db = repository.load();
  const rows = repository.rowsOf(db);
  const idx = rows.findIndex(r => Number(r.id) === id);
  if (idx === -1) return { notFound: true };

  const changes = body || {};
  if (changes.eid !== undefined) rows[idx].eid = normalizeEid(changes.eid);
  if (changes.projectName !== undefined) rows[idx].projectName = String(changes.projectName).trim();
  if (changes.techRole !== undefined) rows[idx].techRole = String(changes.techRole).trim();
  if (changes.pocEid !== undefined) rows[idx].pocEid = normalizeEid(changes.pocEid);
  if (changes.status !== undefined) rows[idx].status = String(changes.status).trim() || REACHOUT_DEFAULT_STATUS;
  if (changes.details !== undefined) rows[idx].details = String(changes.details).trim();
  if (changes.groupNumber !== undefined) rows[idx].groupNumber = normalizeReachoutGroup(changes.groupNumber);

  const missing = REACHOUT_REQUIRED_FIELDS.filter(field => !rows[idx][field]);
  if (missing.length) return { error: `${missing.join(', ')} required` };

  rows[idx].updatedAt = new Date().toISOString();
  repository.setRows(db, rows);
  repository.save(db);
  return { row: { ...rows[idx], id: Number(rows[idx].id) } };
}

/** false when the id is unknown (nothing written). */
function deleteReachout(id) {
  const db = repository.load();
  const rows = repository.rowsOf(db);
  const idx = rows.findIndex(r => Number(r.id) === id);
  if (idx === -1) return false;
  rows.splice(idx, 1);
  repository.setRows(db, rows);
  repository.save(db);
  return true;
}

module.exports = {
  REACHOUT_DEFAULT_STATUS,
  REACHOUT_REQUIRED_FIELDS,
  normalizeReachoutGroup,
  normalizeReachoutPayload,
  listReachouts,
  createReachout,
  updateReachout,
  deleteReachout
};
