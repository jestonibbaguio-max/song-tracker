// Guardrail (docs/sqlite-migration-plan.md, Phase 4 step 5): the SQL each
// request runs, on the SQLite backend.
//
// The counterpart of fs-trace for the database: the characterization snapshots
// pin what a request returns and what ends up stored, but not how. A query per
// row (N+1), a write outside a transaction, a second transaction where one
// should do, or a cached result instead of a query all leave those snapshots
// unchanged. This test keeps ONE app running per scenario, records every
// statement better-sqlite3 runs through the connection's `verbose` hook
// (persistence/sqlite/connection.js, setTracer), and snapshots the ordered
// list per request. BEGIN/COMMIT show each write's transaction.
//
// The statements are better-sqlite3's expanded SQL, with the bound values in
// place. Timestamps the server generates are replaced with <timestamp>.
//
// Phase 8's clean-ups (targeted queries, WHERE filters, a JOIN) will change
// these snapshots on purpose; that's the one place they may change.
const { describe, test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { startTestServer, SERVER_DIR, FIXTURES_DIR } = require('../../helpers/test-server');
const { DB_ROUTES, newJoiner, teresaEdited } = require('../../helpers/sample-requests');
const { backendSkip } = require('../../helpers/backend');

process.env.NODE_ENV = 'test';

const ISO_TIMESTAMP = /'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z'/g;

/** Timestamps already in the fixtures (e.g. a task's createdAt, rewritten by an UPDATE) stay literal. */
const FIXTURE_TIMESTAMPS = new Set(['db.json', 'custom-onboarding.json'].flatMap((file) =>
  fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf8').match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g) || [])
  .map((ts) => `'${ts}'`));

/** Send one request and return its status plus every statement it ran. */
async function traced(api, connection, { method, path: urlPath, body, rawBody }) {
  const headers = {};
  let payload;
  if (rawBody !== undefined) payload = rawBody;
  else if (body !== undefined) payload = JSON.stringify(body);
  if (payload !== undefined) headers['content-type'] = 'application/json';

  const statements = [];
  connection.setTracer((sql) => statements.push(normalise(sql)));
  try {
    const res = await fetch(api.baseUrl + urlPath, { method, headers, body: payload });
    await res.arrayBuffer();
    return { status: res.status, statements };
  } finally {
    connection.setTracer(null);
  }
}

/** One line per statement, whitespace collapsed, generated timestamps replaced. */
function normalise(sql) {
  return sql.replace(/\s+/g, ' ').trim().replace(ISO_TIMESTAMP, (ts) => (FIXTURE_TIMESTAMPS.has(ts) ? ts : "'<timestamp>'"));
}

function render(entries) {
  const lines = [];
  for (const { request, status, statements } of entries) {
    lines.push(`${request} → ${status}`);
    if (!statements.length) lines.push('  (no SQL)');
    for (const s of statements) lines.push(`  ${s}`);
  }
  return '\n' + lines.join('\n') + '\n';
}

/** Run requests in order on one app and snapshot the SQL of each. */
async function scenario(t, requests) {
  const api = await startTestServer(t);
  // The connection module of the app that just loaded (same module cache).
  const connection = require(path.join(SERVER_DIR, 'persistence', 'sqlite', 'connection.js'));
  const entries = [];
  for (const r of requests) {
    const { status, statements } = await traced(api, connection, r);
    entries.push({ request: `${r.method} ${r.path}${r.label ? ` (${r.label})` : ''}`, status, statements });
  }
  t.assert.snapshot(entries, { serializers: [render] });
}

const get = (p, label) => ({ method: 'GET', path: p, label });

describe('guardrail: SQL statements per request', { skip: backendSkip('sqlite', 'traces the SQLite backend') }, () => {
  test('db.json routes, in order on one app (each re-reads; one transaction per write)', async (t) => {
    const requests = [];
    for (const r of DB_ROUTES.filter((x) => !x.note)) {
      requests.push(r);
      if (r.method !== 'GET') requests.push(get(DB_ROUTES.find((x) => x.method === 'GET' && x.collection === r.collection).path, 'read back'));
    }
    await scenario(t, requests);
  });

  test('routes that answer 400 or 404', async (t) => {
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

  test('roster, skill options and competency', async (t) => {
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

  test('no-op writes still run their write', async (t) => {
    await scenario(t, [
      { method: 'PATCH', path: '/api/sprints/1', body: {}, label: 'empty body' },
      { method: 'PATCH', path: '/api/sprint-retros/1', body: { text: 'Pair on AEM environment setup earlier so blockers surface on day one' }, label: 'same text' },
      { method: 'POST', path: '/api/capacity-entries', body: { sprintName: 'Sprint 2', eid: 'rafael.t.mendoza' }, label: 'existing entry, no values' },
      { method: 'PATCH', path: '/api/attendance/5', body: {}, label: 'empty body' },
      { method: 'PATCH', path: '/api/competency-records/rafael.t.mendoza', body: {}, label: 'empty body' },
    ]);
  });

  test('routes that touch no stored data', async (t) => {
    await scenario(t, [get('/api/health'), get('/api/dashboard'), get('/api/tasks'), get('/api/fruits')]);
  });
});
