// npm run db:migrate (docs/sqlite-migration-plan.md, Phase 6 step 2): builds
// DATA_DIR/dashboard.sqlite from the JSON files with the import, refuses to
// overwrite it without --force, does nothing with --if-missing when it exists,
// and never deletes a database another process has open. The tests run the
// CLI with DATA_DIR pointing at a temp directory. They don't start the app, so
// they run on every backend.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Database = require('better-sqlite3');
const { SERVER_DIR, FIXTURES_DIR } = require('../helpers/test-server');

const { importJson, formatReport } = require(path.join(SERVER_DIR, 'persistence', 'sqlite', 'import.js'));

const CLI = path.join(SERVER_DIR, 'scripts', 'db-migrate.js');

function tempDir(t, label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `song-tracker-${label}-`));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }));
  return dir;
}

/** A temp DATA_DIR holding a copy of the fixtures. */
function fixtureDataDir(t) {
  const dataDir = tempDir(t, 'migrate-data');
  fs.cpSync(FIXTURES_DIR, dataDir, { recursive: true });
  return dataDir;
}

/** Runs the CLI with DATA_DIR set, as `npm run db:migrate -- …args` would. */
const run = (dataDir, args = []) => spawnSync(process.execPath, [CLI, ...args], {
  env: { ...process.env, DATA_DIR: dataDir },
  encoding: 'utf8',
});

/** The report the import gives for the fixtures, built in a directory of its own. */
function fixtureReport(t) {
  const dir = fixtureDataDir(t);
  return formatReport(importJson({ dataDir: dir, dbPath: path.join(dir, 'dashboard.sqlite') })).join('\n');
}

/** The SQLite files (and leftover temp files) in dir. */
const sqliteFiles = (dir) => fs.readdirSync(dir).filter((name) => name.includes('.sqlite')).sort();

/** Every file in dir with its bytes, to show nothing changed. */
function snapshotDir(dir) {
  return Object.fromEntries(fs.readdirSync(dir).sort()
    .filter((name) => fs.statSync(path.join(dir, name)).isFile())
    .map((name) => [name, fs.readFileSync(path.join(dir, name)).toString('base64')]));
}

/**
 * A query on the database, on a connection that is closed again afterwards.
 * Read-only, so it can leave the -wal/-shm files behind: check the files first.
 */
function query(dbPath, sql) {
  const database = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    return database.prepare(sql).all();
  } finally {
    database.close();
  }
}

/** Renames sprint 1 directly in the database, as a change made through the app would. */
function renameSprint(dbPath, name) {
  const database = new Database(dbPath, { fileMustExist: true });
  try {
    database.prepare('UPDATE sprints SET name = ? WHERE id = 1').run(name);
  } finally {
    database.close();
  }
}

const sprintName = (dbPath) => query(dbPath, 'SELECT name FROM sprints WHERE id = 1')[0].name;

describe('npm run db:migrate', () => {
  test('builds DATA_DIR/dashboard.sqlite from the JSON files and prints the import report', (t) => {
    const dataDir = fixtureDataDir(t);
    const dbPath = path.join(dataDir, 'dashboard.sqlite');
    const result = run(dataDir);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, `Built ${dbPath} from the JSON files in ${dataDir}\n${fixtureReport(t)}\n`);
    assert.equal(result.stderr, '');
    assert.deepEqual(sqliteFiles(dataDir), ['dashboard.sqlite'], 'no -wal/-shm or temp files left');
    assert.deepEqual(query(dbPath, 'SELECT count(*) AS n FROM planner_tasks'), [{ n: 6 }]);
  });

  test('refuses to overwrite an existing database: exit 1, nothing changed', (t) => {
    const dataDir = fixtureDataDir(t);
    const dbPath = path.join(dataDir, 'dashboard.sqlite');
    assert.equal(run(dataDir).status, 0);
    const before = snapshotDir(dataDir);

    const result = run(dataDir);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr.trim(), `db:migrate failed: ${dbPath} already exists; nothing was changed. ` +
      'npm run db:migrate -- --force rebuilds it from the JSON files, discarding every change made in it since');
    assert.deepEqual(snapshotDir(dataDir), before);
  });

  test('--if-missing does nothing when the database exists', (t) => {
    const dataDir = fixtureDataDir(t);
    const dbPath = path.join(dataDir, 'dashboard.sqlite');
    assert.equal(run(dataDir).status, 0);
    renameSprint(dbPath, 'Changed in the app');
    const before = snapshotDir(dataDir);

    const result = run(dataDir, ['--if-missing']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, `db:migrate: ${dbPath} already exists; nothing to do (--if-missing)\n`);
    assert.deepEqual(snapshotDir(dataDir), before);
    assert.equal(sprintName(dbPath), 'Changed in the app');
  });

  test('--if-missing builds a missing database', (t) => {
    const dataDir = fixtureDataDir(t);
    const result = run(dataDir, ['--if-missing']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^Built .*dashboard\.sqlite from the JSON files in /);
    assert.deepEqual(sqliteFiles(dataDir), ['dashboard.sqlite']);
  });

  test('--force rebuilds the database from the JSON files, discarding changes made in it', (t) => {
    const dataDir = fixtureDataDir(t);
    const dbPath = path.join(dataDir, 'dashboard.sqlite');
    assert.equal(run(dataDir).status, 0);
    const original = sprintName(dbPath);
    renameSprint(dbPath, 'Changed in the app');

    const result = run(dataDir, ['--force']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, `Rebuilt ${dbPath} from the JSON files in ${dataDir}\n${fixtureReport(t)}\n`);
    assert.deepEqual(sqliteFiles(dataDir), ['dashboard.sqlite'], 'no -wal/-shm or temp files left');
    assert.equal(sprintName(dbPath), original);
  });

  test('--force with no database just builds it', (t) => {
    const dataDir = fixtureDataDir(t);
    const result = run(dataDir, ['--force']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^Built /);
    assert.deepEqual(sqliteFiles(dataDir), ['dashboard.sqlite']);
  });

  // Risks, "Windows file locks": a running server holds the database open.
  // On Windows deleting it would fail half way; on Linux and macOS it would
  // succeed and the server would keep writing to the deleted file.
  test('--force while another process has the database open: exit 1, nothing deleted', (t) => {
    const dataDir = fixtureDataDir(t);
    const dbPath = path.join(dataDir, 'dashboard.sqlite');
    assert.equal(run(dataDir).status, 0);
    renameSprint(dbPath, 'Changed in the app');
    const holder = new Database(dbPath, { fileMustExist: true });
    t.after(() => holder.open && holder.close());
    holder.pragma('journal_mode = WAL');
    holder.prepare('SELECT count(*) FROM sprints').get();
    const files = sqliteFiles(dataDir);

    const result = run(dataDir, ['--force']);
    assert.equal(result.status, 1);
    assert.equal(result.stderr.trim(), `db:migrate failed: ${dbPath} is open in another process (is the API server running?). ` +
      'Stop it and try again; nothing was changed');
    assert.deepEqual(sqliteFiles(dataDir), files, 'the database files are all still there, and no temp file is left');
    assert.equal(holder.prepare('SELECT name FROM sprints WHERE id = 1').get().name, 'Changed in the app');

    holder.close();
    assert.equal(run(dataDir, ['--force']).status, 0, 'once it is closed, --force works');
    assert.notEqual(sprintName(dbPath), 'Changed in the app');
  });

  test('--force with JSON the import refuses: exit 1, the old database untouched', (t) => {
    const dataDir = fixtureDataDir(t);
    const dbPath = path.join(dataDir, 'dashboard.sqlite');
    assert.equal(run(dataDir).status, 0);
    renameSprint(dbPath, 'Changed in the app');
    fs.writeFileSync(path.join(dataDir, 'db.json'), JSON.stringify({ sprints: [], bogus: [] }, null, 2), 'utf8');
    const before = snapshotDir(dataDir);

    const result = run(dataDir, ['--force']);
    assert.equal(result.status, 1);
    assert.equal(result.stderr.trim(), 'db:migrate failed: db.json has unknown collections: bogus');
    assert.deepEqual(snapshotDir(dataDir), before, 'no temp file, and the database is unchanged');
    assert.equal(sprintName(dbPath), 'Changed in the app');
  });

  test('--force replaces a file that is not a database', (t) => {
    const dataDir = fixtureDataDir(t);
    const dbPath = path.join(dataDir, 'dashboard.sqlite');
    fs.writeFileSync(dbPath, 'this is not a database, just text that is long enough to have a header'.repeat(10));

    const result = run(dataDir, ['--force']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^Rebuilt /);
    assert.deepEqual(query(dbPath, 'SELECT count(*) AS n FROM planner_tasks'), [{ n: 6 }]);
  });

  // SQLite would read a leftover -wal into a new database with the same name.
  test('-wal/-shm files left without a database block a build; --force deletes them', (t) => {
    const dataDir = fixtureDataDir(t);
    fs.writeFileSync(path.join(dataDir, 'dashboard.sqlite-wal'), 'left over');
    fs.writeFileSync(path.join(dataDir, 'dashboard.sqlite-shm'), 'left over');

    for (const args of [[], ['--if-missing']]) {
      const result = run(dataDir, args);
      assert.equal(result.status, 1, args.join(' '));
      assert.equal(result.stderr.trim(), `db:migrate failed: dashboard.sqlite-wal and dashboard.sqlite-shm in ${dataDir} ` +
        'belong to no database; nothing was changed. npm run db:migrate -- --force deletes them and builds it');
      assert.deepEqual(sqliteFiles(dataDir), ['dashboard.sqlite-shm', 'dashboard.sqlite-wal']);
    }

    const result = run(dataDir, ['--force']);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(sqliteFiles(dataDir), ['dashboard.sqlite']);
    assert.deepEqual(query(path.join(dataDir, 'dashboard.sqlite'), 'SELECT count(*) AS n FROM planner_tasks'), [{ n: 6 }]);
  });

  test('a missing roster: exit 1, no database', (t) => {
    const dataDir = fixtureDataDir(t);
    fs.rmSync(path.join(dataDir, 'custom-onboarding.json'));
    const result = run(dataDir);
    assert.equal(result.status, 1);
    assert.equal(result.stderr.trim(), `db:migrate failed: custom-onboarding.json is missing from ${dataDir}`);
    assert.deepEqual(sqliteFiles(dataDir), []);
  });

  test('bad arguments: exit 2 with the usage, nothing built', (t) => {
    const dataDir = fixtureDataDir(t);
    for (const args of [['--bogus'], ['--force', '--if-missing'], ['--out', 'x']]) {
      const result = run(dataDir, args);
      assert.equal(result.status, 2, args.join(' '));
      assert.match(result.stderr, /^usage: npm run db:migrate/m);
    }
    assert.deepEqual(sqliteFiles(dataDir), []);
  });
});
