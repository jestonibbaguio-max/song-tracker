// Next id for db.json collections: max(id)+1, where non-numeric ids count as 0.
// NOT for the fruits test bench, which has its own rule (persistence/fruits-file.repository.js).
function nextId(arr) {
  return (arr.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0)) + 1;
}

module.exports = { nextId };
