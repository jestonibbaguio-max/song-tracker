// Round trips through the SQLite export (docs/sqlite-migration-plan.md, Phase 5
// step 2): the data the export writes has to come back unchanged into SQLite.
// dumpStore() reads every collection through the running app's stores as
// canonical rows (test/helpers/store-dump.js), so equal dumps mean equal data.
// (The JSON half, and `npm run test:api:exported`, went with the JSON backend
// in Phase 8.)
//
// Only one app can be open at a time (test/helpers/test-server.js), so each
// test closes its first app before starting the second.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startTestServer, SERVER_DIR, FIXTURES_DIR } = require('../helpers/test-server');
const { dumpStore } = require('../helpers/store-dump');
const { createExportedFixtures } = require('../helpers/exported-fixtures');
const { newJoiner } = require('../helpers/sample-requests');

/** A task as the planner sends it, on a board and bucket of the fixtures. */
const plannerTask = {
  boardId: 1, bucketId: 4, title: 'Build a React form with validation', status: 'Not started', priority: 'Medium',
  startDate: '2026-10-28', dueDate: '2026-11-06', labels: [2, 4], assignee: 'miguel.a.torres',
  checklist: [{ id: 1, text: 'Pick a form library', done: false }], description: '<p>Practice controlled inputs</p>',
  acceptanceCriteria: '', comments: [], completed: false,
};

const { exportJson } = require(path.join(SERVER_DIR, 'persistence', 'sqlite', 'export.js'));

const STORE_FILES = ['db.json', 'custom-onboarding.json'];

function tempDir(t, label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `song-tracker-${label}-`));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }));
  return dir;
}

/** A beforeStart that puts dir's db.json and roster in place of the fixtures'. */
const useStoreFiles = (dir) => (dataDir) => {
  for (const file of STORE_FILES) fs.copyFileSync(path.join(dir, file), path.join(dataDir, file));
};

/** Exports the running app's database to a new temp dir and returns the dir. */
function exportRunningApp(t, api) {
  const outDir = tempDir(t, 'roundtrip-out');
  exportJson({ dbPath: path.join(api.dataDir, 'dashboard.sqlite'), outDir });
  return outDir;
}

/** Checks that each write succeeded. */
async function send(api, method, urlPath, body) {
  const res = await api.request(method, urlPath, body);
  assert.ok(res.status >= 200 && res.status < 300, `${method} ${urlPath} → ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

describe('round trip through the export', () => {
  test('sqlite: import → export → import gives the same data', async (t) => {
    const first = await startTestServer(t);
    const before = dumpStore();
    const outDir = exportRunningApp(t, first);
    await first.close();

    await startTestServer(t, { beforeStart: useStoreFiles(outDir) });
    assert.deepEqual(dumpStore(), before);
  });

  test('sqlite: rows written through the API come back the same, in the same order', async (t) => {
    const first = await startTestServer(t);
    await send(first, 'POST', '/api/planner-tasks', { ...plannerTask, completedDate: '', notes: '' });
    await send(first, 'POST', '/api/planner-tasks', { ...plannerTask, title: 'No completedDate or notes' });
    await send(first, 'POST', '/api/capacity-entries', { sprintName: '1', eid: 'rafael.t.mendoza', cadence: 2, admin: 0.5, holiday: 0 });
    await send(first, 'POST', '/api/capacity-entries', { sprintName: 1, eid: 'rafael.t.mendoza', cadence: 3, admin: 0, holiday: 1 });
    await send(first, 'POST', '/api/attendance', { eid: 'liza.m.navarro', year: 2026, month: 11, day: 6, status: 'RTO', location: 'Cebu' });
    await send(first, 'PATCH', '/api/competency-records/aaron.first', { primarySkill: 'AEM', primaryProficiency: 'Beginner' });
    await send(first, 'POST', '/api/onboarding-resources', newJoiner);
    await send(first, 'DELETE', '/api/sprints/1');
    const before = dumpStore();
    assert.equal(before['competency-records'].at(-1).eid, 'aaron.first', 'the new competency row is last, whatever its eid');
    assert.equal(before['onboarding-resources'][0].eid, newJoiner.eid, 'the new resource is first');
    const outDir = exportRunningApp(t, first);
    await first.close();

    await startTestServer(t, { beforeStart: useStoreFiles(outDir) });
    assert.deepEqual(dumpStore(), before);
  });

  test('exporting again what was exported gives the same bytes', (t) => {
    const once = createExportedFixtures();
    t.after(() => fs.rmSync(once, { recursive: true, force: true, maxRetries: 3 }));
    const twice = createExportedFixtures({ from: once });
    t.after(() => fs.rmSync(twice, { recursive: true, force: true, maxRetries: 3 }));

    for (const file of STORE_FILES) {
      assert.equal(fs.readFileSync(path.join(twice, file), 'utf8'), fs.readFileSync(path.join(once, file), 'utf8'), file);
    }
    assert.deepEqual(fs.readdirSync(once).sort(), fs.readdirSync(FIXTURES_DIR).sort(), 'the same files as the fixtures, no database or backups');
  });
});
