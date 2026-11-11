#!/usr/bin/env node
// Prepares the e2e API's data directory (docs/sqlite-migration-plan.md, Phase 6
// step 3). playwright.config.ts runs it before `npm run api`, with DATA_DIR set
// to a folder of its own under the OS temp directory:
//
//   node test/tools/e2e-data.js && npm run api
//
// It empties DATA_DIR and copies server/data's files into it: the committed
// JSON seed, without any database, backup or temp file. `npm run api` then
// builds dashboard.sqlite there (db:migrate --if-missing), the way a fresh
// clone does, so every e2e run starts from the seed and nothing it saves
// reaches the developer's own database.
//
// Playwright starts its webServers before globalSetup, so this can't be a
// globalSetup. The folder stays after the run (the server holds the database
// open while it runs, so Windows can't delete it then); the next run empties it.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SEED_DIR = path.join(REPO_ROOT, 'server', 'data');

/** Files that are never copied: databases, export backups, temp files. */
const SKIP = /\.sqlite(?:-wal|-shm|-journal)?$|\.bak-|\.tmp-/;

/** Whether dir is parent itself or a folder inside it (path.relative ignores case on Windows). */
function isWithin(dir, parent) {
  const relative = path.relative(parent, dir);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * The folder to empty, or an error message. This script deletes a whole
 * folder, so it only accepts one inside the OS temp directory (and not the
 * temp directory itself), and never one that holds the repository.
 */
function checkDataDir(value, tmpDir = os.tmpdir()) {
  if (!value) return { error: "DATA_DIR is not set; it must name the e2e API's own folder (see playwright.config.ts)" };
  const dataDir = path.resolve(value);
  const tmp = path.resolve(tmpDir);
  if (!isWithin(dataDir, tmp) || path.relative(tmp, dataDir) === '') {
    return { error: `refusing to empty ${dataDir}: DATA_DIR must be a folder inside ${tmp}` };
  }
  if (isWithin(REPO_ROOT, dataDir)) return { error: `refusing to empty ${dataDir}: it holds the repository` };
  return { dataDir };
}

function main() {
  const { dataDir, error } = checkDataDir(process.env.DATA_DIR);
  if (error) {
    console.error(`e2e-data: ${error}`);
    return 1;
  }
  try {
    fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 3 });
  } catch (rmError) {
    console.error(`e2e-data: can't empty ${dataDir} (${rmError.code}). Is an e2e API server from an earlier run still running? Stop it and try again`);
    return 1;
  }
  fs.cpSync(SEED_DIR, dataDir, { recursive: true, filter: (source) => !SKIP.test(path.basename(source)) });
  console.log(`e2e-data: copied the seed from ${SEED_DIR} to ${dataDir}`);
  return 0;
}

if (require.main === module) process.exitCode = main();

module.exports = { checkDataDir, SKIP };
