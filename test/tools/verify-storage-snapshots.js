#!/usr/bin/env node
// Checks the Phase 2 switch of the characterization snapshots from raw file
// diffs to logical diffs of the stores (docs/sqlite-migration-plan.md, Phase 2,
// step 2): that it changed only the storage sections, and that each logical
// diff says what the old file diff said.
//
//   CHARACTERIZE_STORAGE_REPORT=report.jsonl node --test "test/api/characterization/*.test.js"
//   node test/tools/verify-storage-snapshots.js report.jsonl [--old <git ref>]
//
// The test run writes one report line per case that runs on every backend
// (test/helpers/characterize.js): the "stored data" ops it snapshots, the
// store files' parsed JSON before and after the request, and the storage
// section rendered the old way. <git ref> (default HEAD) holds the old
// snapshots; the working tree holds the new ones.
//
// For every snapshot entry:
//   1. Same entry names in the old and new snapshot files.
//   2. Entries without a report (json-only cases, "identical to the happy
//      path" probes) are byte-identical.
//   3. For the others, everything outside the storage section is
//      byte-identical, and the old storage section is exactly what this run
//      rendered the old way (so the run reproduced the recorded raw diffs).
//   4. The new "stored data" section renders the ops this run recorded, and
//      the new "data files" section is the old one without db.json and
//      custom-onboarding.json.
//   5. The "stored data" ops equal a structural diff (jsonDiff) of the store
//      files themselves, put into canonical rows: the stores and the files agree.
//   6. Every raw change to a store file shows up in "stored data", unless the
//      canonical rows hide it. Hidden changes are listed by kind; they are
//      JSON-only storage details, so an entry that has any must have a
//      json-only copy that keeps its old text: an entry in the same file with
//      "(raw " in its name and exactly the old entry's text.
// Exits 1 if any check fails.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { isDeepStrictEqual } = require('node:util');
const { jsonDiff, renderJsonOp } = require('../helpers/characterize');
const { canonicalRows, COLLECTIONS } = require('../helpers/store-dump');

const ROOT = path.resolve(__dirname, '..', '..');
const SNAPSHOT_DIR = 'test/api/characterization';
const STORE_FILES = ['db.json', 'custom-onboarding.json'];
const COLLECTION_NAMES = new Set(COLLECTIONS.map((c) => c.name));

// ── Arguments ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const reportFile = args.find((a) => !a.startsWith('--'));
const oldRef = args.includes('--old') ? args[args.indexOf('--old') + 1] : 'HEAD';
if (!reportFile) {
  console.error('usage: node test/tools/verify-storage-snapshots.js <report.jsonl> [--old <git ref>]');
  process.exit(2);
}

// ── Snapshot files ───────────────────────────────────────────────────────────

/** A .snapshot file is CommonJS that assigns exports[name] = text. */
function parseSnapshots(source) {
  const entries = {};
  new Function('exports', source)(entries);
  return entries;
}

function snapshotFiles() {
  return fs.readdirSync(path.join(ROOT, SNAPSHOT_DIR)).filter((f) => f.endsWith('.snapshot')).sort();
}

function oldSnapshot(file) {
  const gitPath = `${SNAPSHOT_DIR}/${file}`;
  return execFileSync('git', ['show', `${oldRef}:${gitPath}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/**
 * Split a rendered entry around its storage section: the lines from "stored
 * data" or "data files" up to the blank line before "outbound calls".
 */
function splitStorage(text) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.startsWith('stored data') || l.startsWith('data files'));
  const outbound = lines.findIndex((l, i) => i > start && l.startsWith('outbound calls'));
  if (start === -1 || outbound === -1) return null;
  return {
    before: lines.slice(0, start).join('\n'),
    storage: lines.slice(start, outbound - 1),
    after: lines.slice(outbound - 1).join('\n'),
  };
}

/** The old "data files" section without the store files' blocks, rendered the way the new snapshots do. */
function withoutStoreFiles(storageLines) {
  const blocks = [];
  for (const line of storageLines.slice(1)) {
    if (/^ {2}\S/.test(line)) blocks.push([line]);
    else blocks[blocks.length - 1].push(line);
  }
  const kept = blocks.filter((b) => !STORE_FILES.includes(b[0].trim().replace(/: (modified|created|deleted)$/, '')));
  return kept.length ? ['data files:', ...kept.flat()] : ['data files: unchanged'];
}

// ── Canonical rows straight from the files ───────────────────────────────────

const toNumber = (fields) => (row) => {
  const out = { ...row };
  for (const f of fields) if (f in out) out[f] = Number(out[f]);
  return out;
};

/** What each store's list operation does to the stored rows before canonicalRow() (server/persistence/json/*.store.js). */
const LIST_OPERATION = {
  sprints: toNumber(['id']),
  'sprint-retros': toNumber(['id', 'sprintId', 'groupNumber']),
  'planner-boards': toNumber(['id', 'groupNumber']),
  'planner-buckets': toNumber(['id', 'boardId']),
  'planner-tasks': toNumber(['id', 'boardId', 'bucketId']),
};

function canonicalFromFiles(files) {
  const db = files['db.json'] && files['db.json'].value ? files['db.json'].value : {};
  const roster = files['custom-onboarding.json'] ? files['custom-onboarding.json'].value : [];
  const dump = {};
  for (const { name } of COLLECTIONS) {
    let rows = name === 'onboarding-resources' ? roster : db[name] || [];
    if (LIST_OPERATION[name]) rows = rows.map(LIST_OPERATION[name]);
    dump[name] = canonicalRows(name, rows);
  }
  return dump;
}

// ── Raw changes and whether "stored data" shows them ─────────────────────────

const camelCase = (key) => key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

/**
 * Where a raw op on a store file would show up in "stored data": the same
 * collection and record (id canonicalised, "2" → 2) and, for the roster, the
 * camelCase field. `collection` is null when the op isn't on a store collection.
 */
function canonicalPath(file, op) {
  const m = file === 'db.json'
    ? /^\/([^/[]+)(?:\[(id|eid)=([^\]]*)\])?(.*)$/.exec(op.path)
    : /^()(?:\[(id|eid)=([^\]]*)\])?(.*)$/.exec(op.path);
  const collection = file === 'db.json' ? m[1] : 'onboarding-resources';
  if (!COLLECTION_NAMES.has(collection)) return { collection: null, name: collection };
  if (!m[2]) return { collection, target: `/${collection}${m[4]}` };
  let value = JSON.parse(m[3]);
  if (m[2] === 'id' && typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) value = Number(value);
  const rest = file === 'custom-onboarding.json' ? m[4].replace(/^\/([^/[]+)/, (_, key) => `/${camelCase(key)}`) : m[4];
  return { collection, target: `/${collection}[${m[2]}=${JSON.stringify(value)}]${rest}` };
}

/**
 * Whether "stored data" shows a raw op: an op at `target` or inside it. A
 * reorder only matches a reorder, and a whole record added or removed only
 * matches the same op on that record (jsonDiff turns an id that changes type
 * into a remove plus an add, and field changes on the canonical record don't
 * show that).
 */
function isShown(storedData, op, target) {
  if (op.op === 'reorder') return storedData.some((d) => d.op === 'reorder' && d.path === target);
  if ((op.op === 'add' || op.op === 'remove') && /\]$/.test(target)) {
    return storedData.some((d) => d.op === op.op && d.path === target);
  }
  return storedData.some((d) => d.path === target || d.path.startsWith(target + '/') || d.path.startsWith(target + '['));
}

function hiddenChanges(report) {
  const hidden = [];
  for (const file of STORE_FILES) {
    const before = report.storeFiles.before[file];
    const after = report.storeFiles.after[file];
    if (isDeepStrictEqual(before, after)) continue;
    if (!before || !after || before.error || after.error) {
      hidden.push({ file, kind: 'file created, deleted or unreadable', op: null });
      continue;
    }
    const ops = jsonDiff(before.value, after.value);
    if (!ops.length) hidden.push({ file, kind: 'formatting only', op: null });
    for (const op of ops) {
      const { collection, name, target } = canonicalPath(file, op);
      if (!collection) { hidden.push({ file, kind: `not a store collection (${name})`, op }); continue; }
      if (!isShown(report.storedData, op, target)) hidden.push({ file, kind: kindOf(file, op, ops), op });
    }
  }
  return hidden;
}

/** Why canonical rows hide a raw op. */
function kindOf(file, op, ops) {
  // jsonDiff matches records by JSON.stringify(id), so "2" → 2 is a remove plus an add.
  const id = /\[id=([^\]]*)\]$/.exec(op.path);
  if (id && (op.op === 'remove' || op.op === 'add')) {
    const other = typeof JSON.parse(id[1]) === 'string' ? JSON.parse(id[1]) : String(JSON.parse(id[1]));
    const pair = op.path.replace(/\[id=[^\]]*\]$/, '');
    const counterparts = [`${pair}[id=${JSON.stringify(other)}]`, `${pair}[id=${Number(other)}]`].filter((p) => p !== op.path);
    if (ops.some((o) => o.op !== op.op && counterparts.includes(o.path))) return 'id stored as a string, then as a number (M6)';
  }
  if (op.op === 'change' && /\/id$/.test(op.path) && Number(op.from) === Number(op.to)) return 'id stored as a string, then as a number (M6)';
  if (file === 'custom-onboarding.json') return 'roster record stores a field in both key styles (L9)';
  return 'other';
}

// ── Run ──────────────────────────────────────────────────────────────────────

const reports = new Map();
for (const line of fs.readFileSync(reportFile, 'utf8').split('\n').filter(Boolean)) {
  const r = JSON.parse(line);
  reports.set(`${r.name} 1`, r);
}

const failures = [];
const hiddenByEntry = [];
let compared = 0;
let identical = 0;
let checkedStorage = 0;
const seenReports = new Set();

for (const file of snapshotFiles()) {
  const oldEntries = parseSnapshots(oldSnapshot(file));
  const newEntries = parseSnapshots(fs.readFileSync(path.join(ROOT, SNAPSHOT_DIR, file), 'utf8'));
  const fail = (name, message) => failures.push(`${file} › ${name}: ${message}`);

  if (!isDeepStrictEqual(Object.keys(oldEntries).sort(), Object.keys(newEntries).sort())) {
    fail('(file)', 'entry names differ between the old and new snapshots');
  }

  for (const [name, newText] of Object.entries(newEntries)) {
    const oldText = oldEntries[name];
    if (oldText === undefined) continue;
    compared += 1;
    const report = reports.get(name);
    if (!report) {
      if (oldText === newText) identical += 1;
      else fail(name, 'has no storage report (json-only or same as the happy path), so it must be unchanged');
      continue;
    }
    seenReports.add(name);
    checkedStorage += 1;

    const o = splitStorage(oldText);
    const n = splitStorage(newText);
    if (!o || !n) { fail(name, 'storage section not found'); continue; }
    if (o.before !== n.before) fail(name, 'text before the storage section changed');
    if (o.after !== n.after) fail(name, 'text after the storage section changed');
    if (o.storage.join('\n') !== report.legacyStorageText) fail(name, 'this run did not reproduce the recorded file diffs');

    const dataFilesAt = n.storage.findIndex((l) => l.startsWith('data files'));
    const storedText = report.storedData.length
      ? ['stored data:', ...report.storedData.map((d) => `  ${renderJsonOp(d)}`)]
      : ['stored data: unchanged'];
    if (!isDeepStrictEqual(n.storage.slice(0, dataFilesAt), storedText)) fail(name, '"stored data" is not what this run recorded');
    if (!isDeepStrictEqual(n.storage.slice(dataFilesAt), withoutStoreFiles(o.storage))) {
      fail(name, '"data files" is not the old section without the store files');
    }

    const fromFiles = jsonDiff(canonicalFromFiles(report.storeFiles.before), canonicalFromFiles(report.storeFiles.after));
    if (!isDeepStrictEqual(fromFiles, report.storedData)) {
      fail(name, `"stored data" differs from the canonical diff of the files:\n    stores: ${JSON.stringify(report.storedData)}\n    files:  ${JSON.stringify(fromFiles)}`);
    }

    const hidden = hiddenChanges(report);
    if (hidden.length) {
      const copy = Object.keys(newEntries).find((k) => k.includes('(raw ') && newEntries[k] === oldText);
      if (!copy) fail(name, 'canonical rows hide some of its raw changes, and no json-only "(raw …)" entry keeps its old text');
      hiddenByEntry.push({ name: `${file} › ${name}`, hidden, copy });
    }
  }
}

for (const name of reports.keys()) if (!seenReports.has(name)) failures.push(`report for "${name}" has no snapshot entry`);

console.log(`entries compared: ${compared}`);
console.log(`  unchanged (json-only or same as the happy path): ${identical}`);
console.log(`  storage section checked against the report: ${checkedStorage}`);

const kinds = new Map();
for (const { hidden } of hiddenByEntry) for (const h of hidden) kinds.set(h.kind, (kinds.get(h.kind) || 0) + 1);
console.log(`\nraw store-file changes that canonical rows hide: ${[...kinds.values()].reduce((a, b) => a + b, 0)} in ${hiddenByEntry.length} entries`);
for (const [kind, count] of kinds) console.log(`  ${count} × ${kind}`);
for (const { name, hidden, copy } of hiddenByEntry) {
  console.log(`\n  ${name}`);
  console.log(`    pinned raw by: ${copy || '(nothing)'}`);
  for (const h of hidden) console.log(`    [${h.kind}] ${h.file}${h.op ? ` ${h.op.op} ${h.op.path}${'from' in h.op ? `: ${JSON.stringify(h.op.from)} → ${JSON.stringify(h.op.to)}` : ''}` : ''}`);
}

if (failures.length) {
  console.log(`\nFAILED (${failures.length}):`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log('\nOK: only the storage sections changed, and every logical diff matches the files.');
