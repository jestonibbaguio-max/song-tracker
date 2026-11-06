const path = require('path');

// Directory holding the JSON data files. Override with the DATA_DIR env var
// (relative paths resolve against the current working directory).
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, 'data');

module.exports = { DATA_DIR };
