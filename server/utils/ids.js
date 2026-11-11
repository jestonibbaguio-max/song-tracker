// Id helpers. New ids come from SQLite (INTEGER PRIMARY KEY: max(id)+1); the
// fruits test bench has its own rule (persistence/fruits-file.repository.js).

/**
 * A stored id as the API returns it: a numeric string ("1") becomes a number;
 * anything else stays as it is, e.g. the random attendance ids that the SQLite
 * import drops (docs/sqlite-migration-plan.md, decision 6).
 */
function numericId(id) {
  if (typeof id !== 'string' || id.trim() === '') return id;
  const n = Number(id);
  return Number.isFinite(n) ? n : id;
}

module.exports = { numericId };
