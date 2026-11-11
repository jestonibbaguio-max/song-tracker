// The test fixtures after a round trip through SQLite (docs/sqlite-migration-plan.md,
// Phase 5 step 2): copied to a new temp directory, imported into a database
// there, and exported back over the copy with the server's own import.js and
// export.js. The database and the backups are removed afterwards, so the
// directory holds what the fixtures do, with db.json and the roster as
// `npm run db:export` writes them.
//
// Used by sqlite-roundtrip.test.js.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { FIXTURES_DIR, SERVER_DIR } = require('./test-server');

/**
 * @param {{ from?: string }} [options]  the fixture directory to start from
 * @returns {string} the new directory; the caller deletes it
 */
function createExportedFixtures({ from = FIXTURES_DIR } = {}) {
  // Required here, not at the top: the harness drops server/ from the module
  // cache before each app, and these modules only need their own arguments.
  const { importJson } = require(path.join(SERVER_DIR, 'persistence', 'sqlite', 'import.js'));
  const { exportJson } = require(path.join(SERVER_DIR, 'persistence', 'sqlite', 'export.js'));

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'song-tracker-exported-'));
  try {
    fs.cpSync(from, dir, { recursive: true });
    const dbPath = path.join(dir, 'dashboard.sqlite');
    importJson({ dataDir: dir, dbPath });
    const { backups } = exportJson({ dbPath, outDir: dir });
    for (const backup of backups) fs.rmSync(backup);
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(dbPath + suffix, { force: true });
    return dir;
  } catch (error) {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
    throw error;
  }
}

module.exports = { createExportedFixtures };
