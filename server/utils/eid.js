// EID normalisation: trim, drop everything from @ onwards, lower-case.
// Reachouts use it; onboarding has the same logic inline (step 11).
function normalizeEid(value) {
  return String(value || '').trim().split('@')[0].toLowerCase();
}

module.exports = { normalizeEid };
