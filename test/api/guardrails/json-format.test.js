// Guardrail (docs/sqlite-migration-plan.md, Phase 2 step 5): how the JSON
// backend formats its files.
//
// The characterization snapshots record logical diffs of the stores, which
// say nothing about the bytes on disk. The JSON files' format still matters:
// people diff them in git, and the SQLite export (Phase 5) has to write exactly
// this format. So, for each store file, a write through the API must leave:
//   - db.json: JSON.stringify(data, null, 2), with no trailing newline;
//   - custom-onboarding.json: the same, plus one trailing newline;
//   - no BOM, LF line endings, and the existing keys in their existing order.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startTestServer } = require('../../helpers/test-server');
const { jsonOnly } = require('../../helpers/backend');
const { newJoiner } = require('../../helpers/sample-requests');

function assertFormat(file, { trailingNewline }) {
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(!text.startsWith('﻿'), 'no BOM');
  assert.ok(!text.includes('\r'), 'LF line endings');
  const data = JSON.parse(text);
  assert.equal(text, JSON.stringify(data, null, 2) + (trailingNewline ? '\n' : ''), '2-space JSON, byte for byte');
  return data;
}

describe('guardrail: JSON file format', { skip: jsonOnly('the JSON files themselves') }, () => {
  test('db.json: 2-space indentation, no trailing newline, collections in their order', async (t) => {
    const api = await startTestServer(t);
    const file = path.join(api.dataDir, 'db.json');
    const keysBefore = Object.keys(JSON.parse(fs.readFileSync(file, 'utf8')));

    const res = await api.request('POST', '/api/sprints', { name: 'Sprint 4', start: '2026-11-24', end: '2026-12-05' });
    assert.equal(res.status, 201);

    const db = assertFormat(file, { trailingNewline: false });
    assert.deepEqual(Object.keys(db), keysBefore);
    assert.deepEqual(Object.keys(db.sprints.at(-1)), ['id', 'name', 'start', 'end']);
  });

  test('db.json: a collection that was missing is added at the end', async (t) => {
    const api = await startTestServer(t, {
      beforeStart: (dataDir) => {
        const file = path.join(dataDir, 'db.json');
        const db = JSON.parse(fs.readFileSync(file, 'utf8'));
        delete db.sprints;
        fs.writeFileSync(file, JSON.stringify(db, null, 2), 'utf8');
      },
    });
    await api.request('POST', '/api/sprints', { name: 'Sprint 1', start: '2026-10-13', end: '2026-10-24' });
    const db = assertFormat(path.join(api.dataDir, 'db.json'), { trailingNewline: false });
    assert.equal(Object.keys(db).at(-1), 'sprints');
  });

  test('custom-onboarding.json: 2-space indentation and one trailing newline', async (t) => {
    const api = await startTestServer(t);
    const res = await api.request('POST', '/api/onboarding-resources', newJoiner);
    assert.equal(res.status, 201);
    const roster = assertFormat(path.join(api.dataDir, 'custom-onboarding.json'), { trailingNewline: true });
    assert.equal(roster[0].eid, newJoiner.eid, 'new records go first');
  });
});
