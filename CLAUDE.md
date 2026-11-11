# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Internal dashboard for the Accenture Song bench: resources/onboarding, attendance, planner (kanban, sprints, burndown, capacity), sprint retros, myCompetency, mock interviews, project reachouts, trainings, and POC how-to pages. It has an Angular 19 frontend and an Express 5 API that stores its data in JSON files.

Further reading:
- [docs/backend-overview.md](docs/backend-overview.md) covers the full route list, middleware order, and every frontend→API call with its payload.
- [docs/sqlite-migration-plan.md](docs/sqlite-migration-plan.md) is the plan for moving the backend to SQLite. See "SQLite migration" below.
- [DASHBOARD_POLICIES.md](DASHBOARD_POLICIES.md) has the business rules (CL ranks, proficiency minimums, row colours, planner rules, reachout statuses). Read the relevant section before changing feature behaviour.
- Parts of `README.md` are out of date. Its Architecture section says the app is a single component, and it both recommends and forbids json-server. Where the README and the code disagree, trust the code.

## Commands

```bash
npx npm@12 ci        # install with npm 12: npm 10/11 try to compile better-sqlite3 from a lockfile install (no VS tools → fails)
npm run dev          # db:migrate --if-missing, then API (:3000) + ng serve (:4200) together, via concurrently (Node 22+)
npm run api          # db:migrate --if-missing, then the Express API only: node server/server.js
npm start            # Angular dev server only (http://localhost:4200)
npm run build        # production build → dist/atcp-song-dashboard/browser/
                     # then `npm run api` serves the API + built SPA from :3000

npm run db:migrate              # build DATA_DIR/dashboard.sqlite from the JSON seed; refuses if it exists
npm run db:migrate -- --force   # rebuild it from the JSON (discards your local edits); stop the server first
npm run db:export               # write it out as db.json + custom-onboarding.json (backup, or the JSON fallback)

npm run test:api         # API tests (node:test, test/**/*.test.js) on the JSON backend (PERSISTENCE=json, until Phase 8)
npm run test:api:sqlite  # the same with PERSISTENCE=sqlite (builds dashboard.sqlite per test); skips json-only tests
npm run test:api:exported  # the same on JSON, with fixtures exported through SQLite (the fallback); skips json-only tests
npm run test:api:update  # re-record snapshots, on json (only as the snapshot rule allows)
node --test test/api/characterization/sprints.test.js  # one file, on the server's default (sqlite)
PERSISTENCE=json node --test test/api/guardrails/fs-trace.test.js  # one file on json

npx playwright test                                   # all e2e tests (Chromium only)
npx playwright test tests/poc-howto/poc-howto.spec.ts # one file
npx playwright test -g "test name"                    # one test by title
npx playwright show-report
npm run codegen      # Playwright codegen against :4200
```

- Playwright's `webServer` config starts both `npm start` and `npm run api`. The specs need the API: the UI only fills in after `/api/onboarding-resources` responds.
  - `ng serve` is reused if it's already running (except on CI).
  - **The API is never reused.** It runs on its own data, `<os tmp>/song-tracker-e2e-data`: `test/tools/e2e-data.js` copies `server/data`'s JSON seed there before each run, and `npm run api` builds the database. If something is already on :3000 (e.g. your own `npm run api`), Playwright stops with "is already used". Stop it and run the specs again; that keeps e2e writes out of your database.
- `npm run test:api:update` runs on json on purpose: `--test-update-snapshots` rewrites each snapshot file from the tests that ran, so a skipped test's entries would be lost. A file where every test is skipped (e.g. `sqlite-trace` on json) is left alone.
- CI (`.github/workflows/playwright.yml`) runs Playwright on pushes and PRs to `main`.
- The API tests start a fresh app on a temp copy of `test/fixtures/data/` per test (`test/helpers/test-server.js`). Characterization snapshots record the response and a logical diff of the stores ("stored data", from `test/helpers/store-dump.js`), so they hold on every backend. Tests tagged json-only (`test/helpers/backend.js`) pin the JSON files themselves: BOMs, corrupt files, CSV seeding, id repair, raw diffs, fs calls.
- `npm test` (Karma/Jasmine) is set up, but there are no `*.spec.ts` unit tests under `src/`. No linter is configured.
- `npm run json-api` (json-server on `db.json`) is legacy. It reads a different onboarding dataset and doesn't implement the custom endpoints, so use `npm run api`. It writes the committed `db.json`, not the live SQLite data. Both use port 3000, so don't run them together.

## Architecture

### Frontend (`src/app`)

- **No Angular Router.** `AppComponent` is the shell. It holds `activeView` (a string union, saved in `localStorage['active-view']`) and an `@if / @else if` chain in `app.component.html` that renders one standalone view component from `views/*`. To add a page you need to:
  1. extend the `activeView` union and the `validViews` array,
  2. add it to the nav label → view map in `app.component.ts`,
  3. add a branch to the template,
  4. import the component.

  Sidebar nav items come from the `/api/dashboard` response, which is hard-coded in `server/features/dashboard/dashboard.service.js`.
- `AppComponent` uses `ViewEncapsulation.None`, so `app.component.css` is effectively global.
- **`SharedDataService`** (`services/shared-data.service.ts`) holds cross-view state:
  - the cached `onboardingResources` list (the roster most views filter by group),
  - office locations,
  - the global sidebar **group filter** (`attendanceGroup`, saved in localStorage; despite the name, it's used by every view),
  - `apiUrl(path)`.
- **Always build API URLs with `sharedData.apiUrl('/api/...')`.** It prefixes `environment.apiUrl` (`http://localhost:3000`) only when the page runs on port 4200 or 4201. Otherwise it returns the relative path, so the same build works when Express serves it. The environment file is in `src/envinronments/` (the folder name is misspelt) and is imported directly. There are no `fileReplacements`.
- Most views call `HttpClient` directly from the component. Only reachouts has a data service (`views/reachout/reachout-data.service.ts`).
- Several features are **frontend-only mocks** using `of(...).pipe(delay(...))`: bench/group trainings progress, group-training tracks, POC how-to saves (POC how-to content loads from `public/poc-howto/*.html`), and mock-assessment data. The server has no endpoints for these yet.
- Shared interfaces are in `models/types.ts`. Server responses are coerced to numbers on the client (`Number(id)`, `boardId`, `bucketId`) because older `db.json` rows store some IDs as strings. Keep those coercions, because `[ngValue]` selects rely on strict equality.
- The planner UI is Microsoft Planner-style: boards per group → buckets (one per sprint name, auto-created) → tasks. Comments and checklists are embedded in the task object and saved with the whole task. The capacity panel polls attendance and tasks every 2.5 s while it's open.
- TypeScript runs in strict mode with `strictTemplates`.

### Backend (`server/`)

- `server.js` only calls `listen()`, and `app.js` only composes the app. Each feature lives in `server/features/<name>/` as `*.routes.js` → `*.controller.js` → `*.service.js` → `*.repository.js`. Routers use full paths and are mounted without a prefix. For the dashboard features, `*.repository.js` only picks a store for `config.PERSISTENCE` (`server/persistence/select-store.js`). Services call that store through `read(fn)` / `write(fn)`, whose session operations live in `server/persistence/sqlite/<feature>.store.js` (the default) and `server/persistence/json/<feature>.store.js` (the fallback). Onboarding's store has `list/append/update/remove` instead. Services never touch `db` objects or files. Legacy tasks and fruits still use their file repositories directly. Only `server/persistence/**` reads or writes data files. A guardrail test checks that only those files (plus `server/middleware/static.js`, whose `/test` mount serves `test_bwd/` straight from DATA_DIR) `require` `fs`, and another snapshots the exact fs calls each request makes. `server/config/index.js` resolves `DATA_DIR`, `PORT` and every path once, on load. Shared helpers are in `server/utils/`. That includes `fields.js`, which holds each collection's writable fields (services store only those) and column order (services return rows in it). The only cross-feature call is competency → onboarding's repository. Middleware runs in this order: `cors()`, `express.json()`, the feature routers, then `server/middleware/static.js` (the `/test` static mount, the static `dist/` mount, then a `GET /.*/` catch-all that returns `index.html`). Because of that catch-all, **a GET to an `/api` path that doesn't exist returns HTML with status 200**, not a 404.
- **The dashboard data lives in SQLite by default** (since Phase 6): `DATA_DIR/dashboard.sqlite` (`better-sqlite3`, pinned, synchronous), through `server/persistence/sqlite/<feature>.store.js`. There's no ORM.
  - The file is gitignored and local to each developer. `npm run db:migrate` builds it from the committed JSON (`db.json` + `custom-onboarding.json`, now only the seed) with `server/persistence/sqlite/import.js`. `npm run api` and `npm run dev` run `db:migrate --if-missing` first, so a fresh clone builds it on the first start. `npm run db:migrate -- --force` rebuilds it, discarding local edits. It refuses while another process (a running server) has the database open.
  - `npm run db:export [-- --out <dir>]` (`server/persistence/sqlite/export.js`) writes it back out as `db.json` + `custom-onboarding.json`, backing up the files it replaces. That's the backup and the JSON fallback; the runbook is in [docs/running-backend.md](docs/running-backend.md) §6.
  - With no database, every route that uses a store returns 500 "No SQLite database at …".
- **`PERSISTENCE=json` is the fallback until Phase 8**: synchronous whole-file JSON reads and writes on every request, on the files below. `npm run test:api` still runs on it.
  - `server/data/custom-onboarding.json` is the source of truth for onboarding resources, via `server/persistence/json/roster-file.repository.js`. If it's missing, it's seeded from `custom.csv`. Records mix camelCase and snake_case keys, so read with fallbacks (`r.groupNumber ?? r.group_number`), as the existing code does.
  - `server/data/db.json` holds everything else (sprints, sprint-retros, capacity-entries, attendance, planner-*, deletion-logs, project-reachouts, competency-records) through `server/persistence/json/db-file.repository.js` (`loadDb()`/`saveDb()`). Its own `onboarding-resources` and `dashboard` keys are stale and unused.
  - IDs are generated as `max(id)+1` (`nextId()` in `server/utils/ids.js`; the fruits test bench has its own rule in its repository; SQLite's `INTEGER PRIMARY KEY` does the same). Never assign string or GUID IDs.
  - `/api/competency-records` gets group membership from `custom-onboarding.json` and joins it with the `db.json` rows.
- The server reads three env vars, all in `server/config/index.js`: `PORT` (default 3000), `DATA_DIR` (default `server/data`) and `PERSISTENCE` (`sqlite` or `json`, default `sqlite`; any other value throws on load). Express also reads `NODE_ENV`. There's no auth, and CORS is open to all origins.
- `/api/fruits` and `/test/` are a self-contained test bench (`data/test_bwd/`) that the Angular app doesn't use.

## SQLite migration

The backend is being moved from JSON files to SQLite (`better-sqlite3`), following [docs/sqlite-migration-plan.md](docs/sqlite-migration-plan.md). Its "Decisions" table is settled; don't reopen it. Do SQLite work only as a phase of that plan, in the plan's order. Phases 0–6 are done: SQLite is the default, and JSON is the fallback until Phase 8 removes it.

## Persistence rules
- Never read or write the real data directory in tests; always use DATA_DIR pointing to a temp copy.
- Only `server/persistence/**` may require `fs` or `better-sqlite3` (`server/middleware/static.js` is the one documented exception).
- Keep the JSON backend's file paths, file names, JSON formatting (indentation, key order, trailing newlines) and ID generation exactly as they are. The SQLite export must write the same format.
- Keep everything synchronous, and don't change when data is read or written, unless a plan phase says so (fs-trace pins it).
- No in-memory caches of stored data, on either backend.
- Legacy `/api/tasks` (`tasks.json`) and the fruits test bench (`test_bwd/db.json`) stay on JSON; they're out of the migration's scope.

## Backend change rules
- Behavior must not change: routes, request/response shapes, status codes, error messages. The only exceptions are the storage-related bug fixes listed in the plan's Phase 3.
- Existing snapshot entries may change only as reviewed changes in the plan's Phase 2 (the storage-section format change, verified by script), Phase 3 (one listed bug per commit) and Phase 8 (deleting the json-only tests' snapshots, and `sqlite-trace` changes from the Phase 8 clean-ups). New entries for new test cases may be added in any phase, recorded against the code before the change they guard, with a snapshot diff that only adds entries. Every other change must pass with no snapshot update. See "The snapshot rule" in the plan.
- No new or upgraded dependencies without asking.
- Run the full test suite after every step; never proceed with failures.
- Log bugs in docs/found-bugs.md; don't fix them unless the plan's Phase 3 lists them.
- Keep file moves/renames in separate commits from logic changes.

## Gotchas

- **Never write the JSON data files with PowerShell** (`ConvertTo-Json`, `Set-Content`, `Out-File`). They add a UTF-8 BOM, `JSON.parse` fails, and every `db.json` route then returns a 500 ("db.json is not valid JSON") until the file is fixed; `db:migrate` refuses them too. (Before Phase 3's H2 fix it silently loaded as `{}`, and the next write wiped every other collection.) Use Node (`fs.writeFileSync(p, JSON.stringify(db, null, 2), 'utf8')`) or the Edit tool.
- **UI edits stay local.** On the default SQLite backend, every save goes to your own `server/data/dashboard.sqlite` (gitignored), never to the committed JSON. The committed `db.json` and `custom-onboarding.json` are only the seed that `db:migrate` builds from; changing the shared data means editing them and committing, and each developer then runs `npm run db:migrate -- --force`.
- **`git diff server/data` still matters on the JSON side.** `PERSISTENCE=json` (the fallback), `npm run db:export` (whose backups `*.bak-*` are gitignored) and `npm run json-api` (json-server) all write the committed JSON files, not your live database. After a fallback, the diff is large; don't commit it by accident.
- **E2E runs never touch your data**: the Playwright API runs on a fresh copy of the seed in `<os tmp>/song-tracker-e2e-data`, and stops with "is already used" if your own API is on :3000.
- Onboarding dates go over the wire as `MM/DD/YYYY`. Sprint dates use `YYYY-MM-DD`. The server normalises EIDs by lower-casing them and removing everything from `@` onwards.
