// Unit tests for the JSON → SQLite import (docs/sqlite-migration-plan.md,
// Phase 4 step 5). The fixtures cover none of these cases, so each test
// writes its own small db.json and roster into a temp directory, imports
// them, and reads the tables back. They don't start the app, so they run on
// every backend.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const { SERVER_DIR } = require('../helpers/test-server');

const { importJson, formatReport, ImportError } = require(path.join(SERVER_DIR, 'persistence', 'sqlite', 'import.js'));
const { fromColumns, spec } = require(path.join(SERVER_DIR, 'persistence', 'sqlite', 'tables.js'));

const NOW = '2026-11-01T00:00:00.000Z';
const rosterRecord = (fields) => ({ created_at: NOW, updated_at: NOW, ...fields });

/** Write db.json and custom-onboarding.json to a new temp dir, and import them. */
function importFiles(t, { db = {}, roster = [rosterRecord({ id: 1, eid: 'a.person', name: 'A Person' })] } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'song-tracker-import-'));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 3 }));
  fs.writeFileSync(path.join(dataDir, 'db.json'), JSON.stringify(db, null, 2), 'utf8');
  fs.writeFileSync(path.join(dataDir, 'custom-onboarding.json'), JSON.stringify(roster, null, 2) + '\n', 'utf8');
  const dbPath = path.join(dataDir, 'dashboard.sqlite');
  return {
    dbPath,
    run: () => importJson({ dataDir, dbPath }),
    /** Every row of a collection's table as API fields, in id (or rowid) order. */
    rows(collection, orderBy = 'rowid') {
      const database = new Database(dbPath, { readonly: true });
      try {
        return database.prepare(`SELECT * FROM ${spec(collection).table} ORDER BY ${orderBy}`).all()
          .map((record) => fromColumns(collection, record));
      } finally {
        database.close();
      }
    },
  };
}

describe('sqlite import', () => {
  test('drops attendance rows whose id is not an integer, and reports them', (t) => {
    const files = importFiles(t, {
      db: {
        attendance: [
          { id: '1', eid: 'a.person', year: 2026, month: 10, day: 27, status: 'Present' },
          { id: 'RxJX-3dWOPE', eid: 'a.person', year: 2026, month: 10, day: 27, status: 'Absent' },
          { id: 2, eid: 'a.person', year: 2026, month: 10, day: 28, status: 'RTO', location: 'Cebu' },
          { id: '2.5', eid: 'a.person', year: 2026, month: 10, day: 29, status: 'Absent' },
        ],
      },
    });
    const report = files.run();
    assert.deepEqual(report.dropped, { attendance: ['RxJX-3dWOPE', '2.5'] });
    assert.equal(report.tables.attendance, 2);
    assert.deepEqual(files.rows('attendance').map((r) => r.id), [1, 2], 'the remaining ids are numbers');
    assert.ok(formatReport(report).some((line) => line.includes('"RxJX-3dWOPE", "2.5"')), 'the report names the dropped ids');
  });

  test('converts ids and task labels to numbers', (t) => {
    const files = importFiles(t, {
      db: {
        'planner-labels': [{ id: '1', name: 'Frontend', color: '#123456' }, { id: 6, name: 'Docs', color: '#abcdef' }],
        'planner-tasks': [{ id: '3', boardId: 1, bucketId: 2, title: 'T', labels: [1, '5'], checklist: [], completed: false, createdAt: NOW, updatedAt: NOW }],
      },
    });
    files.run();
    assert.deepEqual(files.rows('planner-labels').map((r) => r.id), [1, 6]);
    const [task] = files.rows('planner-tasks');
    assert.equal(task.id, 3);
    assert.deepEqual(task.labels, [1, 5]);
    assert.equal(task.completed, false);
  });

  test('refuses a duplicate roster eid, naming both records, and leaves no database', (t) => {
    const files = importFiles(t, {
      roster: [rosterRecord({ id: 2, eid: 'a.person', name: 'First' }), rosterRecord({ id: 1, eid: 'a.person', name: 'Second' })],
    });
    assert.throws(() => files.run(), (error) => {
      assert.ok(error instanceof ImportError);
      assert.match(error.message, /^onboarding-resources: duplicate eid "a\.person"/);
      assert.match(error.message, /"name":"First"/);
      assert.match(error.message, /"name":"Second"/);
      return true;
    });
    assert.equal(fs.existsSync(files.dbPath), false);
  });

  test('refuses a duplicate capacity (sprintName, eid), but 1 and "1" are different keys', (t) => {
    const entry = (id, sprintName) => ({ id, sprintName, eid: 'a.person', cadence: 1, admin: 0, holiday: 0 });
    const duplicate = importFiles(t, { db: { 'capacity-entries': [entry(1, 'Sprint 1'), entry(2, 'Sprint 1')] } });
    assert.throws(() => duplicate.run(), /capacity-entries: duplicate sprintName \+ eid "Sprint 1","a\.person"/);

    const distinct = importFiles(t, { db: { 'capacity-entries': [entry(1, 1), entry(2, '1')] } });
    distinct.run();
    assert.deepEqual(distinct.rows('capacity-entries').map((r) => r.sprintName), [1, '1']);
  });

  test('refuses a duplicate competency eid', (t) => {
    const files = importFiles(t, { db: { 'competency-records': [{ eid: 'a.person', primarySkill: 'AEM' }, { eid: 'a.person', primarySkill: 'React' }] } });
    assert.throws(() => files.run(), /competency-records: duplicate eid "a\.person"/);
  });

  test('skips the dead keys and reports them; refuses an unknown key', (t) => {
    const files = importFiles(t, {
      db: { $schema: './schema.json', 'onboarding-resources': [{ id: 1 }], dashboard: { nav: [] }, sprints: [{ id: 1, name: 'Sprint 1', start: '2026-10-27', end: '2026-11-07' }] },
    });
    const report = files.run();
    assert.deepEqual(report.skippedKeys, ['$schema', 'onboarding-resources', 'dashboard']);
    assert.equal(report.tables.sprints, 1);
    assert.equal(report.tables.onboarding_resources, 1, 'the roster comes from custom-onboarding.json, not db.json');

    const unknown = importFiles(t, { db: { 'mock-interviews': [] } });
    assert.throws(() => unknown.run(), /db\.json has unknown collections: mock-interviews/);
  });

  test('refuses a collection that is not an array', (t) => {
    const files = importFiles(t, { db: { sprints: { a: 1 } } });
    assert.throws(() => files.run(), /db\.json: "sprints" is not an array/);
  });

  test('merges the roster\'s key styles the way the API reads them (camelCase first)', (t) => {
    const files = importFiles(t, {
      roster: [
        // The shape of iverson.c.cabangis: both styles, disagreeing.
        rosterRecord({ id: 3, eid: 'both.styles', name: 'Both Styles', groupNumber: 5, group_number: 6, hireDate: '08/05/2026', hire_date: '' }),
        // A camelCase record that keeps some fields in snake_case only.
        rosterRecord({ id: 2, eid: 'mostly.camel', name: 'Mostly Camel', groupNumber: 2, primary_skill: 'AEM', another_skills: ['HTL'], office_location: 'Cebu' }),
        // A legacy snake_case record.
        rosterRecord({ id: 1, eid: 'legacy.snake', name: 'Legacy Snake', group_number: 4, project_deployed: 'Yes', project_name: 'Retail' }),
      ],
    });
    files.run();
    const byEid = Object.fromEntries(files.rows('onboarding-resources', 'id').map((r) => [r.eid, r]));

    assert.equal(byEid['both.styles'].groupNumber, 5, 'groupNumber wins over group_number');
    assert.equal(byEid['both.styles'].hireDate, '08/05/2026');
    assert.equal(byEid['mostly.camel'].groupNumber, 2);
    assert.equal(byEid['mostly.camel'].primarySkill, 'AEM', 'a field only in snake_case is kept');
    assert.deepEqual(byEid['mostly.camel'].anotherSkills, ['HTL']);
    assert.equal(byEid['mostly.camel'].officeLocation, 'Cebu');
    assert.equal(byEid['legacy.snake'].groupNumber, 4);
    assert.equal(byEid['legacy.snake'].projectDeployed, 'Yes');
    assert.equal(byEid['legacy.snake'].projectName, 'Retail');
    assert.equal(byEid['legacy.snake'].dn, 'No', 'a missing field gets the API\'s default');
    assert.equal(byEid['legacy.snake'].created_at, NOW);
  });

  test('keeps "" apart from an absent completedDate and notes', (t) => {
    const task = (id, extra) => ({ id, boardId: 1, bucketId: 1, title: 'T', labels: [], checklist: [], completed: false, createdAt: NOW, updatedAt: NOW, ...extra });
    const files = importFiles(t, {
      db: { 'planner-tasks': [task(1, { completedDate: '', notes: '' }), task(2, { completedDate: '2026-11-02' }), task(3, {})] },
    });
    files.run();
    const [empty, dated, absent] = files.rows('planner-tasks', 'id');
    assert.equal(empty.completedDate, '');
    assert.equal(empty.notes, '');
    assert.equal(dated.completedDate, '2026-11-02');
    assert.equal('notes' in dated, false);
    assert.equal('completedDate' in absent, false);
    assert.equal('notes' in absent, false);
  });

  test('refuses to build over an existing database', (t) => {
    const files = importFiles(t);
    files.run();
    assert.throws(() => files.run(), /already exists; the import only builds a new database/);
  });
});
