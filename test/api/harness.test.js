const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startTestServer } = require('../helpers/test-server');

const REPO_DATA_DIR = path.resolve(__dirname, '..', '..', 'server', 'data');

/** Every file under dir with its size and modification time, to see that nothing touched it. */
function statTree(dir) {
  const out = {};
  (function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        const { size, mtimeMs } = fs.statSync(full);
        out[path.relative(dir, full)] = { size, mtimeMs };
      }
    }
  })(dir);
  return out;
}

test('serves the fixture dataset, not the real data', async (t) => {
  const api = await startTestServer(t);

  const resources = await api.request('GET', '/api/onboarding-resources');
  assert.equal(resources.status, 200);
  assert.equal(resources.body.length, 9);
  assert.ok(resources.body.some((r) => r.eid === 'rafael.t.mendoza'));

  const sprints = await api.request('GET', '/api/sprints');
  assert.deepEqual(sprints.body.map((s) => s.name), ['Sprint 1', 'Sprint 2', 'Sprint 3']);
});

test('points DATA_DIR at a fresh temp copy of the fixtures', async (t) => {
  const api = await startTestServer(t);

  assert.equal(process.env.DATA_DIR, api.dataDir);
  assert.ok(path.resolve(api.dataDir).startsWith(path.resolve(os.tmpdir())));
  assert.notEqual(path.resolve(api.dataDir), REPO_DATA_DIR);
  assert.ok(fs.existsSync(path.join(api.dataDir, 'db.json')));
  assert.ok(fs.existsSync(path.join(api.dataDir, 'dashboard.sqlite')), 'the database is built from the seed in the temp copy');
});

// Phase 8 ported this from the JSON backend, where it compared server/data's
// db.json before and after. On SQLite a write lands in the temp copy's
// database, and no file under server/data (the seed, or a developer's own
// dashboard.sqlite) changes.
test('writes land in the temp DATA_DIR and never touch server/data', async (t) => {
  const api = await startTestServer(t);
  const repoBefore = statTree(REPO_DATA_DIR);
  const seedBefore = fs.readFileSync(path.join(api.dataDir, 'db.json'), 'utf8');

  const created = await api.request('POST', '/api/sprints', { name: 'Harness Sprint', start: '2026-11-24', end: '2026-12-05' });
  assert.equal(created.status, 201);
  assert.equal(created.body.id, 4);

  assert.ok((await api.request('GET', '/api/sprints')).body.some((s) => s.name === 'Harness Sprint'));
  assert.equal(fs.readFileSync(path.join(api.dataDir, 'db.json'), 'utf8'), seedBefore, 'the seed in the temp copy is never written');
  assert.deepEqual(statTree(REPO_DATA_DIR), repoBefore);
});

test('a mutation in one test…', async (t) => {
  const api = await startTestServer(t);
  const res = await api.request('DELETE', '/api/project-reachouts/1');
  assert.equal(res.status, 200);
  assert.equal((await api.request('GET', '/api/project-reachouts')).body.length, 4);
});

test('…is not visible in the next one', async (t) => {
  const api = await startTestServer(t);
  const reachouts = (await api.request('GET', '/api/project-reachouts')).body;
  assert.equal(reachouts.length, 5);
  assert.ok(reachouts.some((r) => r.id === 1));
});

test('close() removes the temp dir and restores DATA_DIR', async () => {
  const before = process.env.DATA_DIR;
  const api = await startTestServer();
  await api.close();

  assert.equal(fs.existsSync(api.dataDir), false);
  assert.equal(process.env.DATA_DIR, before);
});

// Phase 8 ported this from the JSON backend, where it deleted the roster to
// exercise CSV seeding. The database is built after beforeStart, from the seed
// as beforeStart left it.
test('beforeStart can reshape the copied data before the app loads', async (t) => {
  const api = await startTestServer(t, {
    beforeStart: (dataDir) => {
      const file = path.join(dataDir, 'custom-onboarding.json');
      const records = JSON.parse(fs.readFileSync(file, 'utf8')).filter((r) => r.eid === 'kevin.r.lim' || r.eid === 'nina.g.castro');
      fs.writeFileSync(file, `${JSON.stringify(records, null, 2)}\n`, 'utf8');
    },
  });

  const resources = (await api.request('GET', '/api/onboarding-resources')).body;
  assert.deepEqual(resources.map((r) => r.eid).sort(), ['kevin.r.lim', 'nina.g.castro']);
});

// A second app would share the first one's module cache and process-wide
// DATA_DIR (see test-server.js).
test('refuses to start a second app while one is open', async () => {
  const first = await startTestServer();
  try {
    await assert.rejects(startTestServer(), { message: /^startTestServer: the app on http:\/\/127\.0\.0\.1:\d+ is still open; close\(\) it/ });
    assert.equal(process.env.DATA_DIR, first.dataDir, 'the refused start leaves DATA_DIR alone');
  } finally {
    await first.close();
  }
  const second = await startTestServer();
  await second.close();
});
