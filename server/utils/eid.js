// EID normalisation: trim, drop everything from @ onwards, lower-case.
// Used by reachouts and onboarding.
function normalizeEid(value) {
  return String(value || '').trim().split('@')[0].toLowerCase();
}

module.exports = { normalizeEid };
