const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startTestServer } = require('../helpers/test-server');

const REPO_DATA_DIR = path.resolve(__dirname, '..', '..', 'server', 'data');

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
});

test('writes land in the temp DATA_DIR and never touch server/data', async (t) => {
  const api = await startTestServer(t);
  const repoDbBefore = fs.readFileSync(path.join(REPO_DATA_DIR, 'db.json'), 'utf8');

  const created = await api.request('POST', '/api/sprints', { name: 'Harness Sprint', start: '2026-11-24', end: '2026-12-05' });
  assert.equal(created.status, 201);
  assert.equal(created.body.id, 4);

  assert.ok(api.readData('db.json').sprints.some((s) => s.name === 'Harness Sprint'));
  assert.equal(fs.readFileSync(path.join(REPO_DATA_DIR, 'db.json'), 'utf8'), repoDbBefore);
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

test('beforeStart can reshape the copied data before the app loads', async (t) => {
  const api = await startTestServer(t, {
    beforeStart: (dataDir) => fs.rmSync(path.join(dataDir, 'custom-onboarding.json')),
  });

  // With the JSON gone, the onboarding store reseeds from the fixture custom.csv.
  const resources = (await api.request('GET', '/api/onboarding-resources')).body;
  assert.deepEqual(resources.map((r) => r.eid).sort(), ['kevin.r.lim', 'nina.g.castro']);
});
