// Characterization-test helpers: run one HTTP request against a fresh copy of
// the fixtures and capture everything observable about it, then snapshot it.
//
// What a snapshot holds, per request:
//   - the request (method, path, credentials sent, body)
//   - the response status, a few headers, and the body
//   - "stored data": a logical diff of the stores (rows added, changed and
//     removed per collection), from a dump before and after the request
//     (store-dump.js). It reads through the stores, never the database file
//     (docs/sqlite-migration-plan.md, Phase 2).
//   - "data files": every other file in DATA_DIR that changed (tasks.json and
//     the fruits test bench, which stay on JSON): an exact line diff of the
//     raw text and a structural diff of the parsed JSON. The JSON seed is in
//     DATA_DIR too, but nothing writes it once the database is built.
//   - every outbound network call the process attempted (see outbound-recorder)
//
// A case's setup edits the copied files before the app loads. The harness
// builds dashboard.sqlite from the JSON seed after the setup has run, so a
// setup that edits db.json or custom-onboarding.json changes the database.
//
// Normalised so snapshots are stable across runs and machines:
//   - ISO timestamps that weren't in the data or the request AND fall inside
//     this case's run (from before the app loads until the response arrives)
//     become <generated-timestamp>. Any other new timestamp stays literal, so
//     a wrong or shifted one (epoch, a day off, copied from elsewhere) shows up
//     as a snapshot mismatch instead of being hidden by the placeholder.
//   - the temp DATA_DIR path becomes <DATA_DIR>
//   - stack traces in Express's HTML error pages are cut after the message
//   - the SPA catch-all, whose result depends on whether dist/ has been built
//
// Generated IDs are NOT normalised: the server uses max(id)+1 and every test
// starts from the same fixtures, so IDs are deterministic. Keeping them makes
// the snapshots show the ID behaviour, including string IDs turning into numbers.
//
// Update snapshots with: npm run test:api:update

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { startTestServer } = require('./test-server');
const outbound = require('./outbound-recorder');
const { dumpStore } = require('./store-dump');

// Express reads NODE_ENV when the app is created. Pin it so snapshots don't
// depend on the shell: anything but "production" puts the error message in the
// HTML error page, and "test" also stops Express logging every stack to stderr.
process.env.NODE_ENV = 'test';

/**
 * The API has no authentication. These are probes in the shape a typical
 * auth layer would read (bearer token plus user/role headers); the server
 * currently reads none of them. "poc" is a group POC (see test/fixtures/README.md),
 * "wrongRole" is a brand-new joiner with no group, claiming a viewer role.
 */
const CREDENTIALS = {
  poc: {
    label: 'group 5 POC (rafael.t.mendoza, role poc)',
    headers: {
      authorization: 'Bearer fake-token-rafael.t.mendoza',
      'x-user-eid': 'rafael.t.mendoza',
      'x-user-role': 'poc',
    },
  },
  none: { label: 'none', headers: {} },
  wrongRole: {
    label: 'no-group new joiner (paolo.d.ramos, role viewer)',
    headers: {
      authorization: 'Bearer fake-token-paolo.d.ramos',
      'x-user-eid': 'paolo.d.ramos',
      'x-user-role': 'viewer',
    },
  },
};

/** A body Express's JSON parser rejects. */
const MALFORMED_JSON = { rawBody: '{"broken": ' };

const SNAPSHOT_HEADERS = ['content-type', 'access-control-allow-origin', 'x-powered-by'];
const ISO_TIMESTAMP = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g;
const NA = Symbol('not applicable');

/** Mark a case category as not applicable to an endpoint, with the reason. */
function notApplicable(reason) {
  return { [NA]: reason };
}

/**
 * The reason for the roster routes' "not found" category. Its cases were a
 * missing or corrupt custom-onboarding.json and custom.csv, which pinned the
 * JSON backend and went with it (docs/sqlite-migration-plan.md, Phase 8).
 */
const ROSTER_IS_A_TABLE = 'the roster is a database table since Phase 8: no roster file can be missing';

/** A SQLite database file (or its -wal/-shm/-journal file). */
const isSqliteFile = (relativePath) => /\.sqlite(?:-wal|-shm|-journal)?$/.test(relativePath);

// ── Running one case ─────────────────────────────────────────────────────────

/**
 * @typedef {object} Case
 * @property {string} [path]        request path incl. query (defaults to the route path)
 * @property {*} [body]             sent as JSON
 * @property {string} [rawBody]     sent verbatim as application/json
 * @property {(dataDir: string) => void} [setup]  edit the copied data before the app loads
 * @property {{method: string, path: string, body?: *}[]} [before]  requests whose effects are not snapshotted
 */

async function runCase(method, defaultPath, kase, credentials) {
  // Everything the server generates during this case is stamped inside this window.
  const runWindow = { start: Date.now(), end: Infinity };
  let knownTimestamps = new Set();
  const api = await startTestServer(undefined, {
    beforeStart(dataDir) {
      if (kase.setup) kase.setup(dataDir);
      knownTimestamps = collectTimestamps(readTree(dataDir));
    },
  });

  try {
    for (const step of kase.before || []) {
      const res = await send(api.baseUrl, step.method, step.path, { body: step.body }, {});
      assert.ok(res.status < 400, `setup request ${step.method} ${step.path} failed with ${res.status}`);
    }

    const requestPath = kase.path ?? defaultPath;
    for (const s of JSON.stringify(kase.body ?? kase.rawBody ?? '').match(ISO_TIMESTAMP) || []) knownTimestamps.add(s);

    const filesBefore = readTree(api.dataDir);
    const storeBefore = dumpUnchanged(api.dataDir, filesBefore);
    outbound.reset();
    const res = await send(api.baseUrl, method, requestPath, kase, credentials.headers);
    runWindow.end = Date.now();
    const filesAfter = readTree(api.dataDir);
    const storeAfter = dumpUnchanged(api.dataDir, filesAfter);

    const outcome = {
      request: {
        method,
        path: requestPath,
        credentials: credentials.label,
        ...('body' in kase ? { body: kase.body } : {}),
        ...('rawBody' in kase ? { rawBody: kase.rawBody } : {}),
      },
      response: normaliseCatchAll(res),
      storedData: jsonDiff(storeBefore, storeAfter),
      dataFiles: diffTrees(filesBefore, filesAfter),
      outboundCalls: outbound.recordedCalls(),
    };
    return normalise(outcome, { knownTimestamps, dataDir: api.dataDir, runWindow });
  } finally {
    await api.close();
  }
}

/** dumpStore(), checking that reading the stores changed no file in DATA_DIR. */
function dumpUnchanged(dataDir, tree) {
  const dump = dumpStore();
  const changed = diffTrees(tree, readTree(dataDir)).map((f) => f.file);
  assert.deepEqual(changed, [], 'dumping the stores changed data files');
  return dump;
}

// node:http rather than fetch, because fetch refuses to send a body with GET
// and Express parses JSON bodies on every method.
function send(baseUrl, method, urlPath, kase, headers) {
  const reqHeaders = { ...headers };
  let payload;
  if (kase.rawBody !== undefined) payload = kase.rawBody;
  else if (kase.body !== undefined) payload = JSON.stringify(kase.body);
  if (payload !== undefined) {
    reqHeaders['content-type'] = 'application/json';
    reqHeaders['content-length'] = Buffer.byteLength(payload);
  }

  return new Promise((resolve, reject) => {
    const req = http.request(new URL(urlPath, baseUrl), { method, headers: reqHeaders, agent: false }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('error', reject);
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        const headersOut = {};
        for (const name of SNAPSHOT_HEADERS) if (res.headers[name] !== undefined) headersOut[name] = res.headers[name];
        const isJson = (headersOut['content-type'] || '').includes('application/json');
        resolve({ status: res.statusCode, headers: headersOut, body: isJson && text ? JSON.parse(text) : text });
      });
    });
    req.on('error', reject);
    req.end(payload);
  });
}

// The catch-all GET handler sends dist/atcp-song-dashboard/browser/index.html.
// That's 200 with build-specific HTML when the Angular app has been built and
// a 404 ENOENT page when it hasn't, so collapse both into one stable marker.
function normaliseCatchAll(res) {
  const html = typeof res.body === 'string' ? res.body : '';
  const isIndex = res.status === 200 && html.includes('<app-root');
  const isMissingIndex = res.status === 404 && html.includes('ENOENT') && html.includes('index.html');
  if (!isIndex && !isMissingIndex) return res;
  return {
    status: 'SPA catch-all',
    note: 'GET /.*/ fallback: 200 with dist/atcp-song-dashboard/browser/index.html when the Angular app is built, otherwise 404 ENOENT',
  };
}

// ── Data directory snapshots ─────────────────────────────────────────────────

/**
 * Every file in DATA_DIR, by relative path. SQLite database files are left out:
 * the stores in them show up as "stored data", their bytes are never
 * snapshotted, and a read can legitimately touch the -shm index.
 */
function readTree(root) {
  const files = new Map();
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const relative = path.relative(root, full).split(path.sep).join('/');
      if (entry.isDirectory()) walk(full);
      else if (!isSqliteFile(relative)) files.set(relative, fs.readFileSync(full));
    }
  })(root);
  return files;
}

function collectTimestamps(tree) {
  const found = new Set();
  for (const buf of tree.values()) for (const s of buf.toString('utf8').match(ISO_TIMESTAMP) || []) found.add(s);
  return found;
}

/** Every file that differs between two trees; `include` picks which files to compare. */
function diffTrees(before, after, include = () => true) {
  const names = [...new Set([...before.keys(), ...after.keys()])].filter(include).sort();
  const changes = [];
  for (const file of names) {
    const a = before.get(file);
    const b = after.get(file);
    if (a && b && a.equals(b)) continue;
    if (!b) {
      changes.push({ file, change: 'deleted' });
    } else if (!a) {
      const text = b.toString('utf8');
      changes.push({ file, change: 'created', raw: toLines(text), json: parseOrError(text) });
    } else {
      const textA = a.toString('utf8');
      const textB = b.toString('utf8');
      const jsonA = parseOrError(textA);
      const jsonB = parseOrError(textB);
      changes.push({
        file,
        change: 'modified',
        rawDiff: unifiedDiff(toLines(textA), toLines(textB)),
        jsonDiff: jsonA.error || jsonB.error ? { before: jsonA, after: jsonB } : jsonDiff(jsonA.value, jsonB.value),
      });
    }
  }
  return changes;
}

function parseOrError(text) {
  try {
    return { value: JSON.parse(text) };
  } catch (error) {
    return { error: `not valid JSON: ${error.message}` };
  }
}

/** Split into lines the way git shows them, making a missing final newline and a BOM visible. */
function toLines(text) {
  const lines = [];
  let body = text;
  if (body.startsWith('﻿')) {
    lines.push('<UTF-8 BOM>');
    body = body.slice(1);
  }
  const parts = body.split('\n');
  if (parts[parts.length - 1] === '') parts.pop();
  else parts.push('\\ No newline at end of file');
  return lines.concat(parts.map((l) => l.replace(/\r/g, '<CR>')));
}

/** Line diff (LCS) rendered as unified-diff hunks with 2 lines of context. */
function unifiedDiff(a, b, context = 2) {
  const n = a.length;
  const m = b.length;
  const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) ops.push({ op: ' ', line: a[i], ai: i++, bj: j++ });
    else if (j >= m || (i < n && lcs[i + 1][j] >= lcs[i][j + 1])) ops.push({ op: '-', line: a[i], ai: i++, bj: j });
    else ops.push({ op: '+', line: b[j], ai: i, bj: j++ });
  }

  // Each changed line plus `context` lines either side; overlapping ranges merge into one hunk.
  const ranges = [];
  ops.forEach((o, index) => {
    if (o.op === ' ') return;
    const start = Math.max(0, index - context);
    const end = Math.min(ops.length, index + context + 1);
    const last = ranges[ranges.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else ranges.push([start, end]);
  });

  const hunks = [];
  for (const [start, end] of ranges) {
    const slice = ops.slice(start, end);
    const aCount = slice.filter((o) => o.op !== '+').length;
    const bCount = slice.filter((o) => o.op !== '-').length;
    hunks.push(`@@ -${slice[0].ai + 1},${aCount} +${slice[0].bj + 1},${bCount} @@`);
    for (const o of slice) hunks.push(o.op + o.line);
  }
  return hunks;
}

/** Structural JSON diff. Arrays of records are matched by `id` (or `eid`) when every element has a unique one. */
function jsonDiff(a, b, at = '') {
  if (isDeepStrictEqual(a, b)) return [];
  if (Array.isArray(a) && Array.isArray(b)) {
    const key = recordKey(a, b);
    if (!key) {
      const out = [];
      for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if (i >= a.length) out.push({ op: 'add', path: `${at}[${i}]`, value: b[i] });
        else if (i >= b.length) out.push({ op: 'remove', path: `${at}[${i}]`, value: a[i] });
        else out.push(...jsonDiff(a[i], b[i], `${at}[${i}]`));
      }
      return out;
    }
    const id = (r) => JSON.stringify(r[key]);
    const mapA = new Map(a.map((r) => [id(r), r]));
    const mapB = new Map(b.map((r, index) => [id(r), { r, index }]));
    const out = [];
    for (const [k, r] of mapA) if (!mapB.has(k)) out.push({ op: 'remove', path: `${at}[${key}=${k}]`, value: r });
    for (const [k, { r, index }] of mapB) {
      const p = `${at}[${key}=${k}]`;
      if (!mapA.has(k)) out.push({ op: 'add', path: p, index, value: r });
      else out.push(...jsonDiff(mapA.get(k), r, p));
    }
    const orderA = a.map(id).filter((k) => mapB.has(k));
    const orderB = b.map(id).filter((k) => mapA.has(k));
    if (!isDeepStrictEqual(orderA, orderB)) out.push({ op: 'reorder', path: at || '/', from: orderA, to: orderB });
    return out;
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const out = [];
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const p = `${at}/${k}`;
      if (!(k in a)) out.push({ op: 'add', path: p, value: b[k] });
      else if (!(k in b)) out.push({ op: 'remove', path: p, value: a[k] });
      else out.push(...jsonDiff(a[k], b[k], p));
    }
    return out;
  }
  return [{ op: 'change', path: at || '/', from: a, to: b }];
}

function recordKey(a, b) {
  for (const key of ['id', 'eid']) {
    const ok = (arr) => {
      if (!arr.every((r) => isPlainObject(r) && key in r)) return false;
      return new Set(arr.map((r) => JSON.stringify(r[key]))).size === arr.length;
    };
    if ((a.length || b.length) && ok(a) && ok(b)) return key;
  }
  return null;
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// ── Normalisation ────────────────────────────────────────────────────────────

function normalise(value, ctx) {
  if (typeof value === 'string') return normaliseString(value, ctx);
  if (Array.isArray(value)) return value.map((v) => normalise(v, ctx));
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalise(v, ctx)]));
  }
  return value;
}

/** A timestamp counts as generated only if it is new AND was stamped during this case's run. */
function isGeneratedTimestamp(ts, knownTimestamps, runWindow) {
  if (knownTimestamps.has(ts)) return false;
  const at = Date.parse(ts);
  return at >= runWindow.start && at <= runWindow.end;
}

function normaliseString(s, { knownTimestamps, dataDir, runWindow }) {
  let out = s.replace(ISO_TIMESTAMP, (ts) => (isGeneratedTimestamp(ts, knownTimestamps, runWindow) ? '<generated-timestamp>' : ts));
  // Express's development error page: keep the message, drop the stack frames.
  out = out.replace(/(<br> &nbsp; &nbsp;at )[\s\S]*?(?=<\/pre>)/g, '$1<stack trace removed>');
  const escaped = dataDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  out = out.replace(new RegExp(escaped + '([\\\\/][^\\s\'"&<]*)?', 'g'), (_, rest = '') => '<DATA_DIR>' + rest.replace(/\\/g, '/'));
  return out;
}

// ── Snapshot rendering ───────────────────────────────────────────────────────

function render(outcome) {
  const lines = [];
  const push = (text, depth = 0) => {
    for (const l of String(text).split('\n')) lines.push('  '.repeat(depth) + l);
  };
  const block = (value) => (typeof value === 'string' ? (value === '' ? '(empty)' : value) : JSON.stringify(value, null, 2));

  const { request } = outcome;
  push(`${request.method} ${request.path}`);
  push(`credentials: ${request.credentials}`);
  if ('body' in request) { push('request body:'); push(block(request.body), 1); }
  if ('rawBody' in request) { push('request body (raw):'); push(request.rawBody, 1); }

  if (outcome.sameAsHappyPath) {
    push('');
    push(`=> identical to the happy path (${outcome.sameAsHappyPath}): same status, body, data-file changes and outbound calls`);
    return '\n' + lines.join('\n') + '\n';
  }

  const { response } = outcome;
  push('');
  push(`status: ${response.status}`);
  if (response.note) push(`note: ${response.note}`);
  for (const [k, v] of Object.entries(response.headers || {})) push(`${k}: ${v}`);
  if ('body' in response) { push('response body:'); push(block(response.body), 1); }

  push('');
  if (outcome.storedData) {
    if (!outcome.storedData.length) push('stored data: unchanged');
    else push('stored data:');
    for (const d of outcome.storedData) push(renderJsonOp(d), 1);
  }
  for (const l of renderDataFiles(outcome.dataFiles)) lines.push(l);

  push('');
  if (!outcome.outboundCalls.length) push('outbound calls: none');
  else { push('outbound calls:'); for (const c of outcome.outboundCalls) push(JSON.stringify(c), 1); }
  return '\n' + lines.join('\n') + '\n';
}

/** The "data files" section: one block per changed file, with its raw text diff and parsed JSON diff. */
function renderDataFiles(dataFiles) {
  const lines = [];
  const push = (text, depth = 0) => {
    for (const l of String(text).split('\n')) lines.push('  '.repeat(depth) + l);
  };
  if (!dataFiles.length) push('data files: unchanged');
  else push('data files:');
  for (const f of dataFiles) {
    push(`${f.file}: ${f.change}`, 1);
    if (f.raw) { push('raw text:', 2); push(f.raw.join('\n'), 3); }
    if (f.json) { push('parsed JSON:', 2); push(f.json.error || JSON.stringify(f.json.value, null, 2), 3); }
    if (f.rawDiff) { push('raw text diff:', 2); push(f.rawDiff.join('\n'), 3); }
    if (f.jsonDiff) {
      push('parsed JSON diff:', 2);
      if (Array.isArray(f.jsonDiff)) {
        if (!f.jsonDiff.length) push('(no semantic change; formatting only)', 3);
        for (const d of f.jsonDiff) push(renderJsonOp(d), 3);
      } else {
        push(`before: ${f.jsonDiff.before.error || 'valid JSON'}`, 3);
        push(`after: ${f.jsonDiff.after.error || 'valid JSON'}`, 3);
      }
    }
  }
  return lines;
}

function renderJsonOp(d) {
  const j = (v) => JSON.stringify(v);
  switch (d.op) {
    case 'add': return `+ ${d.path}${d.index !== undefined ? ` (at index ${d.index})` : ''}: ${j(d.value)}`;
    case 'remove': return `- ${d.path}: ${j(d.value)}`;
    case 'reorder': return `↕ ${d.path}: ${j(d.from)} → ${j(d.to)}`;
    default: return `~ ${d.path}: ${j(d.from)} → ${j(d.to)}`;
  }
}

function snapshot(t, outcome) {
  t.assert.snapshot(outcome, { serializers: [render] });
}

// ── Endpoint suites ──────────────────────────────────────────────────────────

/**
 * Generate the five characterization categories for one route.
 *
 *   describeEndpoint('POST /api/sprints', {
 *     happy:    { 'creates a sprint': { body: {...} } },
 *     invalid:  { 'missing end': { body: {...} } },
 *     notFound: { 'sprints collection missing': { setup, body } },   // or notApplicable('reason')
 *   });
 *
 * "no auth" and "wrong role" re-send the first happy-path case without
 * credentials and with the wrong role's credentials. They snapshot "identical
 * to the happy path" when nothing differs, and the full outcome when it does.
 */
function describeEndpoint(route, spec) {
  const [method, routePath] = route.split(' ');
  const defaultPath = routePath;

  describe(route, () => {
    const happyEntries = Object.entries(spec.happy);
    assert.ok(happyEntries.length, `${route} needs at least one happy-path case`);

    for (const [name, kase] of happyEntries) {
      test(`happy path › ${name}`, async (t) => {
        snapshot(t, await runCase(method, defaultPath, kase, CREDENTIALS.poc));
      });
    }

    const [baseName, baseCase] = happyEntries[0];
    for (const [category, credentials] of [['no auth', CREDENTIALS.none], ['wrong role', CREDENTIALS.wrongRole]]) {
      test(category, async (t) => {
        const happy = await runCase(method, defaultPath, baseCase, CREDENTIALS.poc);
        const probe = await runCase(method, defaultPath, baseCase, credentials);
        const { request: _a, ...happyRest } = happy;
        const { request, ...probeRest } = probe;
        snapshot(t, isDeepStrictEqual(happyRest, probeRest) ? { request, sameAsHappyPath: baseName } : probe);
      });
    }

    for (const [category, cases] of [['invalid input', spec.invalid], ['not found', spec.notFound]]) {
      if (cases && cases[NA]) {
        test(category, { skip: `not applicable: ${cases[NA]}` }, () => {});
        continue;
      }
      assert.ok(cases && Object.keys(cases).length, `${route} needs "${category}" cases or notApplicable()`);
      for (const [name, kase] of Object.entries(cases)) {
        test(`${category} › ${name}`, async (t) => {
          snapshot(t, await runCase(method, defaultPath, kase, CREDENTIALS.poc));
        });
      }
    }
  });
}

// ── Setup helpers for cases ──────────────────────────────────────────────────

/**
 * A value editDb writes as the number literal 1e999, which JSON.parse (and
 * so the import) reads as Infinity. JSON.stringify can't write Infinity.
 */
const INFINITY = '__1e999__';

/** Edit db.json in the temp DATA_DIR, writing it back in the server's own format. */
function editDb(fn) {
  return (dataDir) => {
    const file = path.join(dataDir, 'db.json');
    const db = JSON.parse(fs.readFileSync(file, 'utf8'));
    fn(db);
    fs.writeFileSync(file, JSON.stringify(db, null, 2).split(`"${INFINITY}"`).join('1e999'), 'utf8');
  };
}

function removeFile(relativePath) {
  return (dataDir) => fs.rmSync(path.join(dataDir, relativePath));
}

function writeFile(relativePath, content) {
  return (dataDir) => fs.writeFileSync(path.join(dataDir, relativePath), content, 'utf8');
}

module.exports = {
  describeEndpoint,
  notApplicable,
  runCase,
  snapshot,
  CREDENTIALS,
  MALFORMED_JSON,
  ROSTER_IS_A_TABLE,
  INFINITY,
  editDb,
  removeFile,
  writeFile,
  // exported for the helper's own tests
  unifiedDiff,
  jsonDiff,
  renderJsonOp,
  toLines,
  normalise,
};
