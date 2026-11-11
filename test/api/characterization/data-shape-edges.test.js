// Characterization cases for data shapes the other files don't reach, in the
// fruits test bench's file (it stays on JSON):
//   - fruits is an object instead of an array. Several routes then crash with
//     a TypeError whose message V8 builds from the source expression, so these
//     pin both the status and the exact message in the error page.
//   - fruits whose ids are not numbers: the fruits next-id rule (Math.max over
//     Number(id)).
// The snapshot was recorded against the pre-refactor server (c54e754). Its
// db.json cases (a collection that isn't an array) pinned the JSON backend and
// were deleted with it (docs/sqlite-migration-plan.md, Phase 8).
const { describe, test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { runCase, snapshot, CREDENTIALS } = require('../../helpers/characterize');

function caseTest(name, method, routePath, kase) {
  test(name, async (t) => {
    snapshot(t, await runCase(method, routePath, kase, CREDENTIALS.poc));
  });
}

/** Edit test_bwd/db.json the way the server writes it. */
const editFruitsDb = (fn) => (dataDir) => {
  const file = path.join(dataDir, 'test_bwd', 'db.json');
  const db = JSON.parse(fs.readFileSync(file, 'utf8'));
  fn(db);
  fs.writeFileSync(file, JSON.stringify(db, null, 2), 'utf8');
};

describe('data shapes › fruits file', () => {
  const notArray = editFruitsDb((db) => { db.fruits = { a: 1 }; });
  caseTest('GET /api/fruits: fruits is {"a":1}', 'GET', '/api/fruits', { setup: notArray });
  caseTest('GET /api/fruits?category=x: fruits is {"a":1}', 'GET', '/api/fruits?category=Tropical', { setup: notArray });
  caseTest('GET /api/fruits/1: fruits is {"a":1}', 'GET', '/api/fruits/1', { setup: notArray });
  caseTest('POST /api/fruits: fruits is {"a":1}', 'POST', '/api/fruits', { setup: notArray, body: { name: 'Lanzones', category: 'Tropical' } });

  const stringIds = editFruitsDb((db) => { db.fruits[0].id = 'calamansi'; db.fruits[1].id = '7'; });
  caseTest('POST /api/fruits: a non-numeric id makes the next id NaN (written as null)', 'POST', '/api/fruits',
    { setup: stringIds, body: { name: 'Lanzones', category: 'Tropical' } });
  caseTest('POST /api/fruits: numeric-string ids count towards the next id', 'POST', '/api/fruits',
    { setup: editFruitsDb((db) => { db.fruits[1].id = '7'; }), body: { name: 'Lanzones', category: 'Tropical' } });
});
