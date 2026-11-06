# `/server` restructure plan

**Status:** done. Steps 0–13 landed on `feature/backend-refactor` on top of the baseline commit `c54e754` ("Add characterization test baseline"). Each step has one or more commits, with moves kept separate from logic changes. No snapshot was updated, and every step left `npm run test:api` green. Where the work differs from this plan, see "Deviations" at the end.

**Goal:** split `server/` into feature modules (routes → controller → service → repository), plus shared `config/`, `middleware/` and `utils/`. Only repository code may touch `fs`. Behaviour must not change at all. The rules in [CLAUDE.md](../CLAUDE.md) ("Backend refactor rules" and "Persistence rules") apply to every step.

## What the plan relies on today

- **No in-memory caches.** Every request re-reads its JSON file and rewrites the whole file. Nothing is kept between requests.
- **Each data file has its own rules:**

| File | Owner today | When the file is unreadable | Trailing newline on write | Next id |
|---|---|---|---|---|
| `db.json` | `loadDb`/`saveDb` in `app.js` | returns `{}` (bug H2) | no | `max(id)+1`, non-numeric ids count as 0 |
| `custom-onboarding.json` | `onboarding-store.js` | throws (bug M3); reseeds from `custom.csv` if missing; rewrites missing or invalid ids on read | yes | `max(id)+1` |
| `tasks.json` | `json-store.js` | overwrites it with the seed task (bug H3) | yes | `max(id)+1` |
| `test_bwd/db.json` | `app.js` | returns `{ fruits: [] }` | no | `Math.max(...ids)+1`, or `1` when empty (**a different rule**) |

- **Module dependencies today:** `app → json-store → onboarding-store → data-dir`, plus `app → onboarding-store`.
- **Nothing reads or writes files when a module loads.** The only side effects at load time are resolving `DATA_DIR` (`data-dir.js`), creating the Express app (which reads `NODE_ENV` at that moment) and `listen()` in `server.js`.

Bug numbers (H2, M3 and so on) refer to [found-bugs.md](found-bugs.md). The refactor keeps every one of them.

## Target structure

```
server/
  server.js                      entry point: require('./app'), listen(PORT). Unchanged
  app.js                         composition only: middleware + routers in a fixed order; exports app
  config/
    index.js                     PORT, DATA_DIR, browserDir, all file paths (resolved once, on load)
  middleware/
    static.js                    /test static, dist static, GET /.*/ SPA fallback (see "The one fs exception")
  utils/
    ids.js                       nextId: max(id)+1 (NOT used by fruits)
    eid.js                       normalizeEid (onboarding and reachouts use identical logic)
    dates.js                     normalizeDateToUs, yes/no, years, skill tags
  data/                          the JSON files, unchanged
  persistence/                   one repository per physical file; the only modules that require fs
    db-file.repository.js        db.json: load() → db, or {} on error; save(db) with no trailing newline
    roster-file.repository.js    today's onboarding-store.js, moved without internal changes
    tasks-file.repository.js     tasks.json readJson/writeJson behaviour, kept exactly
    fruits-file.repository.js    test_bwd/db.json, with its own load fallback and next-id rule
  features/
    health/        routes, controller
    dashboard/     routes, controller, service         (hard-coded payload)
    legacy-tasks/  routes, controller, service, repository → tasks-file
    onboarding/    routes, controller, service (normalize/validate/format), repository → roster-file
                   + skill-options (it reads the roster)
    lookups/       attendance-options, office-locations, planner-labels (read-only)
    sprints/       sprints + sprint-retros (a retro POST checks the sprint exists in the same db object)
    capacity/
    attendance/
    planner/       boards, buckets, tasks, deletion-logs
    reachouts/
    competency/    its service uses onboarding's repository (one direction only)
    test-bench/    fruits routes, controller, service, repository → fruits-file
```

### Layer rules

- **Calls go one way:** routes → controller → service → repository → `persistence/` → `config/` or `utils/`.
- **Only `persistence/*` requires `fs`.** Feature repositories over `db.json` are pure functions on the `db` object, such as `findSprint(db, id)` or `insertRetro(db, row)`. They never touch `fs` themselves.
- **One load and one save per request.** The service loads `db` once, makes its changes and saves once. That keeps the number of reads and writes per request the same as today, which CLAUDE.md requires ("don't change when data is read or written").
- **Cross-feature calls only go from one feature's service to another feature's repository, never back.** Today the only such call is competency → onboarding.

### The one fs exception

`express.static` and `res.sendFile` in `middleware/static.js` read from disk. Either list it as a documented exception, or treat `static.js` as an infrastructure adapter that sits outside the rule.

## Migration order

Make each step its own commit. After each step, `npm run test:api` must pass with **no snapshot updates**. If a step needs `npm run test:api:update`, it changed behaviour, so revert it. Commits that only move files stay separate from commits that change logic.

| Step | What moves | Risk | Why it comes here |
|---|---|---|---|
| 0 | **Guardrails** (see below) | – | The current tests can't see a few kinds of breakage this refactor could cause |
| 1 | `config/`: `DATA_DIR`, `PORT`, `browserDir`, file paths | Low code risk, **high hidden risk** | `__dirname`-relative paths change depth (see "Side effects on load") |
| 2 | `health`, `dashboard` | Lowest | No data, pure responses. A rehearsal for the routes → controller split |
| 3 | `test-bench` (fruits + `fruits-file.repository`) | Low | Its data file is isolated and the frontend doesn't use it. A rehearsal for the repository pattern |
| 4 | `persistence/db-file.repository.js` (only `loadDb`/`saveDb`/`nextId` moved) | Low | Every later `db.json` feature needs it. The routes in `app.js` call it without being split yet |
| 5 | `lookups` (3 read-only routes) | Low | Read-only |
| 6 | `legacy-tasks` + `tasks-file.repository` | Low–medium | Isolated, but a read can write to disk. Removes the tasks half of `json-store.js` |
| 7 | `sprints` (incl. retros), then `capacity` | Medium | The first features that write. A retro POST must check the sprint and append the retro using **one** `db` object |
| 8 | `attendance` | Medium | Keeps the merge-the-whole-body PATCH behaviour (bug M6) |
| 9 | `planner` (boards, buckets, tasks, deletion logs) | Medium | The most routes, all of them thin |
| 10 | `reachouts` | Medium | Payload normalisation moves to the service. Validation runs *after* the row has been changed, and that order must stay |
| 11 | `onboarding` + skill-options | **High** | The most logic, mixed key styles, several reads per request, and coverage gaps. Move `onboarding-store.js` **unchanged** into `roster-file.repository.js`; only the normalize/validate/format functions move to the service |
| 12 | `competency` | High | Joins `db.json` with the roster. Keep the current order: read `db` first, then the roster |
| 13 | Shrink `app.js` to composition only; delete `json-store.js` | Low | Delete the unused `learnSkillOptions` in a separate commit, if at all |

### Step 0: guardrails

1. **Pin the real `browserDir` and the default `DATA_DIR`.** The tests deliberately treat "`dist/` served" and "`dist/` missing" as the same result, and they always set `DATA_DIR`. So a wrong `__dirname`-relative path in step 1 would pass every test. Add a test that checks `config.browserDir` and the default data folder resolve to the real repository paths.
2. **Close the timestamp blind spot.** The snapshot normaliser replaces any generated ISO timestamp, so a wrong or misplaced `createdAt` currently passes. (Changing a `createdAt` on purpose went undetected in a mutation test.) Only replace timestamps that fall inside the test run's time window.
3. **Add a test that makes several requests in a row.** For example: edit `db.json` on disk, GET, POST, then GET again. Each test today makes one request against a freshly loaded app, so a cache added by mistake would go unnoticed (see "Shared caches").
4. **Add a test that only `persistence/` files (plus the documented static exception) require `fs`.** Start with an allowlist of today's files and shrink it as each step lands.
5. **Before step 11, cover the untested onboarding branches:** the `rollInDate` format check, the 500 `catch` paths in POST and PATCH, CSV parsing with quoted fields and names containing spaces, and repair of ids that are zero, negative or fractional.

## Risks

### Middleware order

The required order is exactly: `cors()` → `express.json()` → API routers → `/test` static → `dist` static → `GET /.*/` fallback.

- **`cors()` must stay before the JSON parser.** In a mutation test, swapping them stripped the CORS header from the error responses for malformed bodies (47 tests failed).
- **Keep `express.json()` on the app, not inside an API router.** Today a malformed body gets a 400 on *every* path, including unknown ones. Moving the parser into a router would change those responses.
- **Register the fallback on `app`, after every router.** Any router mounted after it has its GET routes swallowed by `index.html`.
- **Don't add an API 404 handler or a custom error middleware during the refactor.** Either would change the HTML error pages and the fallback behaviour that the snapshots record (bugs L1 and M2). Make those fixes later, on purpose.
- **Mounting routers is low risk.** `express.Router()` has the same case-sensitivity and trailing-slash defaults as `app`. Still run each feature's tests as you go.

### Shared caches

There are none today, and CLAUDE.md says to keep it that way.

- **The tests wouldn't catch a read cache.** Each test loads a fresh app and usually makes one request, so a memoised `db` in a repository would still pass. In real use it would hide hand edits to the files and writes from other processes. Guardrail 3 covers this.
- **The only cache-like state is file paths resolved when a module loads.** The test harness clears `require.cache` only for modules under `server/`. So `config/` and `persistence/` must stay under `server/`, and paths must be resolved on load or on demand, never stored outside the folder the harness reloads.

### Circular imports

- **CommonJS cycles fail late.** One side receives a half-filled `{}`, so the failure is `x is not a function` *during a request*, not at startup, and only on code paths a test happens to run.
- **Likely cycles in this design:**
  - a cascade added later from onboarding to competency (competency already depends on onboarding);
  - a barrel file such as `features/index.js` that feature modules then import;
  - `config/` requiring `app.js`.
- **Rules:** no barrel files inside `features/`; competency → onboarding stays one-way; `config/` and `utils/` import nothing from the app. Step 11 removes the only cross-module link that exists today (`json-store → onboarding-store`), because `getSkillOptions` moves into the onboarding feature.

### Side effects on load

- **No file reads or writes when a module loads.** In particular, don't seed from the CSV, create `db.json` or "warm up" anything at startup. Seeding happens on the first request today, and some snapshots record it (`custom-onboarding.json: created`).
- **`listen()` stays only in `server.js`.** `app.js` keeps `module.exports = app`, because the test harness requires it and starts its own server.
- **Create one Express app, once.** Express reads `NODE_ENV` when the app is created, so a `createApp()` factory called in several places, or a different load order, could change the error-page mode.
- **`DATA_DIR` is resolved once, when `config` loads.** A module that captures a path before `config` is reloaded would point at the wrong temp folder in tests.

### Other risks

- **Keep the bugs while moving code.** Controllers must pass `req.body` through unchanged, so a missing body still causes a 500 (bug M1). A friendly `?? {}` would turn those into 400s, which is a behaviour change.
- **Keep the `try/catch` boundaries exactly where they are.** Onboarding POST and PATCH wrap only the save, and those catch paths are untested.
- **Don't merge the fruits next-id rule into `utils/ids.js`.** Fruits uses a different rule (see the table at the top), and a shared id generator would change it.
- **Stay synchronous, and keep each file's own error and formatting rules** from the table at the top. A generic `jsonFile` helper is the most likely way to lose the trailing-newline and error-handling differences.
- **`server.js` has no tests.** Step 1 changes where `PORT` comes from, so check by hand that `npm run api` prints the same `API running on http://127.0.0.1:3000` line and serves on port 3000.

## Deviations

- **Step 1 ran in reverse order.** The logic commit (config values added to `data-dir.js`) came before the pure move to `config/index.js`. Moving first would have made the step-0 `config` guardrail run before `config.browserDir` existed.
- **`nextId` went to `utils/ids.js` in step 4**, not into `db-file.repository.js`, so it moved only once.
- **`normalizeEid` moved to `utils/eid.js` in step 10.** Onboarding switched to it in a separate commit in step 11.
- **`json-store.js` was deleted in step 11**, when moving `getSkillOptions` left it empty, rather than in step 13.
- **Static serving is a function, `registerStaticFiles(app)`.** It registers the three pieces on `app` itself rather than on a router, as "Register the fallback on `app`" asks.
- **Pinned error text constrained where some expressions live.** Where a pinned 500 message contains source text (`req.body`, `req.query.q.toLowerCase`), the controller keeps that exact expression. For `PATCH /api/sprints/:id`, it passes the service a reader that destructures `req.body` after the 404 check. In the two fruits crash paths (bugs M1, M14), the data file is no longer read before the throw. That read had no side effects and its result was discarded.
- **Stack traces changed.** The development error pages (bug M2) now name the new files and lines. The snapshots strip stacks, so this shows only in the raw pages.
- **Bugs found along the way:** M15 and L14 (step 0) and M16 (step 6). See [found-bugs.md](found-bugs.md). None was fixed.
