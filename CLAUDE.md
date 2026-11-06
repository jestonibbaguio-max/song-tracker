# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Internal dashboard for the Accenture Song bench: resources/onboarding, attendance, planner (kanban, sprints, burndown, capacity), sprint retros, myCompetency, mock interviews, project reachouts, trainings, and POC how-to pages. It has an Angular 19 frontend and an Express 5 API that stores its data in JSON files.

Further reading:
- [docs/backend-overview.md](docs/backend-overview.md) covers the full route list, middleware order, and every frontend→API call with its payload.
- [DASHBOARD_POLICIES.md](DASHBOARD_POLICIES.md) has the business rules (CL ranks, proficiency minimums, row colours, planner rules, reachout statuses). Read the relevant section before changing feature behaviour.
- Parts of `README.md` are out of date. Its Architecture section says the app is a single component, and it both recommends and forbids json-server. Where the README and the code disagree, trust the code.

## Commands

```bash
npm install
npm run dev          # API (:3000) + ng serve (:4200) together, via concurrently (Node 22+)
npm run api          # Express API only: node server/server.js
npm start            # Angular dev server only (http://localhost:4200)
npm run build        # production build → dist/atcp-song-dashboard/browser/
                     # then `npm run api` serves the API + built SPA from :3000

npx playwright test                                   # all e2e tests (Chromium only)
npx playwright test tests/poc-howto/poc-howto.spec.ts # one file
npx playwright test -g "test name"                    # one test by title
npx playwright show-report
npm run codegen      # Playwright codegen against :4200
```

- Playwright's `webServer` config starts both `npm start` and `npm run api`, and reuses them if they're already running (except on CI). The specs need the API: the UI only fills in after `/api/onboarding-resources` responds.
- CI (`.github/workflows/playwright.yml`) runs Playwright on pushes and PRs to `main`.
- `npm test` (Karma/Jasmine) is set up, but there are no `*.spec.ts` unit tests under `src/`. No linter is configured.
- `npm run json-api` (json-server on `db.json`) is legacy. It reads a different onboarding dataset and doesn't implement the custom endpoints, so use `npm run api`. Both use port 3000, so don't run them together.

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

- `server.js` registers all routes inline on a single `app`. There are no routers. Middleware runs in this order: `cors()`, `express.json()`, the `/api/*` routes, the `/test` static mount, the static `dist/` mount, then a `GET /.*/` catch-all that returns `index.html`. Because of that catch-all, **a GET to an `/api` path that doesn't exist returns HTML with status 200**, not a 404.
- **Persistence means synchronous whole-file JSON reads and writes on every request.** There's no database or ORM:
  - `server/data/custom-onboarding.json` is the source of truth for onboarding resources, via `server/persistence/roster-file.repository.js`. If it's missing, it's seeded from `custom.csv`. Records mix camelCase and snake_case keys, so read with fallbacks (`r.groupNumber ?? r.group_number`), as the existing code does.
  - `server/data/db.json` holds everything else (sprints, sprint-retros, capacity-entries, attendance, planner-*, deletion-logs, project-reachouts, competency-records) through `loadDb()`/`saveDb()`. Its own `onboarding-resources` and `dashboard` keys are stale and unused.
  - IDs are generated as `max(id)+1` (`nextId()`). Never assign string or GUID IDs.
  - `/api/competency-records` gets group membership from `custom-onboarding.json` and joins it with the `db.json` rows.
- `server/schema.sql` (SQLite) isn't used anywhere, and no SQLite driver is installed.
- `PORT` is the only env var. There's no auth, and CORS is open to all origins.
- `/api/fruits` and `/test/` are a self-contained test bench (`data/test_bwd/`) that the Angular app doesn't use.

## Persistence rules (JSON files)
- Never read or write the real data directory in tests; always use DATA_DIR pointing to a temp copy.
- Keep file paths, file names, JSON formatting (indentation, key order) and ID generation exactly as they are.
- Keep sync vs async file operations as they are; don't change when data is read or written.
- If the code caches file contents in memory, keep that behavior identical.
- Do not start any SQLite work.

## Backend refactor rules
- Behavior must not change: routes, request/response shapes, status codes, error messages.
- Snapshots must never be updated during the refactor.
- No new or upgraded dependencies without asking.
- Run the full test suite after every step; never proceed with failures.
- Log bugs in docs/found-bugs.md; do NOT fix them.
- Keep file moves/renames in separate commits from logic changes.

## Persistence rules (JSON files)
- Tests never touch the real data directory; always use DATA_DIR.
- Keep file paths, names, JSON formatting, and ID generation exactly as they are.
- Keep sync vs async file operations and in-memory caching behavior identical.
- Do not start any SQLite work.

## Gotchas

- **Never write the JSON data files with PowerShell** (`ConvertTo-Json`, `Set-Content`, `Out-File`). They add a UTF-8 BOM, `JSON.parse` fails, `loadDb()` silently returns `{}`, and every endpoint then returns empty data. Use Node (`fs.writeFileSync(p, JSON.stringify(db, null, 2), 'utf8')`) or the Edit tool.
- When the app runs against `npm run api`, every save goes to the real files in `server/data/`, which are committed to git. The same applies to any e2e spec that saves through a real endpoint. Check `git diff server/data` before committing.
- Onboarding dates go over the wire as `MM/DD/YYYY`. Sprint dates use `YYYY-MM-DD`. The server normalises EIDs by lower-casing them and removing everything from `@` onwards.
