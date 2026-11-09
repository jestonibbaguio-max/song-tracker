// db.json: every collection except the roster. The only code that reads or writes it.
// Its rules: a missing file loads as {}; a file that can't be read or parsed
// throws, so the request fails with a 500 and nothing is saved over it (bug H2,
// where it loaded as {} and the next write wiped every other collection); saves
// have no trailing newline.
const fs = require('fs');
const { dbPath } = require('../../config');

function loadDb() {
  let text;
  try {
    text = fs.readFileSync(dbPath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`db.json is not valid JSON: ${error.message}`);
  }
}

function saveDb(db) {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
}

module.exports = { loadDb, saveDb };
