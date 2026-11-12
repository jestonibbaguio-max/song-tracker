// Bug L18 (docs/found-bugs.md): client values the SQLite backend can't store
// the way db.json did. Decided in Phase 4 of docs/sqlite-migration-plan.md
// (2026-11-10): the backends differed here on purpose. Each case was pinned on
// both until Phase 8 removed the JSON backend; the SQLite half stays:
//
//   - a null sent for an optional field is stored as "no value" (db.json kept
//     null), so later reads leave the field out;
//   - a boolean, object or array sent for a field SQLite stores as a plain
//     value is refused with a 500 (db.json stored it as sent);
//   - a planner task's `completed` is stored as a boolean, its truthiness
//     (db.json stored it as sent);
//   - an integer past SQLite's 64-bit range (a sprint retro's groupNumber of
//     1e19 or more) is refused with a 500 (db.json stored it).
//
// No page of the app sends any of these.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('../helpers/test-server');

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
    sqlite: (row) => assert.deepEqual(row, { id: 1, eid: 'rafael.t.mendoza', year: 2026, month: 10, day: 27, status: 'Absent' }),
  },
  {
    name: 'boolean for a plain field (attendance status)',
    run: async (api) => api.request('POST', '/api/attendance', { eid: 'liza.m.navarro', year: 2026, month: 11, day: 5, status: true }),
    sqlite: (res) => { assert.equal(res.status, 500); assert.match(res.body, L18_MESSAGE); },
  },
  {
    name: 'array for a plain field (competency primarySkill)',
    run: async (api) => api.request('PATCH', '/api/competency-records/liza.m.navarro', { primarySkill: ['React', 'AEM'] }),
    sqlite: (res) => { assert.equal(res.status, 500); assert.match(res.body, L18_MESSAGE); },
  },
  {
    name: 'object for a key field (capacity sprintName)',
    run: async (api) => api.request('POST', '/api/capacity-entries', { sprintName: { id: 3 }, eid: 'rafael.t.mendoza', cadence: 4 }),
    sqlite: (res) => { assert.equal(res.status, 500); assert.match(res.body, L18_MESSAGE); },
  },
  {
    name: 'non-boolean completed on a planner task',
    async run(api) {
      ok(await api.request('PATCH', '/api/planner-tasks/2', { completed: 1 }));
      return ok(await api.request('GET', '/api/planner-tasks')).find((t) => t.id === 2).completed;
    },
    sqlite: (completed) => assert.equal(completed, true),
  },
  {
    name: 'integer past 64 bits for an INTEGER column (retro groupNumber 1e19)',
    run: async (api) => api.request('POST', '/api/sprint-retros', { sprintId: 1, groupNumber: 1e19, category: 'went-well', text: 'x' }),
    sqlite: (res) => { assert.equal(res.status, 500); assert.match(res.body, /cannot store REAL value in INTEGER column sprint_retros.group_number/); },
  },
];

describe('bug L18 on the sqlite backend', () => {
  for (const kase of CASES) {
    test(kase.name, async (t) => {
      const api = await startTestServer(t);
      kase.sqlite(await kase.run(api));
    });
  }
});
