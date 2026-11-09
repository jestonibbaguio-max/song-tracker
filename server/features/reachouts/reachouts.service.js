// Project reachouts. Each call runs in one read() or write() of the reachouts
// store (one load, at most one save). Bugs M11 and L11 in docs/found-bugs.md
// are kept (no roster check; changing a reachout's eid keeps its old groupNumber).
const repository = require('./reachouts.repository');
const { normalizeEid } = require('../../utils/eid');

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
  return repository.read((store) => {
    let rows = store.listRows();
    if (group) rows = rows.filter(r => String(r.groupNumber) === String(group));
    return rows.map(r => ({ ...r, id: Number(r.id) }));
  });
}

/** body is req.body as parsed. { error } when a required field is missing (nothing read or written), otherwise { row }. */
function createReachout(body) {
  const payload = normalizeReachoutPayload(body);
  const missing = REACHOUT_REQUIRED_FIELDS.filter(field => !payload[field]);
  if (missing.length) return { error: `${missing.join(', ')} required` };

  return repository.write((store) => ({
    row: store.insertRow({ ...payload, createdAt: new Date().toISOString() })
  }));
}

/**
 * { notFound } for an unknown id. Otherwise the fields sent are applied to a
 * copy of the stored row FIRST and the required fields are checked AFTER, on
 * the changed copy: { error } then returns without saving anything. On success
 * the same changes plus updatedAt are stored (in that key order), saved once,
 * and { row } is returned.
 */
function updateReachout(id, body) {
  return repository.write((store) => {
    const current = store.findRow(id);
    if (!current) return { notFound: true };

    const changes = body || {};
    const updates = {};
    if (changes.eid !== undefined) updates.eid = normalizeEid(changes.eid);
    if (changes.projectName !== undefined) updates.projectName = String(changes.projectName).trim();
    if (changes.techRole !== undefined) updates.techRole = String(changes.techRole).trim();
    if (changes.pocEid !== undefined) updates.pocEid = normalizeEid(changes.pocEid);
    if (changes.status !== undefined) updates.status = String(changes.status).trim() || REACHOUT_DEFAULT_STATUS;
    if (changes.details !== undefined) updates.details = String(changes.details).trim();
    if (changes.groupNumber !== undefined) updates.groupNumber = normalizeReachoutGroup(changes.groupNumber);

    const changed = Object.assign(current, updates);
    const missing = REACHOUT_REQUIRED_FIELDS.filter(field => !changed[field]);
    if (missing.length) return { error: `${missing.join(', ')} required` };

    updates.updatedAt = new Date().toISOString();
    return { row: store.updateRow(id, updates) };
  });
}

/** false when the id is unknown (nothing written). */
function deleteReachout(id) {
  return repository.write((store) => store.removeRow(id));
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
