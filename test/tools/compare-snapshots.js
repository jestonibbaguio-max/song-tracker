#!/usr/bin/env node
// Compares the snapshot files in the working tree with those at a git ref,
// ignoring the order of keys inside JSON values (docs/sqlite-migration-plan.md,
// Phase 3: "run a key-order-insensitive comparison of the snapshots, so a
// reordering of keys can't hide a change in values").
//
//   node test/tools/compare-snapshots.js [--old <git ref>] [--quiet]
//
// <git ref> defaults to HEAD. For every *.test.js.snapshot under test/, it lists:
//   - entries added or removed;
//   - entries whose text changed only in the order of keys ("reordered");
//   - entries whose values changed, with a line diff of their key-sorted text
//     (unless --quiet).
// A JSON value is any response or request body block, any "parsed JSON" block,
// and the value(s) on a diff line ("+ path: value", "~ path: a → b").
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { unifiedDiff } = require('../helpers/characterize');

const ROOT = path.resolve(__dirname, '..', '..');
const args = process.argv.slice(2);
const oldRef = args.includes('--old') ? args[args.indexOf('--old') + 1] : 'HEAD';
const quiet = args.includes('--quiet');

function snapshotFiles(dir = path.join(ROOT, 'test')) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...snapshotFiles(full));
    else if (entry.name.endsWith('.snapshot')) out.push(path.relative(ROOT, full).split(path.sep).join('/'));
  }
  return out.sort();
}

function parseSnapshots(source) {
  const entries = {};
  if (source !== null) new Function('exports', source)(entries);
  return entries;
}

function oldSource(file) {
  try {
    return execFileSync('git', ['show', `${oldRef}:${file}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

// ── Key-sorted text ──────────────────────────────────────────────────────────

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortKeys(value[k])]));
  }
  return value;
}

const sorted = (text) => JSON.stringify(sortKeys(JSON.parse(text)));

function tryJson(text) {
  try { return sorted(text); } catch { return null; }
}

/** "a → b" where a and b are JSON, split at the first arrow that leaves two valid values. */
function sortChange(text) {
  let at = text.indexOf(' → ');
  while (at !== -1) {
    const a = tryJson(text.slice(0, at));
    const b = a !== null ? tryJson(text.slice(at + 3)) : null;
    if (b !== null) return `${a} → ${b}`;
    at = text.indexOf(' → ', at + 1);
  }
  return tryJson(text) ?? text;
}

const OP_LINE = /^(\s*[+\-~↕] .*?(?: \(at index \d+\))?): (.*)$/;
const BLOCK_HEADERS = new Set(['response body:', 'request body:', 'parsed JSON:']);

/** The entry's text with every JSON value it holds re-serialised with sorted keys. */
function keySorted(text) {
  const lines = text.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (BLOCK_HEADERS.has(line.trim())) {
      const indent = line.length - line.trimStart().length;
      let j = i + 1;
      while (j < lines.length && lines[j] !== '' && lines[j].length - lines[j].trimStart().length > indent) j++;
      const block = lines.slice(i + 1, j).map((l) => l.trim()).join('\n');
      const json = tryJson(block);
      out.push(line);
      if (json !== null) out.push(' '.repeat(indent + 2) + json);
      else out.push(...lines.slice(i + 1, j));
      i = j - 1;
      continue;
    }
    const op = OP_LINE.exec(line);
    out.push(op ? `${op[1]}: ${sortChange(op[2])}` : line);
  }
  return out.join('\n');
}

// ── Run ──────────────────────────────────────────────────────────────────────

const summary = { added: [], removed: [], reordered: [], changed: [] };

for (const file of snapshotFiles()) {
  const before = parseSnapshots(oldSource(file));
  const after = parseSnapshots(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  const short = path.basename(file);
  for (const name of Object.keys(before)) if (!(name in after)) summary.removed.push(`${short} › ${name}`);
  for (const [name, text] of Object.entries(after)) {
    if (!(name in before)) { summary.added.push(`${short} › ${name}`); continue; }
    if (before[name] === text) continue;
    const a = keySorted(before[name]);
    const b = keySorted(text);
    if (a === b) summary.reordered.push(`${short} › ${name}`);
    else summary.changed.push({ name: `${short} › ${name}`, diff: unifiedDiff(a.split('\n'), b.split('\n'), 1) });
  }
}

console.log(`compared with ${oldRef}`);
console.log(`  added: ${summary.added.length}, removed: ${summary.removed.length}, key order only: ${summary.reordered.length}, values changed: ${summary.changed.length}`);
for (const n of summary.added) console.log(`  + ${n}`);
for (const n of summary.removed) console.log(`  - ${n}`);
if (!quiet) for (const n of summary.reordered) console.log(`  ↕ ${n}`);
for (const { name, diff } of summary.changed) {
  console.log(`\n  ~ ${name}`);
  if (!quiet) for (const l of diff) console.log(`      ${l}`);
}
