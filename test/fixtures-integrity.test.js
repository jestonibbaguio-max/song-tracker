// Guards the fixture dataset itself: if someone edits test/fixtures/data/,
// these checks make sure every cross-entity reference still resolves.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { FIXTURES_DIR } = require('./helpers/test-server');

const read = (file) => JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf8'));
const db = read('db.json');
const roster = read('custom-onboarding.json');

// Roster records come in two shapes (camelCase from the API, snake_case from the CSV seed).
const groupOf = (r) => r.groupNumber ?? r.group_number ?? null;
const eids = new Set(roster.map((r) => r.eid));
const names = new Set(roster.map((r) => r.name));
const byEid = new Map(roster.map((r) => [r.eid, r]));
const sprintNames = new Set(db.sprints.map((s) => s.name));
const sprintIds = new Set(db.sprints.map((s) => Number(s.id)));
const id = (x) => Number(x);

test('roster: unique numeric ids and eids; every poc is a roster member', () => {
  assert.equal(new Set(roster.map((r) => r.id)).size, roster.length);
  assert.equal(eids.size, roster.length);
  roster.forEach((r) => assert.equal(typeof r.id, 'number'));
  roster.filter((r) => r.poc).forEach((r) => assert.ok(eids.has(r.poc), `${r.eid}.poc → ${r.poc}`));
});

test('people referenced by eid exist in the roster', () => {
  const refs = [
    ...db.attendance.map((r) => ['attendance', r.eid]),
    ...db['capacity-entries'].map((r) => ['capacity-entries', r.eid]),
    ...db['competency-records'].map((r) => ['competency-records', r.eid]),
    ...db['planner-tasks'].map((r) => ['planner-tasks.assignee', r.assignee]),
    ...db['deletion-logs'].map((r) => ['deletion-logs.deletedByEid', r.deletedByEid]),
    ...db['project-reachouts'].map((r) => ['project-reachouts.pocEid', r.pocEid]),
  ];
  for (const [where, eid] of refs) assert.ok(eids.has(eid), `${where} → ${eid}`);
});

test('people referenced by display name exist in the roster', () => {
  const authors = db['planner-tasks'].flatMap((t) => (t.comments || []).map((c) => c.author));
  const logNames = db['deletion-logs'].flatMap((l) => [l.deletedBy, l.commentAuthor].filter(Boolean));
  for (const n of [...authors, ...logNames]) assert.ok(names.has(n), n);
});

test('reachout groupNumber matches the resource, or is null for an unknown eid', () => {
  for (const r of db['project-reachouts']) {
    const person = byEid.get(r.eid);
    assert.equal(r.groupNumber, person ? groupOf(person) : null, `reachout ${r.id}`);
  }
});

test('planner: boards → buckets → tasks → labels are consistent', () => {
  const boards = new Map(db['planner-boards'].map((b) => [id(b.id), b]));
  const buckets = new Map(db['planner-buckets'].map((b) => [id(b.id), b]));
  const labelIds = new Set(db['planner-labels'].map((l) => id(l.id)));

  for (const b of buckets.values()) {
    assert.ok(boards.has(b.boardId), `bucket ${b.id} board`);
    assert.ok(sprintNames.has(b.name), `bucket ${b.id} is named after a sprint`);
  }
  for (const t of db['planner-tasks']) {
    const bucket = buckets.get(t.bucketId);
    assert.ok(bucket, `task ${t.id} bucket`);
    assert.equal(bucket.boardId, t.boardId, `task ${t.id} bucket is on the task's board`);
    t.labels.forEach((l) => assert.ok(labelIds.has(id(l)), `task ${t.id} label ${l}`));
    assert.equal(groupOf(byEid.get(t.assignee)), boards.get(t.boardId).groupNumber, `task ${t.id} assignee is in the board's group`);
    assert.equal(t.completed, t.status === 'Completed', `task ${t.id} completed flag matches status`);

    const sprint = db.sprints.find((s) => s.name === bucket.name);
    for (const d of [t.startDate, t.dueDate].filter(Boolean)) {
      assert.ok(d >= sprint.start && d <= sprint.end, `task ${t.id} date ${d} inside ${sprint.name}`);
    }
  }
});

test('sprint references resolve', () => {
  db['sprint-retros'].forEach((r) => assert.ok(sprintIds.has(r.sprintId), `retro ${r.id}`));
  db['capacity-entries'].forEach((c) => assert.ok(sprintNames.has(c.sprintName), `capacity ${c.id}`));
});

test('attendance uses known statuses; only RTO rows carry a location', () => {
  const statuses = new Set(db['attendance-options'].map((o) => o.label));
  for (const a of db.attendance) {
    assert.ok(statuses.has(a.status), `attendance ${a.id} status ${a.status}`);
    assert.equal('location' in a, a.status === 'RTO', `attendance ${a.id} location`);
  }
});

test('office locations on the roster are known', () => {
  const offices = new Set(db['office-locations'].map((o) => o.name));
  roster.filter((r) => r.officeLocation).forEach((r) => assert.ok(offices.has(r.officeLocation), r.eid));
});

test('deletion logs: deleted tasks are gone, commented tasks still exist', () => {
  const taskIds = new Set(db['planner-tasks'].map((t) => id(t.id)));
  for (const log of db['deletion-logs']) {
    if (log.type === 'task-deletion') assert.ok(!taskIds.has(id(log.taskId)), `log ${log.id}`);
    else assert.ok(taskIds.has(id(log.taskId)), `log ${log.id}`);
  }
});

test('custom.csv seeds exactly the legacy snake_case roster records', () => {
  const [header, ...rows] = fs.readFileSync(path.join(FIXTURES_DIR, 'custom.csv'), 'utf8').trim().split(/\r?\n/);
  assert.equal(header, 'EID,GROUP,Primary Skill');
  const legacy = roster.filter((r) => 'group_number' in r);
  assert.deepEqual(
    rows.map((line) => line.split(',')).map(([eid, group, skill]) => ({ eid, group: Number(group), skill })),
    legacy.map((r) => ({ eid: r.eid, group: r.group_number, skill: r.primary_skill })).reverse()
  );
});
