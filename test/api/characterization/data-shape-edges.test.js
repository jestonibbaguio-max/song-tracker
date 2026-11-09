// Characterization cases for data shapes the other files don't reach:
//   - a db.json collection that is an object instead of an array. Several
//     routes then crash with a TypeError whose message V8 builds from the
//     source expression, e.g. "(db.sprints || []).map is not a function",
//     so these pin both the status and the exact message in the error page.
//   - the same for the fruits test bench's file
//   - fruits whose ids are not numbers: the fruits next-id rule
//     (Math.max over Number(id)) differs from nextId() in server/utils/ids.js
// The snapshot was recorded against the pre-refactor server (c54e754).
const { describe, test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { runCase, snapshot, caseSkip, CREDENTIALS, editDb } = require('../../helpers/characterize');
const { DB_ROUTES } = require('../../helpers/sample-requests');

function caseTest(name, method, routePath, kase) {
  test(name, { skip: caseSkip(kase) }, async (t) => {
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

describe('data shapes › db.json collection is an object, not an array', () => {
  for (const r of DB_ROUTES) {
    const name = `${r.method} ${r.path}: "${r.collection}" is {"a":1}${r.note ? ` (${r.note})` : ''}`;
    caseTest(name, r.method, r.path, {
      setup: editDb((db) => { db[r.collection] = { a: 1 }; }),
      jsonOnly: 'a db.json collection that is not an array',
      ...(r.body !== undefined ? { body: r.body } : {}),
    });
  }
});

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
