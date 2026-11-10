// Bug L18 (docs/found-bugs.md): client values the SQLite backend can't store
// the way db.json does. Decided in Phase 4 of docs/sqlite-migration-plan.md
// (2026-11-10): the backends differ here on purpose, and each case is pinned
// on both, the json half on the JSON backend and the sqlite half on SQLite.
//
//   - a null sent for an optional field is stored as null on JSON, and as
//     "no value" on SQLite, so later reads leave the field out;
//   - a boolean, object or array sent for a field SQLite stores as a plain
//     value is stored as sent on JSON, and refused with a 500 on SQLite;
//   - a planner task's `completed` is stored as sent on JSON, and as a
//     boolean (its truthiness) on SQLite;
//   - an integer past SQLite's 64-bit range (a sprint retro's groupNumber of
//     1e19 or more) is stored on JSON, and refused with a 500 on SQLite.
//
// No page of the app sends any of these.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('../helpers/test-server');
const { backendSkip } = require('../helpers/backend');

process.env.NODE_ENV = 'test'; // error messages in Express error pages, as in the other tests

const L18_MESSAGE = /can&#39;t be (a boolean|an object|an array) on the SQLite backend \(bug L18/;

const ok = (res, status = 200) => {
  assert.equal(res.status, status, `unexpected ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body;
};

const CASES = [
  {
    name: 'null for an optional field (attendance location)',
    async run(api) {
      ok(await api.request('PATCH', '/api/attendance/1', { status: 'Absent', location: null }));
      return ok(await api.request('GET', '/api/attendance')).find((r) => r.id === 1);
    },
    json: (row) => assert.deepEqual(row, { id: 1, eid: 'rafael.t.mendoza', year: 2026, month: 10, day: 27, status: 'Absent', location: null }),
    sqlite: (row) => assert.deepEqual(row, { id: 1, eid: 'rafael.t.mendoza', year: 2026, month: 10, day: 27, status: 'Absent' }),
  },
  {
    name: 'boolean for a plain field (attendance status)',
    run: async (api) => api.request('POST', '/api/attendance', { eid: 'liza.m.navarro', year: 2026, month: 11, day: 5, status: true }),
    json: (res) => assert.equal(ok(res, 201).status, true),
    sqlite: (res) => { assert.equal(res.status, 500); assert.match(res.body, L18_MESSAGE); },
  },
  {
    name: 'array for a plain field (competency primarySkill)',
    run: async (api) => api.request('PATCH', '/api/competency-records/liza.m.navarro', { primarySkill: ['React', 'AEM'] }),
    json: (res) => assert.deepEqual(ok(res).primarySkill, ['React', 'AEM']),
    sqlite: (res) => { assert.equal(res.status, 500); assert.match(res.body, L18_MESSAGE); },
  },
  {
    name: 'object for a key field (capacity sprintName)',
    run: async (api) => api.request('POST', '/api/capacity-entries', { sprintName: { id: 3 }, eid: 'rafael.t.mendoza', cadence: 4 }),
    json: (res) => assert.deepEqual(ok(res, 201).sprintName, { id: 3 }),
    sqlite: (res) => { assert.equal(res.status, 500); assert.match(res.body, L18_MESSAGE); },
  },
  {
    name: 'non-boolean completed on a planner task',
    async run(api) {
      ok(await api.request('PATCH', '/api/planner-tasks/2', { completed: 1 }));
      return ok(await api.request('GET', '/api/planner-tasks')).find((t) => t.id === 2).completed;
    },
    json: (completed) => assert.equal(completed, 1),
    sqlite: (completed) => assert.equal(completed, true),
  },
  {
    name: 'integer past 64 bits for an INTEGER column (retro groupNumber 1e19)',
    run: async (api) => api.request('POST', '/api/sprint-retros', { sprintId: 1, groupNumber: 1e19, category: 'went-well', text: 'x' }),
    json: (res) => assert.equal(ok(res, 201).groupNumber, 1e19),
    sqlite: (res) => { assert.equal(res.status, 500); assert.match(res.body, /cannot store REAL value in INTEGER column sprint_retros.group_number/); },
  },
];

for (const backend of ['json', 'sqlite']) {
  describe(`bug L18 on the ${backend} backend`, { skip: backendSkip(backend, 'pins this backend\'s half of bug L18') }, () => {
    for (const kase of CASES) {
      test(kase.name, async (t) => {
        const api = await startTestServer(t);
        kase[backend](await kase.run(api));
      });
    }
  });
}
