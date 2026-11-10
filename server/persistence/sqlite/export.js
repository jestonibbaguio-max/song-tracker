// SQLite → JSON files (docs/sqlite-migration-plan.md, Phase 5 step 1): the way
// back to the JSON backend (decision 7). Used by `npm run db:export`.
//
//   exportJson({ dbPath, outDir }) → report
//
// Reads every table of the database at dbPath and writes <outDir>/db.json and
// <outDir>/custom-onboarding.json in the JSON backend's own format, so
// PERSISTENCE=json reads them as the same data, and import.js builds the same
// database from them again. The rules:
//   - the database must exist and have the dashboard schema: a missing file or
//     an empty one (PRAGMA user_version 0) is refused before anything in
//     outDir is touched, so a typo can never write empty JSON over real files.
//     An older schema is brought up to date first, as the server does on open;
//   - rows are read in one transaction, in the order the stores list them
//     (ids ascending, competency rows in insertion order (seq), the roster
//     newest first), and come out as the stores return them (tables.js
//     fromColumns): numeric ids, an optional field that is NULL left out, ""
//     and null kept as they are;
//   - db.json: every collection, in a fixed key order (the order of
//     develop's db.json and the test fixtures), each row's fields in column
//     order (utils/fields.js). JSON.stringify(db, null, 2), no trailing newline.
//     db.json's dead keys (onboarding-resources, dashboard, $schema) aren't in
//     the database, so they aren't written (decision 5);
//   - custom-onboarding.json: records with camelCase fields in the order the
//     API writes them, plus created_at/updated_at in snake_case, as the API
//     writes them too (the JSON backend sorts the resources on created_at).
//     JSON.stringify(records, null, 2) plus one trailing newline;
//   - before anything is written, each file that exists is copied to
//     <file>.bak-<timestamp> (never over an existing backup). Each new file
//     is written next to its target and then renamed over it.
//
// Values SQLite doesn't hold the way db.json did (bug L18 in
// docs/found-bugs.md) come out the way the SQLite backend reads them: a null
// sent for an optional field is absent, a task's completed is a boolean, and a
// stored Infinity is null.
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { configure } = require('./connection');
const { migrate } = require('./migrations');
const { spec, fromColumns } = require('./tables');
const { inColumnOrder } = require('../../utils/fields');

/** db.json's collections, in the order they're written. */
const DB_JSON_ORDER = [
  'capacity-entries', 'sprint-retros', 'sprints', 'attendance-options', 'attendance', 'office-locations',
  'planner-labels', 'planner-boards', 'planner-buckets', 'planner-tasks', 'competency-records', 'project-reachouts',
  'deletion-logs',
];

/** How each table is ordered: as the stores list it (ORDER BY id unless listed here). */
const ORDER_BY = {
  'onboarding-resources': 'created_at DESC, id DESC',
  'competency-records': 'seq',
};

/** A roster record's keys, in the order the API writes them to custom-onboarding.json. */
const ROSTER_KEY_ORDER = [
  'name', 'eid', 'hireDate', 'rollInDate', 'projectDeployed', 'deploymentDate', 'projectName', 'poc', 'dn',
  'rollOffDate', 'fromProject', 'clLevel', 'groupNumber', 'primarySkill', 'primaryYears', 'secondarySkill',
  'secondaryYears', 'anotherSkills', 'officeLocation', 'id', 'created_at', 'updated_at',
];

const DB_JSON = 'db.json';
const ROSTER_JSON = 'custom-onboarding.json';

class ExportError extends Error {}

/** The database at dbPath with an up-to-date schema, or an ExportError. Never creates a file. */
function openDatabase(dbPath) {
  let database;
  try {
    database = new Database(dbPath, { fileMustExist: true });
  } catch (error) {
    if (error.code !== 'SQLITE_CANTOPEN' && !/directory does not exist/.test(error.message)) throw error;
    throw new ExportError(`No SQLite database at ${dbPath}; nothing was exported`, { cause: error });
  }
  try {
    // Before configure(): switching an empty file to WAL would write to it.
    let version;
    try {
      version = database.pragma('user_version', { simple: true });
    } catch (error) {
      if (error.code !== 'SQLITE_NOTADB') throw error;
      throw new ExportError(`${dbPath} is not a SQLite database; nothing was exported`, { cause: error });
    }
    if (version === 0) {
      throw new ExportError(`${dbPath} has no dashboard schema (PRAGMA user_version is 0); nothing was exported`);
    }
    configure(database);
    migrate(database);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

/** Every table's rows as API fields, read in one transaction. */
function readTables(database) {
  return database.transaction(() => {
    const rows = {};
    for (const collection of ['onboarding-resources', ...DB_JSON_ORDER]) {
      rows[collection] = database
        .prepare(`SELECT * FROM ${spec(collection).table} ORDER BY ${ORDER_BY[collection] || 'id'}`)
        .all()
        .map((record) => fromColumns(collection, record));
    }
    return rows;
  })();
}

/** A copy of row with `keys` first, in that order, then any other key. */
function withKeyOrder(row, keys) {
  const out = {};
  for (const key of keys) if (Object.prototype.hasOwnProperty.call(row, key)) out[key] = row[key];
  for (const key of Object.keys(row)) if (!Object.prototype.hasOwnProperty.call(out, key)) out[key] = row[key];
  return out;
}

/** The two files' text, exactly as the JSON backend writes them. */
function formatFiles(rows) {
  const db = {};
  for (const collection of DB_JSON_ORDER) db[collection] = rows[collection].map((row) => inColumnOrder(collection, row));
  const roster = rows['onboarding-resources'].map((record) => withKeyOrder(record, ROSTER_KEY_ORDER));
  return [
    { name: DB_JSON, text: JSON.stringify(db, null, 2) },
    { name: ROSTER_JSON, text: JSON.stringify(roster, null, 2) + '\n' },
  ];
}

/** "2026-11-10T08:30:00.000Z" → "2026-11-10T08-30-00-000Z" (no ':' in Windows file names). */
const fileStamp = (date) => date.toISOString().replace(/[:.]/g, '-');

/** Backs up every existing target, then writes each file next to its target and renames it over. */
function writeFiles(outDir, files, stamp) {
  fs.mkdirSync(outDir, { recursive: true });
  const backups = [];
  for (const { name } of files) {
    const target = path.join(outDir, name);
    if (!fs.existsSync(target)) continue;
    const backup = `${target}.bak-${stamp}`;
    try {
      fs.copyFileSync(target, backup, fs.constants.COPYFILE_EXCL);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      throw new ExportError(`${backup} already exists; nothing was overwritten`, { cause: error });
    }
    backups.push(backup);
  }
  const written = [];
  for (const { name, text } of files) {
    const target = path.join(outDir, name);
    const temp = `${target}.tmp-${stamp}`;
    fs.writeFileSync(temp, text, 'utf8');
    try {
      fs.renameSync(temp, target);
    } catch (error) {
      fs.rmSync(temp, { force: true });
      throw error;
    }
    written.push(target);
  }
  return { written, backups };
}

/**
 * @param {{ dbPath: string, outDir: string, now?: Date }} options
 *   now sets the backups' timestamp (tests pass a fixed one).
 * @returns {{ dbPath: string, files: string[], backups: string[], rows: Record<string, number> }}
 */
function exportJson({ dbPath, outDir, now = new Date() }) {
  const database = openDatabase(dbPath);
  let rows;
  try {
    rows = readTables(database);
  } finally {
    database.close();
  }
  const { written, backups } = writeFiles(outDir, formatFiles(rows), fileStamp(now));
  const counts = {};
  for (const [collection, list] of Object.entries(rows)) counts[collection] = list.length;
  return { dbPath, files: written, backups, rows: counts };
}

/** The report as lines of text. */
function formatReport({ dbPath, files, backups, rows }) {
  const lines = [`Exported ${dbPath}`, 'Rows per collection:'];
  for (const [collection, count] of Object.entries(rows)) lines.push(`  ${collection.padEnd(22)} ${count}`);
  lines.push('Wrote:', ...files.map((file) => `  ${file}`));
  if (backups.length) lines.push('Backed up the previous files to:', ...backups.map((file) => `  ${file}`));
  else lines.push('Backups: none (no previous files)');
  return lines;
}

module.exports = { exportJson, formatReport, ExportError, DB_JSON_ORDER, ROSTER_KEY_ORDER };
