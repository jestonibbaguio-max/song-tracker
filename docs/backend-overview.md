# Backend Overview

This is a snapshot of `server/` and of how the Angular app talks to it, taken from the `feature/backend-refactor` branch on 2026-11-06 and updated after the restructure in [server-restructure-plan.md](server-restructure-plan.md) (steps 0–13). Everything here comes from reading the code. Where the code and the README disagree, the code wins.

---

## 1. At a glance

| Area | What's actually there |
|---|---|
| Framework | **Express 5** (`express@^5.2.1`), plain CommonJS JavaScript, no TypeScript, no build step |
| Entry point | [server/server.js](../server/server.js), started by `npm run api` (`db:migrate --if-missing`, then `node server/server.js`) or `npm run dev` (the same, then API + `ng serve` via `concurrently`) |
| Dependencies | `express`, `cors` and `better-sqlite3` (pinned at `13.0.3`; used only under [server/persistence/sqlite/](../server/persistence/sqlite/)). The server has no `package.json` of its own; all three come from the root one |
| Route organisation | One Express router per feature in [server/features/](../server/features/) (routes → controller → service → repository), mounted in [server/app.js](../server/app.js), which only composes the app. Each dashboard feature's repository exports its SQLite store, and services use it through `read(fn)`/`write(fn)` ([sqlite-store.js](../server/persistence/sqlite/sqlite-store.js)) |
| Persistence | Only from [server/persistence/](../server/persistence/): one store per feature in `persistence/sqlite/`. Legacy tasks and fruits stay on their own JSON file repositories. No ORM |
| Database | **SQLite** (`DATA_DIR/dashboard.sqlite`, gitignored), built from the committed JSON seed by `npm run db:migrate`; see §5 and [sqlite-migration-plan.md](sqlite-migration-plan.md) |
| Auth | None. Every endpoint is public |
| External services | None: no email, payments, object storage, queues, or third-party APIs |
| Background jobs | None on the server. The only periodic work is a client-side 2.5 s poll in the Planner capacity view |
| Config | Two env vars: `PORT` (default `3000`) and `DATA_DIR` (default `server/data`) |

---

## 2. Entry point and boot sequence

[server/server.js](../server/server.js) requires [server/app.js](../server/app.js), reads `PORT` from [server/config/index.js](../server/config/index.js) and calls `app.listen(port)`, logging `API running on http://127.0.0.1:<port>`. Loading `app.js`:

1. Loads [config](../server/config/index.js), which resolves `DATA_DIR` (default `server/data`), `PORT` and every file path once. No module reads or writes files when it loads.
2. Creates the single `app`. Express reads `NODE_ENV` at this point.
3. Registers middleware, the feature routers and static serving in a fixed order (see §3).

The API tests require `app.js` and start their own server, so `listen()` lives only in `server.js`. The README quotes a different startup message ("Server listening on port 3000"), which is wrong.

There's no graceful shutdown and no startup check that the data files exist. Missing files get created lazily the first time something reads them (see §5).

---

## 3. Middleware order

Express runs these in registration order:

| # | Middleware | Where | Notes |
|---|---|---|---|
| 1 | `cors()` | [app.js](../server/app.js) | Default config: `Access-Control-Allow-Origin: *`, so any origin can call the API |
| 2 | `express.json()` | [app.js](../server/app.js) | Default 100 kb body limit. A malformed JSON body gets Express's default 400 HTML response |
| 3 | The feature routers | [app.js](../server/app.js), [features/](../server/features/) | Full paths, no prefix, mounted in a fixed order. No two routers share a path |
| 4 | `express.static('/test' → server/data/test_bwd)` | [middleware/static.js](../server/middleware/static.js) | Serves the "Fruits" test-bench page `test_bwd/index.html` |
| 5 | `express.static(dist/atcp-song-dashboard/browser)` | [middleware/static.js](../server/middleware/static.js) | Serves the built Angular app, but only if `ng build` has been run |
| 6 | `app.get(/.*/)` SPA fallback | [middleware/static.js](../server/middleware/static.js) | Any GET that nothing above matched gets `index.html` (regex form because Express 5 dropped `*`) |

There's **no error-handling middleware** and no request logging, rate limiting, compression, or security headers. Express 5's built-in handler turns sync throws (for example, a missing database, or a body that can't be stored, bug L18) into a generic 500.

> ⚠️ Because of #6, a GET to an `/api/...` path that doesn't exist returns **200 with the Angular `index.html`** instead of a 404. Any frontend code that calls an endpoint that hasn't been built yet (e.g. `/api/trainings-progress/:eid`) will get HTML back and fail to parse it, rather than fail clearly.

---

## 4. Routes registered on the server

All routes take and return JSON. "Store" is the file the route reads and writes (see §5).

### Health, dashboard, legacy tasks

| Method | Path | Store | Behaviour |
|---|---|---|---|
| GET | `/api/health` | – | `{ ok: true }` |
| GET | `/api/dashboard` | hard-coded | Returns a static object built in `getDashboardPayload()` ([dashboard.service.js](../server/features/dashboard/dashboard.service.js)). The `dashboard` key in `db.json` is **not** read |
| GET | `/api/tasks` | `data/tasks.json` | Creates the file with one seed task if it's missing |
| POST | `/api/tasks` | `data/tasks.json` | `{ title, status? }` → 201. `title` is required |
| PATCH | `/api/tasks/:id` | `data/tasks.json` | `{ title?, status? }`. 400 if either is an empty string, 404 if the id doesn't exist |
| DELETE | `/api/tasks/:id` | `data/tasks.json` | `{ deleted: boolean }` (always 200) |
| GET | `/api/skill-options` | roster (`onboarding_resources`) | Sorted, de-duplicated list of skills from every roster record |

### Onboarding resources — `persistence/sqlite/onboarding.store.js`

| Method | Path | Behaviour |
|---|---|---|
| GET | `/api/onboarding-resources` | Every record, newest `created_at` first, normalised to camelCase by `formatOnboardingResource` |
| POST | `/api/onboarding-resources` | Normalises and validates the body (`name`, `eid`, `hireDate`, `rollInDate` required; dates `MM/DD/YYYY`; group 1–6). **Upserts by `eid`**: an existing eid returns 200, a new one returns 201 |
| PATCH | `/api/onboarding-resources/:id` | Same validation, but dates are optional. 404 for an unknown id, 409 if the eid belongs to a *different* record. **If the eid changes, a new record is appended and the old one is left in place** |
| DELETE | `/api/onboarding-resources/:id` | Removes the record, returns `{ deleted: id }`, or 404 |

The server normalises incoming bodies heavily (`normalizeOnboardingPayload` in [onboarding.service.js](../server/features/onboarding/onboarding.service.js)). It accepts camelCase or snake_case keys, strips everything from `@` onwards in the eid and lower-cases it, converts `YYYY-MM-DD` dates to `MM/DD/YYYY`, and when `projectDeployed` is `No` it forces `projectName = "Song Bench"` and defaults `poc` to `hannahdel.l.orellosa`.

### The other dashboard collections (seeded from `data/db.json`)

Each of these routes reads or writes its own table in `dashboard.sqlite`, a write in one transaction. List filters (`?sprintId`, `?boardId`, `?year`…) are SQL `WHERE` clauses. IDs come from `max(id) + 1` (`INTEGER PRIMARY KEY`).

| Collection | Routes | Validation |
|---|---|---|
| `sprints` | GET, POST, PATCH `/:id`, DELETE `/:id` on `/api/sprints` | POST needs `name`, `start`, `end` |
| `sprint-retros` | GET (`?sprintId`, `?groupNumber`), POST, PATCH `/:id`, DELETE `/:id` | POST: the sprint must exist, `groupNumber ≥ 1`, `category ∈ {improve, didnt-go-well, went-well}`, `text` 1–500 chars. PATCH only updates `text` |
| `capacity-entries` | GET (`?sprintName`), POST | POST needs `sprintName` and `eid`, and **upserts** on `(sprintName, eid)` |
| `attendance-options` | GET | – |
| `attendance` | GET (`?year`, `?month`), POST, PATCH `/:id`, DELETE `/:id` | **None.** POST stores the body as-is, and PATCH shallow-merges it into the existing record |
| `office-locations` | GET | – |
| `planner-labels` | GET | – |
| `planner-boards` | GET (`?groupNumber`) | – |
| `planner-buckets` | GET (`?boardId`), POST | POST needs `boardId` and `name` |
| `planner-tasks` | GET (`?boardId`), POST, PATCH `/:id`, DELETE `/:id` | **None.** The body is spread into the record and the server sets `createdAt`/`updatedAt` |
| `deletion-logs` | GET (`?eid`), POST | **None.** The server adds `deletedAt` |
| `project-reachouts` | GET (`?group`), POST, PATCH `/:id`, DELETE `/:id` | Requires `eid`, `projectName`, `techRole`, `pocEid`. EIDs are normalised, `status` defaults to `CV Requested`, `groupNumber` must be 1–6 or it becomes null |
| `competency-records` | GET (`?group`, default `5`), PATCH `/:eid` | GET joins the group's roster members with any saved competency rows, in one SQL `LEFT JOIN`. PATCH upserts by eid and merges the body's competency fields without validation (`eid`, `name`, `clLevel` and unknown fields are ignored) |

### Test bench (not used by the Angular app)

`/api/fruits` supports GET (`?category`, `?q`), GET `/:id`, POST, PATCH `/:id`, and DELETE `/:id`, all against `data/test_bwd/db.json`. The static page that uses them is served at `/test/`.

---

## 5. Data and persistence layer

The dashboard data lives in **SQLite**: `DATA_DIR/dashboard.sqlite` (`server/data/dashboard.sqlite`), gitignored, one per developer. It's used through `better-sqlite3`, synchronously, by `persistence/sqlite/<feature>.store.js`, and opened on the first query (`persistence/sqlite/connection.js`); with no file, every route that uses a store returns 500 "No SQLite database at …". There's no ORM. The JSON backend it replaced, and the `PERSISTENCE` setting that picked between them, were removed in Phase 8 of [sqlite-migration-plan.md](sqlite-migration-plan.md).

The database's lifecycle:

- **Build:** `npm run db:migrate` builds it from `DATA_DIR`'s `db.json` and `custom-onboarding.json` (the committed seed) with `persistence/sqlite/import.js`, and prints the rows per table. It refuses to overwrite an existing database. `npm run api` and `npm run dev` run `db:migrate --if-missing` first, so a fresh clone builds it on the first start.
- **Reset:** `npm run db:migrate -- --force` rebuilds it from the JSON, discarding every change made in the app. It builds the new database first, and refuses while another process (a running server) has the old one open.
- **Back up:** stop the server and copy `dashboard.sqlite` with its `-wal` file, if any ([running-backend.md](running-backend.md) §5).

The data files:

| File | Owner | Contents |
|---|---|---|
| `server/data/dashboard.sqlite` | `persistence/sqlite/` (`connection.js`, one store per feature) | Every dashboard collection listed in §4, and the roster. Schema: [schema.sql](../server/persistence/sqlite/schema.sql) |
| `server/data/custom-onboarding.json` | `persistence/sqlite/import.js` (seed only) | The roster seed (98 records) |
| `server/data/db.json` | `persistence/sqlite/import.js` (seed only) | The seed for every other collection |
| `server/data/tasks.json` | `persistence/tasks-file.repository.js` | Legacy tasks. It doesn't exist yet and is created on the first GET `/api/tasks` |
| `server/data/test_bwd/db.json` | `persistence/fruits-file.repository.js` (also served as-is by the `/test` static mount) | Fruits test data |
| `attendance.json`, `attendance-options.json`, `routes.json`, `custom.xlsx`, `groupings name` | – | Not read by the Express server. `routes.json` looks like a json-server rewrite map, left over from before the Express API |

Things to know about this layer:

- **The seed has dead data.** `db.json` has its own `onboarding-resources` collection (81 records), plus `dashboard` and `$schema` keys; the import skips them. The roster comes from `custom-onboarding.json` (98 records). The import also drops the 36 attendance rows with random json-server ids (decision 6 of the plan).
- **Mixed key styles in the seed.** Records in `custom-onboarding.json` are a mix of camelCase (created through the API) and snake_case (from an old CSV seed). The import merges them camelCase-first, the way the API reads them; the database has one column per field.
- **Concurrency.** A single Node process is safe in practice because the I/O is synchronous and requests can't interleave. Each write is one transaction (`BEGIN IMMEDIATE`) with a 5 s busy timeout, so a second process on the same database waits rather than losing writes.
- **The committed JSON is the seed.** UI edits go to the local database only, so the files in git change only when someone edits the seed on purpose.
- **The SQLite schema** is [server/persistence/sqlite/schema.sql](../server/persistence/sqlite/schema.sql). The old, never-used `server/schema.sql` was deleted at the start of the migration.

---

## 6. Config and environment variables

| Name | Where | Default | Purpose |
|---|---|---|---|
| `PORT` | [config/index.js](../server/config/index.js) | `3000` | API listen port |
| `DATA_DIR` | [config/index.js](../server/config/index.js) | `server/data` | Folder that holds the data files; the API tests point it at a temp copy |
| `CI` | [playwright.config.ts](../playwright.config.ts) | – | Turns off `reuseExistingServer` for Playwright's webServers |

The server has no `.env` loading and no secrets. [server/config/index.js](../server/config/index.js) resolves `PORT`, `DATA_DIR` (default `server/data`; a relative value resolves against the working directory) and every data-file path once, when it loads.

Frontend side: [src/envinronments/environment.development.ts](../src/envinronments/environment.development.ts) (note the misspelt folder name) defines `apiUrl: 'http://localhost:3000'`. `SharedDataService.apiUrl()` ([shared-data.service.ts:22-26](../src/app/services/shared-data.service.ts#L22-L26)) uses that absolute URL only when the page is served from port 4200 or 4201 (`ng serve`). On any other port it uses relative `/api/...` paths, which is what you want when Express serves the built app from `dist/`. There's no `proxy.conf.json`, and `angular.json` has no `fileReplacements`, so the "development" environment file is the only one.

---

## 7. Endpoints the frontend actually calls

These are all the `HttpClient` calls in `src/`. `apiUrl(...)` means the path goes through `SharedDataService.apiUrl()`. `DashboardComponent` has its own identical private copy of that method.

### Onboarding / shared data

| Method | Path | Caller | Request payload | Response used |
|---|---|---|---|---|
| GET | `/api/onboarding-resources` | [shared-data.service.ts:29](../src/app/services/shared-data.service.ts#L29), via `loadOnboardingResources()` from app, onboarding, bench/group trainings, mock assessment | – | `OnboardingResource[]` |
| POST | `/api/onboarding-resources` | [onboarding.component.ts:124](../src/app/views/onboarding/onboarding.component.ts#L124) | `OnboardingForm`: `{ name, eid, hireDate, rollInDate, projectDeployed: 'Yes'\|'No', deploymentDate, projectName, poc, dn: 'Yes'\|'No', rollOffDate, fromProject, clLevel, groupNumber: string, primarySkill, primaryYears, secondarySkill, secondaryYears, anotherSkills: string[], officeLocation }` with dates as `MM/DD/YYYY` | `OnboardingResource` |
| PATCH | `/api/onboarding-resources/:id` | [onboarding.component.ts:123](../src/app/views/onboarding/onboarding.component.ts#L123) | Same `OnboardingForm` (full object, not a partial) | `OnboardingResource`. The client checks whether the returned `id` changed, because an eid change creates a new record |
| DELETE | `/api/onboarding-resources/:id` | [onboarding.component.ts:334](../src/app/views/onboarding/onboarding.component.ts#L334) | – | ignored |
| GET | `/api/office-locations` | [shared-data.service.ts:36](../src/app/services/shared-data.service.ts#L36) | – | `{ id, name }[]` |

### Dashboard

| Method | Path | Caller | Payload | Response used |
|---|---|---|---|---|
| GET | `/api/dashboard` | [app.component.ts:236](../src/app/app.component.ts#L236) (nav groups) **and** [dashboard.component.ts:42](../src/app/views/dashboard/dashboard.component.ts#L42) (page content) | – | `DashboardData` |

The same payload is fetched twice on load, once by each component.

### Attendance

| Method | Path | Caller | Payload | Response used |
|---|---|---|---|---|
| GET | `/api/attendance-options` | [attendance.component.ts:33](../src/app/views/attendance/attendance.component.ts#L33) | – | `{ id, label }[]` |
| GET | `/api/attendance` | [attendance.component.ts:47](../src/app/views/attendance/attendance.component.ts#L47) | – (no query; it fetches **every** record and filters by year/month in the browser) | `AttendanceEntry[]` |
| GET | `/api/attendance?year=Y&month=M` | [planner.component.ts:704](../src/app/views/planner/planner.component.ts#L704), [:978](../src/app/views/planner/planner.component.ts#L978) | – | `AttendanceEntry[]` |
| POST | `/api/attendance` | [attendance.component.ts:223](../src/app/views/attendance/attendance.component.ts#L223) | `{ eid, year, month, day, status, location? }` (`location` only when `status === 'RTO'`) | `AttendanceEntry` |
| PATCH | `/api/attendance/:id` | [attendance.component.ts:218](../src/app/views/attendance/attendance.component.ts#L218) | `{ status, location? }` | `AttendanceEntry` |
| DELETE | `/api/attendance/:id` | [attendance.component.ts:207](../src/app/views/attendance/attendance.component.ts#L207) | – (sent when a cell is cleared) | ignored |

### Planner (boards, buckets, tasks, sprints, capacity)

| Method | Path | Caller | Payload | Response used |
|---|---|---|---|---|
| GET | `/api/planner-labels` | [planner.component.ts:138](../src/app/views/planner/planner.component.ts#L138) | – | `PlannerLabel[]` |
| GET | `/api/planner-boards` | [planner.component.ts:153](../src/app/views/planner/planner.component.ts#L153) | – (no `groupNumber` filter; filtered in the browser) | `PlannerBoard[]` |
| GET | `/api/planner-buckets?boardId=N` | [planner.component.ts:247](../src/app/views/planner/planner.component.ts#L247) | – | `PlannerBucket[]` |
| POST | `/api/planner-buckets` | [planner.component.ts:287](../src/app/views/planner/planner.component.ts#L287) | `{ boardId, name, order }` (sent automatically when a sprint has no bucket yet) | `PlannerBucket` |
| GET | `/api/planner-tasks?boardId=N` | [planner.component.ts:257](../src/app/views/planner/planner.component.ts#L257), [:971](../src/app/views/planner/planner.component.ts#L971) (polling) | – | `PlannerTask[]` |
| POST | `/api/planner-tasks` | [planner.component.ts:445](../src/app/views/planner/planner.component.ts#L445) | Full `PlannerTask`: `{ boardId, bucketId, title, status, priority, startDate, dueDate, labels: number[], assignee, checklist: {id,text,done}[], description, acceptanceCriteria, comments: {id,author,text,createdAt}[], completed, createdAt, updatedAt }` | `PlannerTask` |
| PATCH | `/api/planner-tasks/:id` | [planner.component.ts:450](../src/app/views/planner/planner.component.ts#L450) (modal save) | Full `PlannerTask` including `id`. Comments and checklist are embedded and saved with the task | `PlannerTask` |
| PATCH | `/api/planner-tasks/:id` | [planner.component.ts:325](../src/app/views/planner/planner.component.ts#L325) (kanban drag) | `{ status, completed }`, one of `Not started/false`, `In progress/false`, `Review/false`, `Completed/true` | `PlannerTask` (rolled back on error) |
| PATCH | `/api/planner-tasks/:id` | [planner.component.ts:463](../src/app/views/planner/planner.component.ts#L463) (complete toggle) | Full task with `completed` flipped and `status` set to `Completed` / `Not started` | `PlannerTask` |
| DELETE | `/api/planner-tasks/:id` | [planner.component.ts:492](../src/app/views/planner/planner.component.ts#L492) | – | ignored |
| POST | `/api/deletion-logs` | [planner.component.ts:490](../src/app/views/planner/planner.component.ts#L490) (task), [:552](../src/app/views/planner/planner.component.ts#L552) (comment) | `DeletionLog`: `{ type: 'task-deletion'\|'comment-deletion', taskId, taskTitle, deletedBy, deletedByEid, commentAuthor?, commentText?, commentCreatedAt? }` | ignored (fire-and-forget, sent before the delete and regardless of whether it succeeds) |
| GET | `/api/sprints` | [planner.component.ts:143](../src/app/views/planner/planner.component.ts#L143), [sprint-retros.component.ts:210](../src/app/views/sprint-retros/sprint-retros.component.ts#L210) | – | `{ id, name, start, end }[]` |
| POST | `/api/sprints` | [planner.component.ts:200](../src/app/views/planner/planner.component.ts#L200) | `{ name, start, end }` (`YYYY-MM-DD`) | sprint |
| PATCH | `/api/sprints/:id` | [planner.component.ts:187](../src/app/views/planner/planner.component.ts#L187) | `{ name, start, end }` | sprint |
| GET | `/api/capacity-entries?sprintName=S` | [planner.component.ts:719](../src/app/views/planner/planner.component.ts#L719) | – | `{ id, sprintName, eid, cadence, admin, holiday }[]` |
| POST | `/api/capacity-entries` | [planner.component.ts:737](../src/app/views/planner/planner.component.ts#L737) | `{ sprintName, eid, cadence, admin, holiday, id? }` (upsert) | ignored |

### Sprint retrospectives

| Method | Path | Caller | Payload | Response used |
|---|---|---|---|---|
| GET | `/api/sprint-retros` | [sprint-retros.component.ts:211](../src/app/views/sprint-retros/sprint-retros.component.ts#L211) | – (fetches all, filters by sprint in the browser on first load) | `SprintRetroItem[]` |
| GET | `/api/sprint-retros?sprintId=N` | [sprint-retros.component.ts:234](../src/app/views/sprint-retros/sprint-retros.component.ts#L234) | – | `SprintRetroItem[]`. Note it doesn't pass `groupNumber` even though the server supports it |
| POST | `/api/sprint-retros` | [sprint-retros.component.ts:136](../src/app/views/sprint-retros/sprint-retros.component.ts#L136) | `{ sprintId, groupNumber, category, text }` | `SprintRetroItem` |
| PATCH | `/api/sprint-retros/:id` | [sprint-retros.component.ts:188](../src/app/views/sprint-retros/sprint-retros.component.ts#L188) | `{ text }` | `SprintRetroItem` |
| DELETE | `/api/sprint-retros/:id` | [sprint-retros.component.ts:159](../src/app/views/sprint-retros/sprint-retros.component.ts#L159) | – | ignored |

### myCompetency

| Method | Path | Caller | Payload | Response used |
|---|---|---|---|---|
| GET | `/api/competency-records?group=N` | [mycompetency.component.ts:25](../src/app/views/mycompetency/mycompetency.component.ts#L25) | – | `CompetencyRecord[]` (includes `name` and `clLevel` joined from onboarding) |
| PATCH | `/api/competency-records/:eid` | [mycompetency.component.ts:31](../src/app/views/mycompetency/mycompetency.component.ts#L31) | `{ [field]: value }`, a single field at a time (e.g. `{ primaryProficiency: "P2" }`) | `CompetencyRecord`. ⚠️ The server's response has **no** `name`/`clLevel`, and the component swaps it straight into the row. `meetsMinReq()` uses `clLevel`, so after any edit a CL 11/12 row is checked against the stricter P3 rule instead of P2, and its green/yellow highlight can be wrong until the next reload |

### Project reachouts — [reachout-data.service.ts](../src/app/views/reachout/reachout-data.service.ts)

| Method | Path | Caller | Payload | Response used |
|---|---|---|---|---|
| GET | `/api/project-reachouts` | `getReachouts()` (L27) | – (doesn't send the `?group` filter; filtered in the browser) | `ProjectReachout[]` |
| POST | `/api/project-reachouts` | `createReachout()` (L31) | `{ eid, projectName, techRole, pocEid, status, details, groupNumber: number\|null }` | `ProjectReachout` |
| PATCH | `/api/project-reachouts/:id` | `updateReachout()` (L36) | Full payload from the edit dialog, or `{ status }` from the inline dropdown | `ProjectReachout` |
| DELETE | `/api/project-reachouts/:id` | `deleteReachout()` (L40) | – | `{ deleted: boolean }` |

### Non-API HTTP

| Method | Path | Caller | Notes |
|---|---|---|---|
| GET | `/poc-howto/{tabId}.html` (`responseType: 'text'`) | [poc-howto-content.service.ts:17](../src/app/services/poc-howto-content.service.ts#L17) | Static files from `public/poc-howto/`. The path is relative and doesn't go through `apiUrl()`, so it's served by `ng serve` in dev or by Express's static `dist/` handler in prod. Edits are kept in memory only |

### Mocked in the frontend, not on the server

These services return `of(...)` with fake delays and say in comments which endpoints they'll eventually call. None of these endpoints exist in `server.js`, and they're named inconsistently:

| Planned endpoint | Service |
|---|---|
| `GET/PATCH /api/trainings-progress/:eid` | [bench-trainings-progress.service.ts](../src/app/views/bench-trainings/bench-trainings-progress.service.ts) |
| `GET/PATCH /api/training-progress/:eid` | [group-trainings-progress.service.ts](../src/app/views/group-trainings/group-trainings-progress.service.ts) |
| (none; mock track data) | [group-trainings-data.service.ts](../src/app/views/group-trainings/group-trainings-data.service.ts) |
| (none; mock saves) | `PocHowToContentService.saveContent()` |

### Server endpoints the frontend never calls

`GET /api/health` (Playwright doesn't use it either; it waits on `/api/onboarding-resources`), all of `/api/tasks*`, `GET /api/skill-options`, `DELETE /api/sprints/:id`, `GET /api/deletion-logs`, all of `/api/fruits*`, and the `?groupNumber` / `?group` query filters on boards, retros, and reachouts.

---

## 8. Issues worth knowing before a refactor

These are things I saw while reading. None of them have been changed.

1. **No auth, open CORS, and no validation on several write routes.** `POST/PATCH /api/attendance`, `POST/PATCH /api/planner-tasks`, `POST /api/deletion-logs`, and `PATCH /api/competency-records/:eid` accept any values for their fields. Since Phase 3 of the SQLite migration they store only their collection's fields ([server/utils/fields.js](../server/utils/fields.js)) and ignore a client's `id` and timestamps, but nothing checks the values.
2. **Fixed in Phase 3: `getSkillOptions()` read only snake_case keys.** It now reads every record through `formatOnboardingResource` ([onboarding.format.js](../server/features/onboarding/onboarding.format.js)), like the resources list, so skills on camelCase records appear too. The frontend doesn't call this endpoint.
3. **Changing an EID through PATCH duplicates the resource.** The old record stays, which `updateResource` in [onboarding.service.js](../server/features/onboarding/onboarding.service.js) does on purpose and the README documents. It's still surprising.
4. **The attendance location sticks around.** When a cell changes from `RTO` to another status, the client sends `{ status }` without `location` (`undefined` is dropped from JSON), and the server merges, so the old `location` stays on the stored record.
5. **Unknown `/api` GETs return `index.html` with 200** because of the SPA catch-all (§3).
6. **Fixed in Phase 8 of the SQLite migration: there were three persistence stories.** SQLite is now the only backend; the JSON files are only its seed, and the JSON fallback and json-server (`npm run json-api`) are gone.
7. **The `db.json` seed has dead collections** (`onboarding-resources`, `dashboard`) that diverge from what Express serves. The import skips them.
8. **Planner tasks embed comments and checklists**, so every modal save rewrites the whole task, and two users editing comments at once overwrite each other.
