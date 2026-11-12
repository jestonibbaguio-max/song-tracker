# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Internal dashboard for the Accenture Song bench: resources/onboarding, attendance, planner (kanban, sprints, burndown, capacity), sprint retros, myCompetency, mock interviews, project reachouts, trainings, and POC how-to pages. It has an Angular 19 frontend and an Express 5 API that stores its data in SQLite, built from a JSON seed committed to the repo.

Further reading:
- [docs/backend-overview.md](docs/backend-overview.md) covers the full route list, middleware order, and every frontend→API call with its payload.
- [docs/sqlite-migration-plan.md](docs/sqlite-migration-plan.md) is the plan that moved the backend from JSON files to SQLite; it's done. See "SQLite migration" below.
- [DASHBOARD_POLICIES.md](DASHBOARD_POLICIES.md) has the business rules (CL ranks, proficiency minimums, row colours, planner rules, reachout statuses). Read the relevant section before changing feature behaviour.
- Parts of `README.md` are out of date. Its Architecture section says the app is a single component. Where the README and the code disagree, trust the code.

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

npm run test:api         # API tests (node:test, test/**/*.test.js); each test builds dashboard.sqlite in a temp copy of the fixtures
npm run test:api:update  # re-record snapshots (only as the snapshot rule allows)
node --test test/api/characterization/sprints.test.js  # one file

npx playwright test                                   # all e2e tests (Chromium only)
npx playwright test tests/poc-howto/poc-howto.spec.ts # one file
npx playwright test -g "test name"                    # one test by title
npx playwright show-report
npm run codegen      # Playwright codegen against :4200
```

- Playwright's `webServer` config starts both `npm start` and `npm run api`. The specs need the API: the UI only fills in after `/api/onboarding-resources` responds.
  - `ng serve` is reused if it's already running (except on CI).
  - **The API is never reused.** It runs on its own data, `<os tmp>/song-tracker-e2e-data`: `test/tools/e2e-data.js` copies `server/data`'s JSON seed there before each run, and `npm run api` builds the database. If something is already on :3000 (e.g. your own `npm run api`), Playwright stops with "is already used". Stop it and run the specs again; that keeps e2e writes out of your database.
- `--test-update-snapshots` rewrites each snapshot file from the tests that ran, so a skipped test's snapshot entries would be lost. Every test with snapshots runs today (the 4 skips are `notApplicable` placeholders and the built-`dist/` check); keep it that way.
- CI (`.github/workflows/playwright.yml`) runs Playwright on pushes and PRs to `main`.
- The API tests start a fresh app on a temp copy of `test/fixtures/data/` per test (`test/helpers/test-server.js`), which builds `dashboard.sqlite` from the copy's JSON after the test's `setup` has edited it. Characterization snapshots record the response, a logical diff of the stores ("stored data", from `test/helpers/store-dump.js`) and raw diffs of the files that stay on JSON. `test/api/guardrails/sqlite-trace.test.js` snapshots the SQL each request runs.
- `npm test` (Karma/Jasmine) is set up, but there are no `*.spec.ts` unit tests under `src/`. No linter is configured.

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

- `server.js` only calls `listen()`, and `app.js` only composes the app. Each feature lives in `server/features/<name>/` as `*.routes.js` → `*.controller.js` → `*.service.js` → `*.repository.js`. Routers use full paths and are mounted without a prefix. For the dashboard features, `*.repository.js` exports the feature's store, `server/persistence/sqlite/<feature>.store.js`. Services call it through `read(fn)` / `write(fn)` (a read session, or one transaction), whose session operations live in the store; onboarding's store has `list/findById/findByEid/append/update/remove` instead. Services never see SQL or files. Legacy tasks and fruits use their file repositories directly. Only `server/persistence/**` reads or writes data. The `fs-boundary` guardrail lists the only files that may `require` `fs` (the tasks and fruits repositories, `sqlite/import.js`, `sqlite/migrations.js`, plus `server/middleware/static.js`, whose `/test` mount serves `test_bwd/` straight from DATA_DIR) or `better-sqlite3` (`sqlite/connection.js`, `sqlite/import.js`). `server/config/index.js` resolves `DATA_DIR`, `PORT` and every path once, on load. Shared helpers are in `server/utils/`. That includes `fields.js`, which holds each collection's writable fields (services store only those) and column order (services return rows in it). Features don't call each other; the one place data crosses features is the competency store's SQL JOIN on the roster table. Middleware runs in this order: `cors()`, `express.json()`, the feature routers, then `server/middleware/static.js` (the `/test` static mount, the static `dist/` mount, then a `GET /.*/` catch-all that returns `index.html`). Because of that catch-all, **a GET to an `/api` path that doesn't exist returns HTML with status 200**, not a 404.
- **The dashboard data lives in SQLite**: `DATA_DIR/dashboard.sqlite` (`better-sqlite3`, pinned, synchronous), through `server/persistence/sqlite/<feature>.store.js`. There's no ORM. The schema is `server/persistence/sqlite/schema.sql`; `tables.js` maps API fields to columns. List filters are `WHERE` clauses that reproduce the old JS comparisons exactly (e.g. attendance's `js_number()`, a JS function registered in `connection.js`).
  - The file is gitignored and local to each developer. `npm run db:migrate` builds it from the committed JSON seed (`db.json` + `custom-onboarding.json`) with `server/persistence/sqlite/import.js`. `npm run api` and `npm run dev` run `db:migrate --if-missing` first, so a fresh clone builds it on the first start. `npm run db:migrate -- --force` rebuilds it, discarding local edits. It refuses while another process (a running server) has the database open.
  - With no database, every route that uses a store returns 500 "No SQLite database at …".
  - To back it up, stop the server and copy `dashboard.sqlite` together with its `-wal` file, if there is one ([docs/running-backend.md](docs/running-backend.md) §5).
- **The committed JSON is only the seed.** Nothing reads `db.json` or `custom-onboarding.json` at runtime; only the import does. The seed mixes key styles (roster records in camelCase, snake_case or both) and id types (`"1"` and `1`); the import merges the key styles camelCase-first, as the API reads them, makes every id a number, and skips db.json's dead `onboarding-resources`, `dashboard` and `$schema` keys.
  - IDs are `max(id)+1`, from SQLite's `INTEGER PRIMARY KEY` (the fruits test bench has its own rule in its repository). Never assign string or GUID IDs.
- The server reads two env vars, both in `server/config/index.js`: `PORT` (default 3000) and `DATA_DIR` (default `server/data`). `PERSISTENCE` was removed with the JSON backend in Phase 8; a leftover value is ignored. Express also reads `NODE_ENV`. There's no auth, and CORS is open to all origins.
- `/api/fruits` and `/test/` are a self-contained test bench (`data/test_bwd/`) that the Angular app doesn't use.

## SQLite migration

The backend moved from JSON files to SQLite (`better-sqlite3`) following [docs/sqlite-migration-plan.md](docs/sqlite-migration-plan.md). All its phases are done: Phase 8 removed the JSON backend, the `PERSISTENCE` setting and the export. Its "Decisions" table is settled; don't reopen it. Its "Deviations" section records what was built differently from the plan, and why.

## Persistence rules
- Never read or write the real data directory in tests; always use DATA_DIR pointing to a temp copy.
- Only the files the `fs-boundary` guardrail lists may require `fs` or `better-sqlite3`. Adding one is a design decision; ask first.
- Keep the files that stay on JSON (`tasks.json`, `test_bwd/db.json`) exactly as they are: paths, formatting (indentation, key order, trailing newlines) and ID rules. Keep the seed's format when you edit it: 2-space indentation, no trailing newline in `db.json`, one in `custom-onboarding.json`.
- Keep everything synchronous, and don't change which statements a request runs without a reviewed `sqlite-trace` update.
- No in-memory caches of stored data.
- Legacy `/api/tasks` (`tasks.json`) and the fruits test bench (`test_bwd/db.json`) stay on JSON (decision 10 of the plan).

## Backend change rules
- Behavior must not change: routes, request/response shapes, status codes, error messages. The only exceptions are the storage-related bug fixes listed in the plan's Phase 3.
- Existing snapshot entries changed only as reviewed changes in the plan's Phase 2 (the storage-section format change, verified by script), Phase 3 (one listed bug per commit) and Phase 8 (deleting the json-only tests' snapshots, and `sqlite-trace` changes from the Phase 8 clean-ups). New entries for new test cases may be added, recorded against the code before the change they guard, with a snapshot diff that only adds entries. Every other change must pass with no snapshot update. See "The snapshot rule" in the plan. `node test/tools/compare-snapshots.js --quiet` lists entries added, removed or changed against `HEAD`, ignoring key order.
- No new or upgraded dependencies without asking.
- Run the full test suite after every step; never proceed with failures.
- Log bugs in docs/found-bugs.md; don't fix them unless the plan's Phase 3 lists them.
- Keep file moves/renames in separate commits from logic changes.

## Gotchas

- **Never write the JSON data files with PowerShell** (`ConvertTo-Json`, `Set-Content`, `Out-File`). They add a UTF-8 BOM and `JSON.parse` fails: `db:migrate` then refuses the seed ("… is not valid JSON") and changes nothing until the file is fixed, and a BOM in `tasks.json` makes `GET /api/tasks` replace it with the seed task (bug H3). Use Node (`fs.writeFileSync(p, JSON.stringify(db, null, 2), 'utf8')`) or the Edit tool.
- **UI edits stay local.** Every save goes to your own `server/data/dashboard.sqlite` (gitignored), never to the committed JSON. The committed `db.json` and `custom-onboarding.json` are only the seed that `db:migrate` builds from; changing the shared data means editing them and committing, and each developer then runs `npm run db:migrate -- --force`.
- **The app never writes the seed**, so a diff in `server/data/db.json` or `custom-onboarding.json` is a hand edit. The fruits test bench is different: `/api/fruits` writes the committed `server/data/test_bwd/db.json`. Backups that `npm run db:export` made before Phase 8 (`*.bak-*`) stay gitignored.
- **E2E runs never touch your data**: the Playwright API runs on a fresh copy of the seed in `<os tmp>/song-tracker-e2e-data`, and stops with "is already used" if your own API is on :3000.
- Onboarding dates go over the wire as `MM/DD/YYYY`. Sprint dates use `YYYY-MM-DD`. The server normalises EIDs by lower-casing them and removing everything from `@` onwards.
