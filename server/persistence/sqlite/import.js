// JSON files → a new SQLite database (docs/sqlite-migration-plan.md, Phase 4
// step 2). Used by the test harness, and by `npm run db:migrate` (Phase 6)
// through buildDatabase() at the end of this file.
//
//   importJson({ dataDir, dbPath }) → report
//   buildDatabase({ dataDir, dbPath, force }) → report + { replaced }
//
// Reads <dataDir>/db.json and <dataDir>/custom-onboarding.json and fills a new
// database at dbPath in one transaction. Nothing is written if any row is
// refused. The rules:
//   - db.json's dead keys (onboarding-resources, dashboard, $schema) are
//     skipped (decision 5); any other unknown key is refused;
//   - attendance rows whose Number(id) isn't an integer are dropped (decision
//     6: the json-server ids such as 'RxJX-3dWOPE');
//   - every other id becomes a number, and so do a task's label ids; an id that
//     isn't a positive integer is refused;
//   - roster records are merged the way the API reads them
//     (formatOnboardingResource: camelCase first, then snake_case);
//   - every other field is stored as it is, with an absent field left NULL, so
//     "" and an absent completedDate/notes stay different;
//   - a row that would break a UNIQUE constraint (roster eid, capacity
//     (sprintName, eid), competency eid) is refused, naming both rows.
//
// The report lists the rows per table, the dropped rows with their ids, and
// the skipped keys; formatReport() prints it.
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { configure } = require('./connection');
const { migrate } = require('./migrations');
const { TABLES, toColumns, insertSql } = require('./tables');
const { numericId } = require('../../utils/ids');
const { formatOnboardingResource } = require('../../features/onboarding/onboarding.format');

const DEAD_KEYS = ['onboarding-resources', 'dashboard', '$schema'];

/** db.json collections, in the order they're imported (the schema's table order). */
const DB_COLLECTIONS = [
  'sprints', 'sprint-retros', 'capacity-entries', 'attendance', 'attendance-options', 'office-locations',
  'planner-labels', 'planner-boards', 'planner-buckets', 'planner-tasks', 'deletion-logs', 'project-reachouts',
  'competency-records',
];

/** The UNIQUE keys the API already guarantees (decision 9), per collection. */
const UNIQUE_KEYS = {
  'onboarding-resources': ['eid'],
  'capacity-entries': ['sprintName', 'eid'],
  'competency-records': ['eid'],
};

class ImportError extends Error {}

function readJson(file, { optional = false } = {}) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT' && optional) return undefined;
    if (error.code === 'ENOENT') throw new ImportError(`${path.basename(file)} is missing from ${path.dirname(file)}`);
    throw error;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new ImportError(`${path.basename(file)} is not valid JSON: ${error.message}`);
  }
}

const show = (row) => JSON.stringify(row);

/** A positive integer id, or an ImportError naming the row. */
function integerId(collection, row) {
  const id = Number(row.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ImportError(`${collection}: id ${show(row.id)} is not a positive integer, in ${show(row)}`);
  }
  return id;
}

/** Each collection's rows as they're stored, plus what was dropped. */
function prepareRows(db, roster) {
  const rows = {};
  const dropped = {};

  for (const collection of DB_COLLECTIONS) {
    const stored = db[collection];
    if (stored === undefined) {
      rows[collection] = [];
      continue;
    }
    if (!Array.isArray(stored)) throw new ImportError(`db.json: "${collection}" is not an array`);
    rows[collection] = [];
    for (const original of stored) {
      if (original === null || typeof original !== 'object' || Array.isArray(original)) {
        throw new ImportError(`${collection}: ${show(original)} is not a record`);
      }
      const row = { ...original };
      if (collection === 'attendance' && !Number.isInteger(Number(row.id))) {
        (dropped.attendance = dropped.attendance || []).push(row.id);
        continue;
      }
      if (collection !== 'competency-records') row.id = integerId(collection, row);
      if (collection === 'planner-tasks' && Array.isArray(row.labels)) row.labels = row.labels.map(numericId);
      rows[collection].push(row);
    }
  }

  if (!Array.isArray(roster)) throw new ImportError('custom-onboarding.json is not an array');
  rows['onboarding-resources'] = roster.map((record) => {
    const merged = formatOnboardingResource(record);
    const { createdAt, updatedAt, ...fields } = merged;
    return { ...fields, id: integerId('onboarding-resources', record), created_at: createdAt, updated_at: updatedAt };
  });

  return { rows, dropped };
}

/** Refuses duplicates of the UNIQUE keys, naming both rows. Keys compare by value and type, as === does. */
function checkUnique(rows) {
  for (const [collection, fields] of Object.entries(UNIQUE_KEYS)) {
    const seen = new Map();
    for (const row of rows[collection]) {
      const key = JSON.stringify(fields.map((f) => row[f]));
      if (seen.has(key)) {
        throw new ImportError(`${collection}: duplicate ${fields.join(' + ')} ${key.slice(1, -1)}, in ${show(seen.get(key))} and ${show(row)}`);
      }
      seen.set(key, row);
    }
  }
}

/**
 * @param {{ dataDir: string, dbPath: string }} options
 *   dbPath must not exist yet: the import builds a new database, never merges.
 * @returns {{ tables: Record<string, number>, dropped: Record<string, Array<*>>, skippedKeys: string[] }}
 */
function importJson({ dataDir, dbPath }) {
  if (fs.existsSync(dbPath)) throw new ImportError(`${dbPath} already exists; the import only builds a new database`);

  const db = readJson(path.join(dataDir, 'db.json'), { optional: true }) ?? {};
  if (db === null || typeof db !== 'object' || Array.isArray(db)) throw new ImportError('db.json is not a JSON object');
  const roster = readJson(path.join(dataDir, 'custom-onboarding.json'));

  const skippedKeys = Object.keys(db).filter((key) => DEAD_KEYS.includes(key));
  const unknown = Object.keys(db).filter((key) => !DEAD_KEYS.includes(key) && !DB_COLLECTIONS.includes(key));
  if (unknown.length) throw new ImportError(`db.json has unknown collections: ${unknown.join(', ')}`);

  const { rows, dropped } = prepareRows(db, roster);
  checkUnique(rows);

  const database = configure(new Database(dbPath));
  try {
    migrate(database);
    const tables = {};
    database.transaction(() => {
      for (const collection of ['onboarding-resources', ...DB_COLLECTIONS]) {
        const insert = database.prepare(insertSql(collection));
        for (const row of rows[collection]) {
          try {
            insert.run(toColumns(collection, row));
          } catch (error) {
            throw new ImportError(`${collection}: can't store ${show(row)}: ${error.message}`);
          }
        }
        tables[TABLES[collection].table] = rows[collection].length;
      }
    })();
    return { tables, dropped, skippedKeys };
  } catch (error) {
    database.close();
    fs.rmSync(dbPath, { force: true });
    fs.rmSync(dbPath + '-wal', { force: true });
    fs.rmSync(dbPath + '-shm', { force: true });
    throw error;
  } finally {
    if (database.open) database.close();
  }
}

// ── npm run db:migrate (Phase 6) ─────────────────────────────────────────────
// server/scripts/db-migrate.js reaches the files only through these.

/** The database's -wal/-shm files, which SQLite keeps next to it. */
const SIDE_SUFFIXES = ['-wal', '-shm'];

const fileStamp = (date) => date.toISOString().replace(/[:.]/g, '-');

/** Whether the database file itself exists. */
function databaseExists(dbPath) {
  return fs.existsSync(dbPath);
}

/**
 * Refuses to go on while another connection (e.g. a running server) has the
 * database open. Leaving WAL mode needs every other connection closed, so
 * with no busy wait it fails at once with SQLITE_BUSY when one is open, even
 * an idle one, on every platform. (On Windows deleting an open file fails too,
 * but on Linux and macOS it would succeed, and the server would carry on
 * writing to the deleted file.) A file SQLite can't read as a database at all
 * can't be open as one, so it doesn't stop a rebuild.
 */
function assertNotInUse(dbPath) {
  let probe;
  try {
    probe = new Database(dbPath, { fileMustExist: true, timeout: 0 });
    probe.pragma('journal_mode = DELETE');
  } catch (error) {
    if (/^SQLITE_(?:BUSY|LOCKED)/.test(error.code || '')) {
      throw new ImportError(`${dbPath} is open in another process (is the API server running?). Stop it and try again; nothing was changed`);
    }
  } finally {
    if (probe && probe.open) probe.close();
  }
}

/** Deletes the database and its -wal/-shm files, the database first. */
function removeDatabase(files) {
  for (const file of files) {
    try {
      fs.rmSync(file, { force: true });
    } catch (error) {
      if (!['EBUSY', 'EPERM', 'EACCES'].includes(error.code)) throw error;
      throw new ImportError(`can't delete ${file}: it is open in another process (is the API server running?). Stop it and run npm run db:migrate -- --force again`, { cause: error });
    }
  }
}

/**
 * npm run db:migrate: builds dbPath from dataDir's JSON files with importJson.
 *
 * Without force, an existing database is refused, and so are -wal/-shm files
 * left without one (SQLite would read a stale -wal into the new database).
 *
 * With force, the new database is built next to the old one first
 * (<dbPath>.tmp-<timestamp>), so JSON the import refuses leaves the old one
 * untouched. Then, if no other process has the old one open, it is deleted
 * with its -wal/-shm files, and the new one is renamed into place.
 *
 * @param {{ dataDir: string, dbPath: string, force?: boolean, now?: Date }} options
 * @returns the import's report, plus `replaced`: whether an old database (or
 *   leftover -wal/-shm files) was replaced
 */
function buildDatabase({ dataDir, dbPath, force = false, now = new Date() }) {
  const existing = [dbPath, ...SIDE_SUFFIXES.map((suffix) => dbPath + suffix)].filter((file) => fs.existsSync(file));
  if (!force) {
    if (existing.includes(dbPath)) {
      throw new ImportError(`${dbPath} already exists; nothing was changed. npm run db:migrate -- --force rebuilds it from the JSON files, discarding every change made in it since`);
    }
    if (existing.length) {
      throw new ImportError(`${existing.map((file) => path.basename(file)).join(' and ')} in ${path.dirname(dbPath)} belong to no database; nothing was changed. npm run db:migrate -- --force deletes them and builds it`);
    }
    return { ...importJson({ dataDir, dbPath }), replaced: false };
  }

  const tempPath = `${dbPath}.tmp-${fileStamp(now)}`;
  const report = importJson({ dataDir, dbPath: tempPath });
  try {
    if (existing.includes(dbPath)) assertNotInUse(dbPath);
    removeDatabase(existing);
    fs.renameSync(tempPath, dbPath);
  } catch (error) {
    for (const file of [tempPath, ...SIDE_SUFFIXES.map((suffix) => tempPath + suffix)]) fs.rmSync(file, { force: true });
    throw error;
  }
  return { ...report, replaced: existing.length > 0 };
}

/** The report as lines of text. */
function formatReport({ tables, dropped, skippedKeys }) {
  const lines = ['Rows per table:'];
  for (const [table, count] of Object.entries(tables)) lines.push(`  ${table.padEnd(22)} ${count}`);
  const droppedEntries = Object.entries(dropped);
  if (!droppedEntries.length) lines.push('Dropped rows: none');
  for (const [collection, ids] of droppedEntries) {
    lines.push(`Dropped ${ids.length} ${collection} rows whose id isn't an integer: ${ids.map((id) => JSON.stringify(id)).join(', ')}`);
  }
  lines.push(`Skipped keys in db.json: ${skippedKeys.length ? skippedKeys.join(', ') : 'none'}`);
  return lines;
}

module.exports = { importJson, buildDatabase, databaseExists, formatReport, ImportError, DEAD_KEYS, DB_COLLECTIONS };
