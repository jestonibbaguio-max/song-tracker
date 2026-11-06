// Characterization tests: health, dashboard, skill options, legacy /api/tasks,
// and what happens to requests no route matches.
// These pin down current behaviour, bugs included. See docs/found-bugs.md.
const { describe, test } = require('node:test');
const {
  describeEndpoint, runCase, snapshot, CREDENTIALS, MALFORMED_JSON,
  removeFile, writeFile, steps,
} = require('../../helpers/characterize');

// ── Health and dashboard ─────────────────────────────────────────────────────

describeEndpoint('GET /api/health', {
  happy: {
    'reports ok': {},
  },
  invalid: {
    'unexpected query string is ignored': { path: '/api/health?verbose=true&x[]=1' },
    'malformed JSON body': MALFORMED_JSON,
  },
  notFound: {
    'unknown sub-path falls through to the SPA catch-all': { path: '/api/health/details' },
  },
});

describeEndpoint('GET /api/dashboard', {
  happy: {
    'returns the hard-coded dashboard payload': {},
  },
  invalid: {
    'malformed JSON body': MALFORMED_JSON,
  },
  notFound: {
    'unknown sub-path falls through to the SPA catch-all': { path: '/api/dashboard/1' },
  },
});

describeEndpoint('GET /api/skill-options', {
  happy: {
    'lists skills from the roster': {},
  },
  invalid: {
    'malformed JSON body': MALFORMED_JSON,
    'roster record without an id is back-filled and the file rewritten': {
      setup: (dataDir) => {
        const fs = require('node:fs');
        const file = require('node:path').join(dataDir, 'custom-onboarding.json');
        const records = JSON.parse(fs.readFileSync(file, 'utf8'));
        delete records[0].id;
        fs.writeFileSync(file, JSON.stringify(records, null, 2) + '\n', 'utf8');
      },
    },
  },
  notFound: {
    'custom-onboarding.json missing: reseeded from custom.csv': { setup: removeFile('custom-onboarding.json') },
    'custom-onboarding.json and custom.csv both missing': {
      setup: steps(removeFile('custom-onboarding.json'), removeFile('custom.csv')),
    },
  },
});

// ── Legacy tasks (data/tasks.json) ───────────────────────────────────────────

// tasks.json isn't in the fixtures; the server creates it on first use. These
// cases start from an existing file written the way json-store.js writes it.
const LEGACY_TASKS = [
  { id: 3, title: 'Review sprint 2 capacity sheet', status: 'open', created_at: '2026-10-28T02:00:00.000Z', updated_at: '2026-10-28T02:00:00.000Z' },
  { id: 2, title: 'Collect group 5 retro notes', status: 'done', created_at: '2026-10-24T06:30:00.000Z', updated_at: '2026-10-25T01:15:00.000Z' },
  { id: 1, title: 'Prepare onboarding report', status: 'open', created_at: '2026-10-13T00:10:00.000Z', updated_at: '2026-10-13T00:10:00.000Z' },
];
const withTasks = writeFile('tasks.json', JSON.stringify(LEGACY_TASKS, null, 2) + '\n');

describeEndpoint('GET /api/tasks', {
  happy: {
    'lists tasks from tasks.json': { setup: withTasks },
  },
  invalid: {
    'malformed JSON body': { setup: withTasks, ...MALFORMED_JSON },
    'tasks.json is not valid JSON: replaced with the seed task': { setup: writeFile('tasks.json', '[{"id": 1,') },
    'tasks.json starts with a UTF-8 BOM: replaced with the seed task': {
      setup: writeFile('tasks.json', '﻿' + JSON.stringify(LEGACY_TASKS, null, 2) + '\n'),
    },
  },
  notFound: {
    'tasks.json missing: created with a seed task': {},
  },
});

describeEndpoint('POST /api/tasks', {
  happy: {
    'adds a task to the front of the list': { setup: withTasks, body: { title: 'Book mock interview slots', status: 'in-progress' } },
    'status defaults to "open" and title is trimmed': { setup: withTasks, body: { title: '  Book mock interview slots  ' } },
  },
  invalid: {
    'missing title': { setup: withTasks, body: { status: 'open' } },
    'whitespace-only title': { setup: withTasks, body: { title: '   ' } },
    'whitespace-only status falls back to "open"': { setup: withTasks, body: { title: 'x', status: '   ' } },
    'non-string title is stringified': { setup: withTasks, body: { title: 42, status: true } },
    'extra fields are dropped': { setup: withTasks, body: { title: 'x', id: 99, created_at: '2020-01-01T00:00:00.000Z' } },
    'no body': { setup: withTasks },
    'malformed JSON body': { setup: withTasks, ...MALFORMED_JSON },
  },
  notFound: {
    'tasks.json missing: seed task created first': { body: { title: 'Book mock interview slots' } },
  },
});

describeEndpoint('PATCH /api/tasks/:id', {
  happy: {
    'updates title and status': { setup: withTasks, path: '/api/tasks/2', body: { title: 'Collect all retro notes', status: 'open' } },
    'status only': { setup: withTasks, path: '/api/tasks/3', body: { status: 'done' } },
  },
  invalid: {
    'empty title': { setup: withTasks, path: '/api/tasks/2', body: { title: '' } },
    'whitespace-only status': { setup: withTasks, path: '/api/tasks/2', body: { status: '  ' } },
    'null title becomes the string "null"': { setup: withTasks, path: '/api/tasks/2', body: { title: null } },
    'empty body still bumps updated_at': { setup: withTasks, path: '/api/tasks/2', body: {} },
    'no body': { setup: withTasks, path: '/api/tasks/2' },
    'malformed JSON body': { setup: withTasks, path: '/api/tasks/2', ...MALFORMED_JSON },
  },
  notFound: {
    'unknown id': { setup: withTasks, path: '/api/tasks/999', body: { status: 'done' } },
    'non-numeric id': { setup: withTasks, path: '/api/tasks/abc', body: { status: 'done' } },
    'tasks.json missing: seed created, then 404': { path: '/api/tasks/999', body: { status: 'done' } },
  },
});

describeEndpoint('DELETE /api/tasks/:id', {
  happy: {
    'deletes a task': { setup: withTasks, path: '/api/tasks/2' },
  },
  invalid: {
    'non-numeric id': { setup: withTasks, path: '/api/tasks/abc' },
    'malformed JSON body': { setup: withTasks, path: '/api/tasks/2', ...MALFORMED_JSON },
  },
  notFound: {
    'unknown id: 200 with deleted false': { setup: withTasks, path: '/api/tasks/999' },
    'tasks.json missing: seed created, then deleted false': { path: '/api/tasks/999' },
  },
});

// ── Requests no route matches, and the static mounts ─────────────────────────

describe('unmatched routes and static mounts', () => {
  const cases = {
    'GET unknown /api path': ['GET', '/api/does-not-exist', {}],
    'GET unknown /api path with a JSON body': ['GET', '/api/does-not-exist', { body: { a: 1 } }],
    'GET a planned but unimplemented endpoint (/api/trainings-progress/:eid)': ['GET', '/api/trainings-progress/liza.m.navarro', {}],
    'POST unknown /api path': ['POST', '/api/does-not-exist', { body: { a: 1 } }],
    'PUT on an existing collection (no PUT routes)': ['PUT', '/api/sprints/1', { body: { name: 'x' } }],
    'PATCH a collection route without an id': ['PATCH', '/api/sprints', { body: { name: 'x' } }],
    'DELETE /api/onboarding-resources without an id': ['DELETE', '/api/onboarding-resources', {}],
    'GET /test/ (test bench has no index.html in the fixtures)': ['GET', '/test/', {}],
    'GET /test/db.json serves the fruits data file': ['GET', '/test/db.json', {}],
    'GET /test/../db.json does not escape the static root': ['GET', '/test/..%2fdb.json', {}],
    'OPTIONS preflight from any origin': ['OPTIONS', '/api/sprints', {}],
  };
  for (const [name, [method, urlPath, kase]] of Object.entries(cases)) {
    test(name, async (t) => {
      snapshot(t, await runCase(method, urlPath, kase, CREDENTIALS.none));
    });
  }
});

