// Guardrail: the exact file-system calls each request makes inside DATA_DIR.
//
// The characterization snapshots pin what a request returns and what ends up
// in the data files, but not how the server got there. Reading a file twice,
// reading files in a different order, validating before loading, or keeping a
// cached copy instead of re-reading all leave those snapshots unchanged. This
// test wraps every function on the `fs` module, keeps ONE app running per
// scenario, and snapshots the ordered list of fs calls (function and path
// relative to DATA_DIR) that each request made. A cache anywhere shows up as a
// missing read on a later request.
//
// Paths outside DATA_DIR (dist/, node_modules) are not recorded. Calls on file
// descriptors (fs.read, fs.close) have no path and are not recorded either.
//
// The snapshot was recorded against the pre-refactor server (c54e754).
const { describe, test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { startTestServer } = require('../../helpers/test-server');
const { DB_ROUTES, newJoiner, teresaEdited } = require('../../helpers/sample-requests');

// Same as the characterization helpers: no request logging, messages in error pages.
process.env.NODE_ENV = 'test';

// ── Recording ────────────────────────────────────────────────────────────────

let recording = null; // { root, calls } while a request is in flight

const isWin = process.platform === 'win32';
const norm = (p) => (isWin ? p.toLowerCase() : p);

function pathArg(arg) {
  if (typeof arg === 'string') return arg;
  if (Buffer.isBuffer(arg)) return arg.toString('utf8');
  if (arg instanceof URL && arg.protocol === 'file:') return require('node:url').fileURLToPath(arg);
  return null;
}

for (const name of Object.keys(fs)) {
  const original = fs[name];
  if (typeof original !== 'function' || !/^[a-z]/.test(name)) continue;
  fs[name] = function traced(...args) {
    if (recording) {
      const p = pathArg(args[0]);
      if (p !== null) {
        const abs = path.resolve(p);
        const root = recording.root;
        if (norm(abs) === norm(root) || norm(abs).startsWith(norm(root + path.sep))) {
          const rel = path.relative(root, abs).split(path.sep).join('/') || '.';
          recording.calls.push(`${name} ${rel}`);
        }
      }
    }
    return original.apply(this, args);
  };
}

/** Send one request and return its status plus every fs call it made in DATA_DIR. */
async function traced(api, { method, path: urlPath, body, rawBody }) {
  const headers = {};
  let payload;
  if (rawBody !== undefined) payload = rawBody;
  else if (body !== undefined) payload = JSON.stringify(body);
  if (payload !== undefined) headers['content-type'] = 'application/json';

  recording = { root: path.resolve(api.dataDir), calls: [] };
  try {
    const res = await fetch(api.baseUrl + urlPath, { method, headers, body: payload });
    await res.arrayBuffer();
    return { status: res.status, calls: recording.calls };
  } finally {
    recording = null;
  }
}

function render(entries) {
  const lines = [];
  for (const { request, status, calls } of entries) {
    lines.push(`${request} → ${status}`);
    if (!calls.length) lines.push('  (no fs calls in DATA_DIR)');
    for (const c of calls) lines.push(`  ${c}`);
  }
  return '\n' + lines.join('\n') + '\n';
}

/** Run requests in order on one app and snapshot the fs calls of each. */
async function scenario(t, requests, options = {}) {
  const api = await startTestServer(t, options);
  const entries = [];
  for (const r of requests) {
    const { status, calls } = await traced(api, r);
    entries.push({ request: `${r.method} ${r.path}${r.label ? ` (${r.label})` : ''}`, status, calls });
  }
  t.assert.snapshot(entries, { serializers: [render] });
}

const get = (p, label) => ({ method: 'GET', path: p, label });

// ── Scenarios ────────────────────────────────────────────────────────────────

describe('guardrail: fs calls per request', () => {
  test('db.json routes, in order on one app (each re-reads; at most one write)', async (t) => {
    const requests = [];
    // Entries with a note are variants for the data-shape cases; skip them here.
    for (const r of DB_ROUTES.filter((x) => !x.note)) {
      requests.push(r);
      // Read the same collection again straight after, so a cache would show.
      if (r.method !== 'GET') requests.push(get(DB_ROUTES.find((x) => x.method === 'GET' && x.collection === r.collection).path, 'read back'));
    }
    await scenario(t, requests);
  });

  test('db.json routes that answer 400 or 404', async (t) => {
    await scenario(t, [
      { method: 'PATCH', path: '/api/sprints/999', label: 'unknown id, no body' },
      { method: 'POST', path: '/api/sprints', body: { name: 'No dates' } },
      { method: 'POST', path: '/api/sprint-retros', body: { sprintId: 999, groupNumber: 5, category: 'went-well', text: 'x' } },
      { method: 'PATCH', path: '/api/sprint-retros/999', body: { text: 'x' } },
      { method: 'POST', path: '/api/capacity-entries', body: {} },
      { method: 'PATCH', path: '/api/attendance/999', body: { status: 'Absent' } },
      { method: 'POST', path: '/api/planner-buckets', body: {} },
      { method: 'PATCH', path: '/api/planner-tasks/999', body: { status: 'Completed' } },
      { method: 'DELETE', path: '/api/project-reachouts/999' },
      { method: 'POST', path: '/api/sprints', rawBody: '{"broken": ', label: 'malformed JSON' },
    ]);
  });

  test('roster, skill options and competency (roster read before or after db.json)', async (t) => {
    await scenario(t, [
      get('/api/onboarding-resources'),
      get('/api/onboarding-resources', 'again'),
      get('/api/skill-options'),
      { method: 'POST', path: '/api/onboarding-resources', body: newJoiner },
      { method: 'POST', path: '/api/onboarding-resources', body: { ...newJoiner, hireDate: 'soon' }, label: 'invalid date' },
      { method: 'PATCH', path: '/api/onboarding-resources/5', body: teresaEdited },
      { method: 'PATCH', path: '/api/onboarding-resources/5', body: { ...teresaEdited, eid: 'teresa.v' }, label: 'eid changed: appends' },
      { method: 'PATCH', path: '/api/onboarding-resources/5', body: { name: 'Teresa V.' }, label: 'partial body: 400' },
      { method: 'PATCH', path: '/api/onboarding-resources/999', body: { name: 'Nobody' } },
      { method: 'DELETE', path: '/api/onboarding-resources/5' },
      get('/api/competency-records?group=5'),
      get('/api/competency-records'),
      { method: 'PATCH', path: '/api/competency-records/liza.m.navarro', body: { primaryProficiency: 'P3' } },
    ]);
  });

  test('roster seeded from custom.csv on the first read', async (t) => {
    await scenario(t, [get('/api/onboarding-resources'), get('/api/onboarding-resources', 'again')], {
      beforeStart: (dataDir) => fs.rmSync(path.join(dataDir, 'custom-onboarding.json')),
    });
  });

  test('roster record without an id is repaired on read', async (t) => {
    await scenario(t, [get('/api/onboarding-resources'), get('/api/onboarding-resources', 'again')], {
      beforeStart: (dataDir) => {
        const file = path.join(dataDir, 'custom-onboarding.json');
        const records = JSON.parse(fs.readFileSync(file, 'utf8'));
        delete records[0].id;
        fs.writeFileSync(file, JSON.stringify(records, null, 2) + '\n', 'utf8');
      },
    });
  });

  test('legacy tasks (tasks.json seeded on first read)', async (t) => {
    await scenario(t, [
      get('/api/tasks'),
      get('/api/tasks', 'again'),
      { method: 'POST', path: '/api/tasks', body: { title: 'Book mock interview slots' } },
      { method: 'POST', path: '/api/tasks', body: {}, label: 'no title' },
      { method: 'PATCH', path: '/api/tasks/1', body: { status: 'done' } },
      { method: 'PATCH', path: '/api/tasks/999', body: { status: 'done' } },
      { method: 'DELETE', path: '/api/tasks/1' },
    ]);
  });

  test('fruits test bench, including its crash paths (bugs M1, M14)', async (t) => {
    await scenario(t, [
      get('/api/fruits'),
      get('/api/fruits?category=Tropical&q=man'),
      get('/api/fruits?q=a&q=b', 'repeated q: 500'),
      get('/api/fruits/2'),
      get('/api/fruits/999'),
      { method: 'POST', path: '/api/fruits', body: { name: 'Lanzones', category: 'Tropical' } },
      { method: 'POST', path: '/api/fruits', body: { name: 'No category' }, label: 'invalid: 400' },
      { method: 'POST', path: '/api/fruits', label: 'no body: 500' },
      { method: 'PATCH', path: '/api/fruits/2', body: { stock: 80 } },
      { method: 'PATCH', path: '/api/fruits/999', body: { stock: 80 } },
      { method: 'DELETE', path: '/api/fruits/1' },
      { method: 'DELETE', path: '/api/fruits/999' },
      get('/test/db.json', 'static mount'),
    ]);
  });

  // docs/sqlite-migration-plan.md, Phase 1 step 0. A write saves whenever it
  // ran a mutating operation, even when the data comes out identical: each of
  // these requests leaves db.json's content unchanged, yet each rewrites it
  // today. A store that compared content before saving would drop these
  // writes; this pins them. (Planner-task and reachout PATCHes always set
  // updatedAt, and an attendance PATCH on a string id renumbers it (M6), so
  // they're never no-ops and aren't here.) Recorded against the pre-Phase-1 server.
  test('no-op writes still save db.json', async (t) => {
    await scenario(t, [
      { method: 'PATCH', path: '/api/sprints/1', body: {}, label: 'empty body' },
      { method: 'PATCH', path: '/api/sprint-retros/1', body: { text: 'Pair on AEM environment setup earlier so blockers surface on day one' }, label: 'same text' },
      { method: 'POST', path: '/api/capacity-entries', body: { sprintName: 'Sprint 2', eid: 'rafael.t.mendoza' }, label: 'existing entry, no values' },
      { method: 'PATCH', path: '/api/attendance/5', body: {}, label: 'empty body, numeric id' },
      { method: 'PATCH', path: '/api/competency-records/rafael.t.mendoza', body: {}, label: 'empty body' },
    ]);
  });

  test('routes that touch no data file', async (t) => {
    // The SPA fallback is left out: its status depends on whether dist/ is built.
    await scenario(t, [get('/api/health'), get('/api/dashboard')]);
  });
});
