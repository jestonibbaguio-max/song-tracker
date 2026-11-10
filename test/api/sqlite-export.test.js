// Unit tests for the SQLite → JSON export (docs/sqlite-migration-plan.md,
// Phase 5 step 1). Each test builds a small database with the import, from
// JSON it writes into a temp directory, and exports it. They don't start the
// app, so they run on every backend. The round trips through the app are in
// sqlite-roundtrip.test.js.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Database = require('better-sqlite3');
const { SERVER_DIR, FIXTURES_DIR } = require('../helpers/test-server');

const { importJson } = require(path.join(SERVER_DIR, 'persistence', 'sqlite', 'import.js'));
const { exportJson, formatReport, ExportError, DB_JSON_ORDER, ROSTER_KEY_ORDER } =
  require(path.join(SERVER_DIR, 'persistence', 'sqlite', 'export.js'));

const CLI = path.join(SERVER_DIR, 'scripts', 'db-export.js');
const NOW = new Date('2026-11-10T08:30:00.000Z');
const STAMP = '2026-11-10T08-30-00-000Z';
const OLDER = '2026-10-01T00:00:00.000Z';
const NEWER = '2026-11-01T00:00:00.000Z';

function tempDir(t, label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `song-tracker-${label}-`));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }));
  return dir;
}

/** Writes db.json and the roster to a new temp dir and imports them; returns the dir and the database path. */
function buildDatabase(t, { db = {}, roster = [{ id: 1, eid: 'a.person', name: 'A Person', created_at: NEWER, updated_at: NEWER }] } = {}) {
  const dataDir = tempDir(t, 'export-data');
  fs.writeFileSync(path.join(dataDir, 'db.json'), JSON.stringify(db, null, 2), 'utf8');
  fs.writeFileSync(path.join(dataDir, 'custom-onboarding.json'), JSON.stringify(roster, null, 2) + '\n', 'utf8');
  const dbPath = path.join(dataDir, 'dashboard.sqlite');
  importJson({ dataDir, dbPath });
  return { dataDir, dbPath };
}

/** The fixtures, imported into a new temp database. */
function buildFixtureDatabase(t) {
  const dataDir = tempDir(t, 'export-fixtures');
  fs.cpSync(FIXTURES_DIR, dataDir, { recursive: true });
  const dbPath = path.join(dataDir, 'dashboard.sqlite');
  importJson({ dataDir, dbPath });
  return { dataDir, dbPath };
}

const readText = (dir, file) => fs.readFileSync(path.join(dir, file), 'utf8');
const readJson = (dir, file) => JSON.parse(readText(dir, file));

/** Every file in dir with its bytes, to show nothing changed. */
function snapshotDir(dir) {
  if (!fs.existsSync(dir)) return null;
  return Object.fromEntries(fs.readdirSync(dir).sort().map((name) => [name, fs.readFileSync(path.join(dir, name)).toString('base64')]));
}

describe('sqlite export', () => {
  test('writes both files in the JSON backend\'s format, with every collection in a fixed order', (t) => {
    const { dbPath } = buildFixtureDatabase(t);
    const outDir = path.join(tempDir(t, 'export-out'), 'new-folder');

    const report = exportJson({ dbPath, outDir, now: NOW });

    assert.deepEqual(fs.readdirSync(outDir).sort(), ['custom-onboarding.json', 'db.json'], 'creates the folder, writes only the two files');
    for (const [file, trailing] of [['db.json', ''], ['custom-onboarding.json', '\n']]) {
      const text = readText(outDir, file);
      assert.ok(!text.startsWith('﻿'), `${file}: no BOM`);
      assert.ok(!text.includes('\r'), `${file}: LF line endings`);
      assert.equal(text, JSON.stringify(JSON.parse(text), null, 2) + trailing, `${file}: 2-space JSON, byte for byte`);
    }
    const db = readJson(outDir, 'db.json');
    assert.deepEqual(Object.keys(db), DB_JSON_ORDER);
    assert.deepEqual(Object.keys(db), Object.keys(readJson(FIXTURES_DIR, 'db.json')), 'the fixtures\' collection order');
    assert.equal(report.rows['onboarding-resources'], readJson(FIXTURES_DIR, 'custom-onboarding.json').length);
    assert.deepEqual(report.files, [path.join(outDir, 'db.json'), path.join(outDir, 'custom-onboarding.json')]);
    assert.deepEqual(report.backups, []);
    assert.ok(formatReport(report).includes('Backups: none (no previous files)'));
  });

  test('writes the collections that are empty, and none of the dead keys', (t) => {
    const { dbPath } = buildDatabase(t, { db: { dashboard: { nav: [] }, $schema: 'x', 'onboarding-resources': [{ id: 1 }] } });
    const outDir = tempDir(t, 'export-out');
    exportJson({ dbPath, outDir });
    const db = readJson(outDir, 'db.json');
    assert.deepEqual(Object.keys(db), DB_JSON_ORDER);
    for (const collection of DB_JSON_ORDER) assert.deepEqual(db[collection], [], collection);
  });

  test('rows: numeric ids in id order, column order, and absent, "" and null kept apart', (t) => {
    const { dbPath } = buildDatabase(t, {
      db: {
        sprints: [
          { end: '2026-11-07', name: 'Sprint 2', start: '2026-10-27', id: '2' },
          { id: 1, name: 'Sprint 1', start: '2026-10-13', end: '2026-10-24' },
        ],
        'capacity-entries': [
          { id: 1, sprintName: 1, eid: 'a.person', cadence: 4, admin: 0, holiday: 0 },
          { id: 2, sprintName: '1', eid: 'a.person', cadence: 3.5, admin: 1, holiday: 0 },
        ],
        attendance: [{ id: '3' }],
        'planner-tasks': [
          { id: 1, boardId: 1, bucketId: 2, title: 'With', labels: ['1', 2], completed: false, completedDate: '', notes: '', createdAt: OLDER, updatedAt: OLDER },
          { id: 2, boardId: null, bucketId: 2, title: 'Without', completed: true, createdAt: OLDER, updatedAt: NEWER },
        ],
        'project-reachouts': [
          { id: 1, eid: 'a.person', projectName: 'P', techRole: 'Dev', pocEid: 'b.person', status: 'Open', details: '', groupNumber: null, createdAt: OLDER },
        ],
      },
    });
    const outDir = tempDir(t, 'export-out');
    exportJson({ dbPath, outDir });
    const db = readJson(outDir, 'db.json');

    assert.deepEqual(db.sprints, [
      { id: 1, name: 'Sprint 1', start: '2026-10-13', end: '2026-10-24' },
      { id: 2, name: 'Sprint 2', start: '2026-10-27', end: '2026-11-07' },
    ]);
    assert.deepEqual(Object.keys(db.sprints[1]), ['id', 'name', 'start', 'end'], 'fields in column order');
    assert.deepEqual(db['capacity-entries'].map((e) => e.sprintName), [1, '1'], '1 and "1" keep their types');
    assert.deepEqual(db.attendance, [{ id: 3 }], 'optional fields that were never set stay absent');
    assert.deepEqual(db['planner-tasks'], [
      { id: 1, boardId: 1, bucketId: 2, title: 'With', labels: [1, 2], completed: false, completedDate: '', notes: '', createdAt: OLDER, updatedAt: OLDER },
      { id: 2, boardId: null, bucketId: 2, title: 'Without', completed: true, createdAt: OLDER, updatedAt: NEWER },
    ], '"" stays "", an absent completedDate/notes stays absent, a null boardId stays null');
    assert.deepEqual(db['project-reachouts'][0].groupNumber, null, 'an always-present null is written as null');
    assert.ok(!('updatedAt' in db['project-reachouts'][0]), 'an optional field that was never set stays absent');
  });

  test('competency rows come out in insertion order, not eid order', (t) => {
    const { dbPath } = buildDatabase(t, {
      db: { 'competency-records': [{ eid: 'z.person', primarySkill: 'AEM' }, { eid: 'a.person', primarySkill: 'React' }] },
    });
    const database = new Database(dbPath);
    database.prepare("INSERT INTO competency_records (eid, primary_skill) VALUES ('m.person', 'Node.js')").run();
    database.close();
    const outDir = tempDir(t, 'export-out');
    exportJson({ dbPath, outDir });
    assert.deepEqual(readJson(outDir, 'db.json')['competency-records'], [
      { eid: 'z.person', primarySkill: 'AEM' },
      { eid: 'a.person', primarySkill: 'React' },
      { eid: 'm.person', primarySkill: 'Node.js' },
    ]);
  });

  test('the roster: newest first, camelCase fields in the API\'s order, created_at/updated_at as the API writes them', (t) => {
    const { dbPath } = buildDatabase(t, {
      roster: [
        { id: 1, eid: 'old.person', name: 'Old Person', group_number: 3, hire_date: '01/05/2026', another_skills: '["AEM"]', created_at: OLDER, updated_at: OLDER },
        { id: 2, eid: 'new.person', name: 'New Person', groupNumber: 2, created_at: NEWER, updated_at: NEWER },
        { id: 3, eid: 'same.time', name: 'Same Time', created_at: NEWER, updated_at: NEWER },
      ],
    });
    const outDir = tempDir(t, 'export-out');
    exportJson({ dbPath, outDir });
    const roster = readJson(outDir, 'custom-onboarding.json');

    assert.deepEqual(roster.map((r) => r.id), [3, 2, 1], 'newest created_at first, then highest id');
    for (const record of roster) assert.deepEqual(Object.keys(record), ROSTER_KEY_ORDER);
    const old = roster[2];
    assert.equal(old.groupNumber, 3);
    assert.equal(old.hireDate, '01/05/2026');
    assert.deepEqual(old.anotherSkills, ['AEM']);
    assert.equal(old.projectDeployed, 'No', 'the defaults the API reads with');
    assert.equal(old.created_at, OLDER);
  });

  test('backs up the files it replaces, byte for byte', (t) => {
    const { dbPath } = buildDatabase(t);
    const outDir = tempDir(t, 'export-out');
    fs.writeFileSync(path.join(outDir, 'db.json'), '﻿{"sprints": "old, with a BOM"}', 'utf8');
    fs.writeFileSync(path.join(outDir, 'custom-onboarding.json'), '[]\r\n', 'utf8');
    fs.writeFileSync(path.join(outDir, 'tasks.json'), '[]', 'utf8');
    const before = snapshotDir(outDir);

    const report = exportJson({ dbPath, outDir, now: NOW });

    assert.deepEqual(report.backups, [
      path.join(outDir, `db.json.bak-${STAMP}`),
      path.join(outDir, `custom-onboarding.json.bak-${STAMP}`),
    ]);
    const after = snapshotDir(outDir);
    assert.equal(after[`db.json.bak-${STAMP}`], before['db.json']);
    assert.equal(after[`custom-onboarding.json.bak-${STAMP}`], before['custom-onboarding.json']);
    assert.equal(after['tasks.json'], before['tasks.json'], 'other files are left alone');
    assert.deepEqual(Object.keys(after), ['custom-onboarding.json', `custom-onboarding.json.bak-${STAMP}`, 'db.json', `db.json.bak-${STAMP}`, 'tasks.json'],
      'no temp files are left');
    assert.equal(readJson(outDir, 'custom-onboarding.json')[0].eid, 'a.person');
  });

  test('never overwrites a backup: an existing one stops the export before anything is written', (t) => {
    const { dbPath } = buildDatabase(t);
    const outDir = tempDir(t, 'export-out');
    fs.writeFileSync(path.join(outDir, 'db.json'), '{}', 'utf8');
    fs.writeFileSync(path.join(outDir, 'custom-onboarding.json'), '[]\n', 'utf8');
    fs.writeFileSync(path.join(outDir, `custom-onboarding.json.bak-${STAMP}`), 'an earlier backup', 'utf8');
    const before = snapshotDir(outDir);

    assert.throws(() => exportJson({ dbPath, outDir, now: NOW }), (error) => error instanceof ExportError
      && error.message.includes(`custom-onboarding.json.bak-${STAMP} already exists`));
    const after = snapshotDir(outDir);
    // The db.json backup made before the clash is the only new file.
    assert.deepEqual(Object.keys(after), [...Object.keys(before), `db.json.bak-${STAMP}`].sort());
    for (const name of Object.keys(before)) assert.equal(after[name], before[name], `${name} is unchanged`);
  });

  test('a missing database is refused before anything is written, and no database is created', (t) => {
    const dataDir = tempDir(t, 'export-data');
    const outDir = tempDir(t, 'export-out');
    fs.writeFileSync(path.join(outDir, 'db.json'), '{"sprints": []}', 'utf8');
    fs.writeFileSync(path.join(outDir, 'custom-onboarding.json'), '[]\n', 'utf8');
    const before = snapshotDir(outDir);

    for (const dbPath of [path.join(dataDir, 'dashboard.sqlite'), path.join(dataDir, 'no-such-folder', 'dashboard.sqlite')]) {
      assert.throws(() => exportJson({ dbPath, outDir }), (error) => error instanceof ExportError
        && error.message === `No SQLite database at ${dbPath}; nothing was exported`);
    }
    assert.deepEqual(snapshotDir(outDir), before, 'the existing files are untouched, with no backups');
    assert.deepEqual(fs.readdirSync(dataDir), [], 'no database file was created');
  });

  test('an empty file (no dashboard schema) is refused, and left as it was', (t) => {
    const dataDir = tempDir(t, 'export-data');
    const dbPath = path.join(dataDir, 'dashboard.sqlite');
    fs.writeFileSync(dbPath, '');
    const outDir = path.join(dataDir, 'out');

    assert.throws(() => exportJson({ dbPath, outDir }), (error) => error instanceof ExportError
      && error.message === `${dbPath} has no dashboard schema (PRAGMA user_version is 0); nothing was exported`);
    assert.deepEqual(fs.readdirSync(dataDir), ['dashboard.sqlite'], 'no out folder, no -wal/-shm files');
    assert.equal(fs.statSync(dbPath).size, 0);
  });

  test('a file that isn\'t a database is refused', (t) => {
    const dataDir = tempDir(t, 'export-data');
    const dbPath = path.join(dataDir, 'dashboard.sqlite');
    fs.writeFileSync(dbPath, 'this is not a database, just text that is long enough to have a header'.repeat(10));
    assert.throws(() => exportJson({ dbPath, outDir: path.join(dataDir, 'out') }), (error) => error instanceof ExportError
      && error.message === `${dbPath} is not a SQLite database; nothing was exported`);
    assert.deepEqual(fs.readdirSync(dataDir), ['dashboard.sqlite']);
  });
});

describe('npm run db:export', () => {
  /** Runs the CLI with DATA_DIR set, as `npm run db:export -- …args` would. */
  const run = (dataDir, args = []) => spawnSync(process.execPath, [CLI, ...args], {
    env: { ...process.env, DATA_DIR: dataDir },
    encoding: 'utf8',
  });

  test('--out <dir> exports DATA_DIR\'s database there and prints the report', (t) => {
    const { dataDir } = buildFixtureDatabase(t);
    const outDir = tempDir(t, 'export-out');
    const result = run(dataDir, ['--out', outDir]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^Exported .*dashboard\.sqlite$/m);
    assert.match(result.stdout, /^ {2}planner-tasks +6$/m);
    assert.match(result.stdout, /^Backups: none \(no previous files\)$/m);
    assert.deepEqual(fs.readdirSync(outDir).sort(), ['custom-onboarding.json', 'db.json']);
  });

  test('without --out it writes to DATA_DIR, backing up the files there', (t) => {
    const { dataDir } = buildFixtureDatabase(t);
    const before = fs.readFileSync(path.join(dataDir, 'db.json'));
    const result = run(dataDir);
    assert.equal(result.status, 0, result.stderr);
    const backups = fs.readdirSync(dataDir).filter((name) => name.includes('.bak-')).sort();
    assert.deepEqual(backups.map((name) => name.replace(/\.bak-.*/, '')), ['custom-onboarding.json', 'db.json']);
    assert.ok(fs.readFileSync(path.join(dataDir, backups[1])).equals(before), 'the backup holds the old db.json');
    assert.match(result.stdout, /^Backed up the previous files to:$/m);
  });

  test('a missing database: exit 1 with a clear message, nothing written', (t) => {
    const dataDir = tempDir(t, 'export-data');
    const result = run(dataDir);
    assert.equal(result.status, 1);
    assert.equal(result.stderr.trim(), `db:export failed: No SQLite database at ${path.join(dataDir, 'dashboard.sqlite')}; nothing was exported`);
    assert.deepEqual(fs.readdirSync(dataDir), []);
  });

  test('bad arguments: exit 2 with the usage', (t) => {
    const dataDir = tempDir(t, 'export-data');
    for (const args of [['--bogus'], ['--out'], ['--out', '--force']]) {
      const result = run(dataDir, args);
      assert.equal(result.status, 2, args.join(' '));
      assert.match(result.stderr, /^usage: npm run db:export/m);
    }
    assert.deepEqual(fs.readdirSync(dataDir), []);
  });
});
