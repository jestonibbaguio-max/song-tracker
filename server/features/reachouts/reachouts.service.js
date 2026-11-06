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

module.exports = {
  REACHOUT_DEFAULT_STATUS,
  REACHOUT_REQUIRED_FIELDS,
  normalizeReachoutGroup,
  normalizeReachoutPayload
};
