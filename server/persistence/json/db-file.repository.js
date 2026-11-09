// db.json: every collection except the roster. The only code that reads or writes it.
// Its rules: an unreadable file loads as {} (bug H2), and saves have no trailing newline.
const fs = require('fs');
const { dbPath } = require('../../config');

function loadDb() {
  try { return JSON.parse(fs.readFileSync(dbPath, 'utf8')); }
  catch { return {}; }
}

function saveDb(db) {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
}

module.exports = { loadDb, saveDb };
