// Next id for db.json collections: max(id)+1, where non-numeric ids count as 0.
// NOT for the fruits test bench, which has its own rule (persistence/fruits-file.repository.js).
function nextId(arr) {
  return (arr.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0)) + 1;
}

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

module.exports = { nextId, numericId };
