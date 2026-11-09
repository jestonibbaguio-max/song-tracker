// Self-tests for the characterization helpers: the outbound-call fake and the
// raw/JSON diffing that the snapshots rely on.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const outbound = require('./helpers/outbound-recorder');
const { unifiedDiff, jsonDiff, toLines, normalise } = require('./helpers/characterize');

test('outbound fake records and blocks a non-loopback fetch', async () => {
  outbound.reset();
  // 203.0.113.0/24 is TEST-NET-3: never routable, so nothing real could happen anyway.
  await assert.rejects(fetch('http://203.0.113.10:8080/hook', { method: 'POST', body: '{}' }));
  assert.deepEqual(outbound.recordedCalls(), [{ kind: 'network', host: '203.0.113.10', port: 8080 }]);
});

test('outbound fake records and blocks http.request by hostname', async () => {
  outbound.reset();
  await new Promise((resolve) => {
    http.get({ host: 'smtp.example.com', port: 587, path: '/' }).on('error', (err) => {
      assert.equal(err.code, 'EOUTBOUNDBLOCKED');
      resolve();
    });
  });
  assert.deepEqual(outbound.recordedCalls(), [{ kind: 'network', host: 'smtp.example.com', port: 587 }]);
});

test('outbound fake lets loopback traffic through and records nothing', async () => {
  outbound.reset();
  const server = http.createServer((req, res) => res.end('ok'));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/`);
    assert.equal(await res.text(), 'ok');
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  assert.deepEqual(outbound.recordedCalls(), []);
});

test('toLines shows a BOM and a missing final newline', () => {
  assert.deepEqual(toLines('a\nb\n'), ['a', 'b']);
  assert.deepEqual(toLines('a\nb'), ['a', 'b', '\\ No newline at end of file']);
  assert.deepEqual(toLines('﻿a\r\n'), ['<UTF-8 BOM>', 'a<CR>']);
});

test('unifiedDiff emits hunks with context and correct line numbers', () => {
  const a = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const b = ['1', '2', '3', 'four', '5', '6', '7', '8', '9', '10'];
  assert.deepEqual(unifiedDiff(a, b), [
    '@@ -2,5 +2,5 @@', ' 2', ' 3', '-4', '+four', ' 5', ' 6',
    '@@ -8,2 +8,3 @@', ' 8', ' 9', '+10',
  ]);
  assert.deepEqual(unifiedDiff(a, a), []);
});

test('jsonDiff matches records by id, keeps string and number ids apart, and reports moves', () => {
  const before = { rows: [{ id: '1', v: 'a' }, { id: 2, v: 'b' }, { id: 3, v: 'c' }] };
  const after = { rows: [{ id: 1, v: 'a' }, { id: 3, v: 'c' }, { id: 2, v: 'B' }], extra: true };
  assert.deepEqual(jsonDiff(before, after), [
    { op: 'remove', path: '/rows[id="1"]', value: { id: '1', v: 'a' } },
    { op: 'add', path: '/rows[id=1]', index: 0, value: { id: 1, v: 'a' } },
    { op: 'change', path: '/rows[id=2]/v', from: 'b', to: 'B' },
    { op: 'reorder', path: '/rows', from: ['2', '3'], to: ['3', '2'] },
    { op: 'add', path: '/extra', value: true },
  ]);
});

// Guardrail 2 (docs/server-restructure-plan.md, step 0): only timestamps stamped
// during the case's own run may be hidden behind <generated-timestamp>.
test('normalise hides only new timestamps that fall inside the run window', () => {
  const start = Date.parse('2026-11-06T08:00:00.000Z');
  const ctx = {
    knownTimestamps: new Set(['2026-10-28T02:00:00.000Z']),
    dataDir: '/nowhere',
    runWindow: { start, end: start + 250 },
  };
  const out = normalise({
    inWindow: '2026-11-06T08:00:00.100Z',
    atStart: '2026-11-06T08:00:00.000Z',
    atEnd: '2026-11-06T08:00:00.250Z',
    known: '2026-10-28T02:00:00.000Z',
    epoch: new Date(0).toISOString(),
    aDayEarly: '2026-11-05T08:00:00.100Z',
    justAfter: '2026-11-06T08:00:00.251Z',
    justBefore: '2026-11-06T07:59:59.999Z',
  }, ctx);
  assert.deepEqual(out, {
    inWindow: '<generated-timestamp>',
    atStart: '<generated-timestamp>',
    atEnd: '<generated-timestamp>',
    known: '2026-10-28T02:00:00.000Z',
    epoch: '1970-01-01T00:00:00.000Z',
    aDayEarly: '2026-11-05T08:00:00.100Z',
    justAfter: '2026-11-06T08:00:00.251Z',
    justBefore: '2026-11-06T07:59:59.999Z',
  });
});
