// test_bwd/db.json (the fruits test bench). The only code that reads or writes it.
// Its rules differ from db.json on purpose: an unreadable file loads as { fruits: [] },
// and the next id is Math.max(...ids)+1, or 1 when there are no fruits.
const fs = require('fs');
const { fruitsDbPath } = require('../config');

function loadFruitsDb() {
  try { return JSON.parse(fs.readFileSync(fruitsDbPath, 'utf8')); }
  catch { return { fruits: [] }; }
}
function saveFruitsDb(db) {
  fs.writeFileSync(fruitsDbPath, JSON.stringify(db, null, 2), 'utf8');
}
function fruitsNextId(arr) {
  return arr.length ? Math.max(...arr.map(f => Number(f.id))) + 1 : 1;
}

module.exports = { loadFruitsDb, saveFruitsDb, fruitsNextId };
