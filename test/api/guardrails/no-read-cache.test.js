// Guardrail 3 (docs/server-restructure-plan.md, step 0): no in-memory caches.
//
// Every characterization test loads a fresh app and makes one request, so a
// memoised db/roster/tasks/fruits object in a repository would still pass all
// of them. Here each test keeps ONE app running and edits the data file on
// disk between requests (the way a person or another process would), then
// checks every later read and write sees the file as it is on disk right now:
//
//   GET → hand edit → GET sees it → POST (id from the edited file, edit kept)
//       → hand edit → GET sees it → write keeps the second edit too
//
// Hand edits are written in the server's own format for each file, so the
// server's later writes are the only thing that changes the formatting.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startTestServer } = require('../../helpers/test-server');
const Database = require('better-sqlite3');
const { jsonOnly, backendSkip } = require('../../helpers/backend');

/** Rewrite a data file the way an outside editor would. db.json files have no trailing newline. */
function handEdit(api, relativePath, fn, { trailingNewline }) {
  const file = path.join(api.dataDir, relativePath);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const result = fn(data) ?? data;
  fs.writeFileSync(file, JSON.stringify(result, null, 2) + (trailingNewline ? '\n' : ''), 'utf8');
}

const ok = (res, status = 200) => {
  assert.equal(res.status, status, `unexpected ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body;
};

describe('guardrail: every request reads the file as it is on disk', () => {
  test('db.json (sprints, retros, office locations)', { skip: jsonOnly('hand-edits db.json') }, async (t) => {
    const api = await startTestServer(t);
    const names = async () => ok(await api.request('GET', '/api/sprints')).map((s) => `${s.id}:${s.name}`);

    assert.deepEqual(await names(), ['1:Sprint 1', '2:Sprint 2', '3:Sprint 3']);

    handEdit(api, 'db.json', (db) => {
      db.sprints.push({ id: 10, name: 'Hand-added', start: '2026-12-01', end: '2026-12-12' });
      db.sprints[0].name = 'Sprint 1 (renamed by hand)';
      db['office-locations'].push({ id: '99', name: 'Hand-added office' });
    }, { trailingNewline: false });

    assert.deepEqual(await names(), ['1:Sprint 1 (renamed by hand)', '2:Sprint 2', '3:Sprint 3', '10:Hand-added']);
    assert.ok(ok(await api.request('GET', '/api/office-locations')).some((o) => o.name === 'Hand-added office'),
      'a different route over the same file must see the edit too');

    // A retro POST checks the sprint exists: the hand-added sprint 10 must count.
    const retro = ok(await api.request('POST', '/api/sprint-retros', { sprintId: 10, groupNumber: 5, category: 'went-well', text: 'cache check' }), 201);
    assert.equal(retro.sprintId, 10);

    const created = ok(await api.request('POST', '/api/sprints', { name: 'Posted', start: '2027-01-04', end: '2027-01-15' }), 201);
    assert.equal(created.id, 11, 'next id must come from the hand-edited file (max 10 + 1)');
    const onDisk = api.readData('db.json');
    assert.equal(onDisk.sprints[0].name, 'Sprint 1 (renamed by hand)', 'the POST must not write back a stale copy');
    assert.ok(onDisk['office-locations'].some((o) => o.name === 'Hand-added office'), 'the POST must keep other collections as they are on disk');
    assert.ok(onDisk['sprint-retros'].some((r) => r.text === 'cache check'), 'the POST must keep the earlier retro write');

    handEdit(api, 'db.json', (db) => { db.sprints = db.sprints.filter((s) => s.id !== 10); }, { trailingNewline: false });
    assert.deepEqual(await names(), ['1:Sprint 1 (renamed by hand)', '2:Sprint 2', '3:Sprint 3', '11:Posted']);

    ok(await api.request('PATCH', '/api/sprints/2', { name: 'Sprint 2 (patched)' }));
    assert.deepEqual(api.readData('db.json').sprints.map((s) => s.id), [1, 2, 3, 11], 'the PATCH must not bring back the sprint removed by hand');
  });

  test('custom-onboarding.json (resources, skill options, competency)', { skip: jsonOnly('hand-edits custom-onboarding.json') }, async (t) => {
    const api = await startTestServer(t);
    const eids = async () => ok(await api.request('GET', '/api/onboarding-resources')).map((r) => r.eid);
    const handAdded = {
      id: 20, name: 'Hand Added', eid: 'hand.added', groupNumber: 5, clLevel: '11',
      primary_skill: 'Hand Skill', created_at: '2026-11-05T00:00:00.000Z', updated_at: '2026-11-05T00:00:00.000Z',
    };

    assert.equal((await eids()).length, 9);
    assert.ok(!ok(await api.request('GET', '/api/skill-options')).includes('Hand Skill'));

    handEdit(api, 'custom-onboarding.json', (records) => { records.unshift(handAdded); }, { trailingNewline: true });

    assert.ok((await eids()).includes('hand.added'));
    assert.ok(ok(await api.request('GET', '/api/skill-options')).includes('Hand Skill'), 'skill options must re-read the roster');
    assert.ok(ok(await api.request('GET', '/api/competency-records?group=5')).some((r) => r.eid === 'hand.added'),
      'competency must re-read the roster');

    const created = ok(await api.request('POST', '/api/onboarding-resources', {
      name: 'Posted Joiner', eid: 'posted.joiner', hireDate: '11/02/2026', rollInDate: '11/09/2026', groupNumber: '5',
    }), 201);
    assert.equal(created.id, 21, 'next id must come from the hand-edited roster (max 20 + 1)');
    assert.ok(api.readData('custom-onboarding.json').some((r) => r.eid === 'hand.added'), 'the POST must keep the hand-added record');

    handEdit(api, 'custom-onboarding.json', (records) => records.filter((r) => r.eid !== 'hand.added'), { trailingNewline: true });
    const after = await eids();
    assert.ok(!after.includes('hand.added') && after.includes('posted.joiner'));
    assert.ok(!ok(await api.request('GET', '/api/skill-options')).includes('Hand Skill'));

    ok(await api.request('DELETE', '/api/onboarding-resources/21'));
    assert.ok(!api.readData('custom-onboarding.json').some((r) => r.eid === 'hand.added'), 'the DELETE must not bring back the record removed by hand');
  });

  test('tasks.json (legacy tasks)', async (t) => {
    const api = await startTestServer(t);
    const titles = async () => ok(await api.request('GET', '/api/tasks')).map((task) => `${task.id}:${task.title}`);

    assert.deepEqual(await titles(), ['1:Prepare onboarding report'], 'the first GET seeds tasks.json');

    handEdit(api, 'tasks.json', (tasks) => {
      tasks.unshift({ id: 7, title: 'Hand-added task', status: 'open', created_at: '2026-11-05T00:00:00.000Z', updated_at: '2026-11-05T00:00:00.000Z' });
    }, { trailingNewline: true });
    assert.deepEqual(await titles(), ['7:Hand-added task', '1:Prepare onboarding report']);

    const created = ok(await api.request('POST', '/api/tasks', { title: 'Posted task' }), 201);
    assert.equal(created.id, 8, 'next id must come from the hand-edited file (max 7 + 1)');

    handEdit(api, 'tasks.json', (tasks) => tasks.filter((task) => task.id !== 1), { trailingNewline: true });
    assert.deepEqual(await titles(), ['8:Posted task', '7:Hand-added task']);

    ok(await api.request('PATCH', '/api/tasks/7', { status: 'done' }));
    assert.deepEqual(api.readData('tasks.json').map((task) => task.id), [8, 7], 'the PATCH must not bring back the task removed by hand');
  });

  test('test_bwd/db.json (fruits API and the /test static mount)', async (t) => {
    const api = await startTestServer(t);
    const names = async () => ok(await api.request('GET', '/api/fruits')).map((f) => `${f.id}:${f.name}`);
    const before = await names();
    assert.equal(before.length, 3);

    handEdit(api, 'test_bwd/db.json', (db) => {
      db.fruits.push({ id: 40, name: 'Hand Fruit', emoji: '🍐', category: 'pome', price: 1, stock: 1 });
    }, { trailingNewline: false });
    assert.deepEqual(await names(), [...before, '40:Hand Fruit']);
    assert.equal(ok(await api.request('GET', '/api/fruits/40')).name, 'Hand Fruit');
    const servedFile = await fetch(api.baseUrl + '/test/db.json');
    assert.ok((await servedFile.text()).includes('Hand Fruit'), 'the /test static mount must serve the file as it is on disk');

    const created = ok(await api.request('POST', '/api/fruits', { name: 'Posted Fruit', category: 'berry' }), 201);
    assert.equal(created.id, 41, 'next id must come from the hand-edited file (max 40 + 1)');

    handEdit(api, 'test_bwd/db.json', (db) => { db.fruits = db.fruits.filter((f) => f.id !== 40); }, { trailingNewline: false });
    assert.deepEqual(await names(), [...before, '41:Posted Fruit']);

    ok(await api.request('DELETE', '/api/fruits/41'));
    assert.deepEqual(await names(), before, 'the DELETE must not bring back the fruit removed by hand');
  });
});

// docs/sqlite-migration-plan.md, Phase 4 step 5: the same checks on the SQLite
// backend. The edits between requests go through a second connection to
// dashboard.sqlite, the way another process (or a person with a SQL tool) would
// make them, while the app keeps its own connection open.
function sqlEdit(api, fn) {
  const database = new Database(path.join(api.dataDir, 'dashboard.sqlite'));
  try {
    database.pragma('busy_timeout = 5000');
    fn(database);
  } finally {
    database.close();
  }
}

const sqlRows = (api, sql, ...params) => {
  let rows;
  sqlEdit(api, (database) => { rows = database.prepare(sql).all(...params); });
  return rows;
};

describe('guardrail: every request reads the database as it is now', { skip: backendSkip('sqlite', 'edits dashboard.sqlite with SQL') }, () => {
  test('sprints, retros and office locations', async (t) => {
    const api = await startTestServer(t);
    const names = async () => ok(await api.request('GET', '/api/sprints')).map((s) => `${s.id}:${s.name}`);

    assert.deepEqual(await names(), ['1:Sprint 1', '2:Sprint 2', '3:Sprint 3']);

    sqlEdit(api, (db) => {
      db.prepare("INSERT INTO sprints (id, name, start_date, end_date) VALUES (10, 'Hand-added', '2026-12-01', '2026-12-12')").run();
      db.prepare("UPDATE sprints SET name = 'Sprint 1 (renamed by hand)' WHERE id = 1").run();
      db.prepare("INSERT INTO office_locations (id, name) VALUES (99, 'Hand-added office')").run();
    });

    assert.deepEqual(await names(), ['1:Sprint 1 (renamed by hand)', '2:Sprint 2', '3:Sprint 3', '10:Hand-added']);
    assert.ok(ok(await api.request('GET', '/api/office-locations')).some((o) => o.name === 'Hand-added office'),
      'a different route over the same database must see the edit too');

    // A retro POST checks the sprint exists: the hand-added sprint 10 must count.
    const retro = ok(await api.request('POST', '/api/sprint-retros', { sprintId: 10, groupNumber: 5, category: 'went-well', text: 'cache check' }), 201);
    assert.equal(retro.sprintId, 10);

    const created = ok(await api.request('POST', '/api/sprints', { name: 'Posted', start: '2027-01-04', end: '2027-01-15' }), 201);
    assert.equal(created.id, 11, 'next id must come from the edited table (max 10 + 1)');
    assert.deepEqual(sqlRows(api, 'SELECT name FROM sprints WHERE id = 1'), [{ name: 'Sprint 1 (renamed by hand)' }], 'the POST must not write back a stale copy');
    assert.equal(sqlRows(api, "SELECT count(*) AS n FROM office_locations WHERE name = 'Hand-added office'")[0].n, 1);
    assert.equal(sqlRows(api, "SELECT count(*) AS n FROM sprint_retros WHERE text = 'cache check'")[0].n, 1, 'the POST must keep the earlier retro write');

    sqlEdit(api, (db) => db.prepare('DELETE FROM sprints WHERE id = 10').run());
    assert.deepEqual(await names(), ['1:Sprint 1 (renamed by hand)', '2:Sprint 2', '3:Sprint 3', '11:Posted']);

    ok(await api.request('PATCH', '/api/sprints/2', { name: 'Sprint 2 (patched)' }));
    assert.deepEqual(sqlRows(api, 'SELECT id FROM sprints ORDER BY id').map((r) => r.id), [1, 2, 3, 11], 'the PATCH must not bring back the sprint removed by hand');
  });

  test('roster (resources, skill options, competency)', async (t) => {
    const api = await startTestServer(t);
    const eids = async () => ok(await api.request('GET', '/api/onboarding-resources')).map((r) => r.eid);

    assert.equal((await eids()).length, 9);
    assert.ok(!ok(await api.request('GET', '/api/skill-options')).includes('Hand Skill'));

    sqlEdit(api, (db) => db.prepare(`
      INSERT INTO onboarding_resources (id, eid, name, hire_date, roll_in_date, project_deployed, deployment_date, project_name,
        poc, dn, roll_off_date, from_project, cl_level, group_number, primary_skill, primary_years, secondary_skill,
        secondary_years, another_skills, office_location, created_at, updated_at)
      VALUES (20, 'hand.added', 'Hand Added', '', '', 'No', '', '', '', 'No', '', '', '11', 5, 'Hand Skill', '', '', '', '[]', '',
        '2026-11-05T00:00:00.000Z', '2026-11-05T00:00:00.000Z')`).run());

    assert.ok((await eids()).includes('hand.added'));
    assert.ok(ok(await api.request('GET', '/api/skill-options')).includes('Hand Skill'), 'skill options must re-read the roster');
    assert.ok(ok(await api.request('GET', '/api/competency-records?group=5')).some((r) => r.eid === 'hand.added'),
      'competency must re-read the roster');

    const created = ok(await api.request('POST', '/api/onboarding-resources', {
      name: 'Posted Joiner', eid: 'posted.joiner', hireDate: '11/02/2026', rollInDate: '11/09/2026', groupNumber: '5',
    }), 201);
    assert.equal(created.id, 21, 'next id must come from the edited table (max 20 + 1)');
    assert.equal(sqlRows(api, "SELECT count(*) AS n FROM onboarding_resources WHERE eid = 'hand.added'")[0].n, 1, 'the POST must keep the hand-added record');

    sqlEdit(api, (db) => db.prepare("DELETE FROM onboarding_resources WHERE eid = 'hand.added'").run());
    const after = await eids();
    assert.ok(!after.includes('hand.added') && after.includes('posted.joiner'));
    assert.ok(!ok(await api.request('GET', '/api/skill-options')).includes('Hand Skill'));

    ok(await api.request('DELETE', '/api/onboarding-resources/21'));
    assert.equal(sqlRows(api, "SELECT count(*) AS n FROM onboarding_resources WHERE eid = 'hand.added'")[0].n, 0, 'the DELETE must not bring back the record removed by hand');
  });
});
