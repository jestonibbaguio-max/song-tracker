// Self-tests for dumpStore() and the canonical rows the characterization
// snapshots record (test/helpers/store-dump.js; docs/sqlite-migration-plan.md, Phase 2).
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startTestServer, FIXTURES_DIR } = require('../helpers/test-server');
const { dumpStore, canonicalRow, COLLECTIONS } = require('../helpers/store-dump');

const fixtureDb = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, 'db.json'), 'utf8'));
const fixtureRoster = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, 'custom-onboarding.json'), 'utf8'));

describe('canonical rows', () => {
  test('numeric-string ids become numbers; other ids stay as they are', () => {
    assert.deepEqual(canonicalRow('attendance-options', { id: '3', label: 'RTO' }), { id: 3, label: 'RTO' });
    assert.deepEqual(canonicalRow('attendance', { id: 'RxJX-3dWOPE', eid: 'a' }), { id: 'RxJX-3dWOPE', eid: 'a' });
    assert.deepEqual(canonicalRow('sprints', { id: '', name: 'x' }), { id: '', name: 'x' });
  });

  test('planner task labels become numbers', () => {
    assert.deepEqual(canonicalRow('planner-tasks', { id: 1, labels: [1, '5', 'x'] }).labels, [1, 5, 'x']);
  });

  test('keys come in the schema order, then other keys in stored order; absent fields stay absent', () => {
    const row = canonicalRow('deletion-logs', { type: 'task', extra: 1, taskId: 4, id: 2, deletedAt: 'now' });
    assert.deepEqual(Object.keys(row), ['id', 'type', 'taskId', 'deletedAt', 'extra']);
  });

  test('a stored null or "" is kept', () => {
    const row = canonicalRow('project-reachouts', { id: 1, groupNumber: null, details: '' });
    assert.deepEqual(row, { id: 1, details: '', groupNumber: null });
  });

  test('roster records get one key per field: camelCase first, snake_case as the fallback, as the API reads them', () => {
    const row = canonicalRow('onboarding-resources', {
      id: '12', eid: 'iverson.c.cabangis', name: 'Iverson',
      groupNumber: 5, group_number: 6, hireDate: '08/05/2026', hire_date: '', roll_in_date: '08/12/2026', rollInDate: '',
      another_skills: '["HTML"]', created_at: 'c', updated_at: 'u',
    });
    assert.equal(row.id, 12);
    assert.equal(row.groupNumber, 5, 'camelCase wins when both are set');
    assert.equal(row.hireDate, '08/05/2026');
    assert.equal(row.rollInDate, '08/12/2026', 'an empty camelCase value falls back to snake_case');
    assert.deepEqual(row.anotherSkills, ['HTML']);
    assert.equal(row.projectDeployed, 'No');
    assert.equal(row.createdAt, 'c');
    assert.ok(!Object.keys(row).some((k) => k.includes('_')), 'no snake_case keys');
  });
});

describe('dumpStore', () => {
  test('dumps every collection of the fixtures, through the stores, in a fixed order', async (t) => {
    await startTestServer(t);
    const dump = dumpStore();
    assert.deepEqual(Object.keys(dump), COLLECTIONS.map((c) => c.name));
    for (const { name } of COLLECTIONS) {
      const stored = name === 'onboarding-resources' ? fixtureRoster : fixtureDb[name];
      assert.equal(dump[name].length, stored.length, `${name}: one row per stored record`);
    }
  });

  test('roster rows are what GET /api/onboarding-resources returns', async (t) => {
    const api = await startTestServer(t);
    const res = await api.request('GET', '/api/onboarding-resources');
    assert.deepEqual(dumpStore()['onboarding-resources'], res.body);
  });

  test('rows of collections the API lists unfiltered are what their GET returns, ids aside', async (t) => {
    const api = await startTestServer(t);
    const dump = dumpStore();
    const sameButIds = (rows) => rows.map((r) => ({ ...r, id: Number(r.id) }));
    for (const [collection, route] of [
      ['sprints', '/api/sprints'], ['sprint-retros', '/api/sprint-retros'], ['capacity-entries', '/api/capacity-entries'],
      ['project-reachouts', '/api/project-reachouts'], ['planner-boards', '/api/planner-boards'],
    ]) {
      const res = await api.request('GET', route);
      assert.deepEqual(sameButIds(dump[collection]), sameButIds(res.body), collection);
    }
  });

  test('sees a write made through the API, and changes no data file itself', async (t) => {
    const api = await startTestServer(t);
    await api.request('POST', '/api/sprints', { name: 'Sprint 4', start: '2026-11-24', end: '2026-12-05' });
    const files = () => fs.readdirSync(api.dataDir).map((f) => [f, fs.statSync(path.join(api.dataDir, f)).mtimeMs]);
    const before = files();
    const sprints = dumpStore().sprints;
    assert.deepEqual(sprints[sprints.length - 1], { id: 4, name: 'Sprint 4', start: '2026-11-24', end: '2026-12-05' });
    assert.deepEqual(files(), before);
  });
});

