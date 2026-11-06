// tasks.json (legacy tasks). The only code that reads or writes it.
// Its rules: a missing or unreadable file is overwritten with the default (bug H3),
// and writes end with a trailing newline.
const fs = require('fs');
const { DATA_DIR } = require('../config');

const dataDir = DATA_DIR;

function ensureDataDirectory() {
  fs.mkdirSync(dataDir, { recursive: true });
}

function readJson(filePath, defaultValue) {
  ensureDataDirectory();

  if (!fs.existsSync(filePath)) {
    writeJson(filePath, defaultValue);
    return defaultValue;
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    writeJson(filePath, defaultValue);
    return defaultValue;
  }
}

function writeJson(filePath, data) {
  ensureDataDirectory();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

module.exports = { readJson, writeJson };
