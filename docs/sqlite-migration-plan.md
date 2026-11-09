# SQLite migration plan

**Status:** not started. This plan builds on the restructured backend from [server-restructure-plan.md](server-restructure-plan.md), so `feature/backend-refactor` has to be merged into `develop` first. Every phase branches off `develop`, and its PRs target `develop`.

**Goal:** move the dashboard data (`db.json` and `custom-onboarding.json`) from whole-file JSON reads and writes to SQLite, using `better-sqlite3`. The HTTP contract stays the same, apart from storage-related bugs fixed on purpose (see "Bug scope"). The JSON backend stays for a while as a fallback that a setting can switch back to. It is then removed completely (Phase 8).

## Decisions this plan is built on

These were settled with the team on 2026-11-09. Don't reopen them while you carry out the plan.

| # | Decision |
|---|---|
| 1 | The migration **may fix storage-related bugs**, each with a reviewed snapshot update. All other bugs stay, and their snapshots stay pinned |
| 2 | Driver: **`better-sqlite3`**, which is synchronous like today's `fs` calls, so no handler becomes async |
| 3 | Routes that store any field get an **allowlist**: one typed column per known field. Unknown keys are **dropped silently**, with no 400. Planner task `labels`, `checklist` and `comments` become JSON columns |
| 4 | Migration source: **the JSON files on `develop`** (`server/data/db.json`, `server/data/custom-onboarding.json`). Uncommitted local edits don't count |
| 5 | **Dead data is skipped:** `db.json`'s `onboarding-resources`, `dashboard` and `$schema` keys, plus `attendance.json`, `attendance-options.json` and `routes.json` |
| 6 | The **36 attendance rows with random json-server ids** (e.g. `'RxJX-3dWOPE'`) are **dropped**. That also removes both duplicate attendance cells |
| 7 | The **JSON backend stays as a temporary fallback**, chosen by `PERSISTENCE=sqlite\|json`. To fall back, run the export script (SQLite → JSON files), then flip the setting. **Phase 8 removes the JSON backend** |
| 8 | The `.sqlite` file is **gitignored**. `npm run db:migrate` builds it from the committed JSON |
| 9 | Constraints: **only `UNIQUE` where the API already guarantees it**, i.e. roster `eid`, capacity `(sprint_name, eid)` and competency `eid`. **No foreign keys**, so M11 and M13 don't change |
| 10 | **Out of scope:** legacy `/api/tasks` (`tasks.json`) and the fruits test bench (`test_bwd/db.json`). They stay on their own JSON repositories, even after Phase 8 |

## What the plan relies on

These are verified against `develop` (`0d602c3`) and `feature/backend-refactor` (`562c4e1`):

- **`develop`'s `server/data` is identical to this branch's committed data.** It has 98 roster records and 361 attendance rows (36 with random ids). After dropping those 36 there are **no duplicate cells and no duplicate ids**.
- **Every `db.json` collection is stored in ascending id order.** `ORDER BY id` therefore returns rows in the same order as today's arrays. The roster is the exception: its file order is newest first (`unshift`), with gaps from id repair. See "Roster order" under Risks.
- **Ids are mixed types:** numeric strings appear in lookups, boards, some buckets, labels and attendance. Nothing in the frontend relies on string ids. Labels are compared with `Number()` (`planner.component.ts:579-599`), and attendance options and office locations are read by `label`/`name` only (`attendance.component.ts:34`, `shared-data.service.ts:37`).
- **The roster mixes key styles:** 60 records are snake_case only, 24 camelCase only, and 14 have both. Where both exist, they disagree on 13 records (e.g. `hireDate: "08/05/2026"` next to `hire_date: ""`). `formatOnboardingResource` reads camelCase first, so the API already returns the camelCase value. The import uses exactly the same rule.
- **Planner tasks carry fields the UI doesn't know about.** `completedDate` holds real dates on 86 tasks. `notes` exists on 78 tasks and is `""` on every one of them. Neither field is in `PlannerTask` or anywhere else in `src/`.
- **`deletion-logs` doesn't exist in the real `db.json`** (the fixtures have 2 rows), and `project-reachouts` exists only in uncommitted edits. Both start empty.
- **The test suite is green:** 588 tests, run with `npm run test:api`. The leftover `song-tracker.sqlite-wal`/`-shm` files are gitignored and untracked, and there's no main `.sqlite` file, so they can't be read.

## Target structure

```
server/
  config/index.js                 + PERSISTENCE ('json' | 'sqlite'), sqlitePath (DATA_DIR/dashboard.sqlite)
  persistence/
    json/                         today's db-file and roster-file repositories (moved, then extended)
      db-file.repository.js
      roster-file.repository.js
      <feature>.store.js          one per feature: the store interface, implemented on db.json / the roster
    sqlite/
      connection.js               opens the database lazily on first use, sets pragmas, close()
      schema.sql                  the full schema (replaces the stale server/schema.sql)
      migrations.js               PRAGMA user_version-based schema upgrades
      <feature>.store.js          one per feature: the same interface, implemented with prepared statements
      import.js                   JSON files → SQLite (used by db:migrate and the test harness)
      export.js                   SQLite → JSON files (used by db:export, the fallback)
    tasks-file.repository.js      unchanged, out of scope
    fruits-file.repository.js     unchanged, out of scope
  scripts/
    db-migrate.js                 CLI: npm run db:migrate [--force] [--if-missing]
    db-export.js                  CLI: npm run db:export [--out <dir>]
  features/<name>/<name>.repository.js   picks the json or sqlite store from config.PERSISTENCE
```

### Layer rules (in addition to the restructure plan's)

- **Services never see the storage shape.** No `db[...]`, no arrays loaded from a file, no SQL. They call the store interface only.
- **The store interface is a unit of work.** `store.read(fn)` and `store.write(fn)` hand `fn` a session object with operations such as `list`, `findById`, `insert`, `update` and `remove`.
  - On JSON, `write` loads the file once and saves it once, and only if `fn` changed something. That keeps today's one-load, one-save pattern, and fs-trace stays green.
  - On SQLite, `write` wraps `fn` in a `db.transaction()`.
- **Only `persistence/**` may require `fs` or `better-sqlite3`.** `server/middleware/static.js` stays the one documented exception, and `server/scripts/*` reach both only through `persistence/`.
- **The server owns server fields.** `id`, `createdAt`, `updatedAt` and `deletedAt` are set by the service with `new Date().toISOString()`, never by SQL `CURRENT_TIMESTAMP`, whose format is different.
- **Ids:** use plain `INTEGER PRIMARY KEY` **without** `AUTOINCREMENT`. SQLite then picks `max(id)+1`, including reusing the id of a deleted last row, which is exactly today's `nextId()`. Competency rows use `eid` as the key, as they do today.
- **Opening the database has no side effect on load.** `connection.js` opens on the first query, and the test harness can call `close()`. `app.js` keeps `module.exports = app`.

## Schema

Columns are snake_case, and the stores map them to the camelCase API fields. "Optional" columns are NULL when a record doesn't have the field, **and they're left out of responses when NULL**, so existing records keep their current response keys. Every other column is always present.

| Table | Columns (optional ones marked `?`) | Constraints and indexes |
|---|---|---|
| `onboarding_resources` | `id`, `eid`, `name`, `hire_date`, `roll_in_date`, `project_deployed`, `deployment_date`, `project_name`, `poc`, `dn`, `roll_off_date`, `from_project`, `cl_level`, `group_number?` (INTEGER), `primary_skill`, `primary_years`, `secondary_skill`, `secondary_years`, `another_skills` (JSON array), `office_location`, `created_at`, `updated_at` | `UNIQUE(eid)`; `CHECK(json_valid(another_skills))` |
| `sprints` | `id`, `name`, `start_date`, `end_date` (API: `start`, `end`; `end` is an SQL keyword) | – |
| `sprint_retros` | `id`, `sprint_id`, `group_number`, `category`, `text`, `created_at` | index `(sprint_id)` |
| `capacity_entries` | `id`, `sprint_name`, `eid`, `cadence`, `admin`, `holiday` (REAL) | `UNIQUE(sprint_name, eid)` |
| `attendance` | `id`, `eid?`, `year?`, `month?`, `day?` (INTEGER), `status?`, `location?` | index `(year, month)`. Nullable, because the API still accepts `{}` (the validation part of M12 is kept) |
| `attendance_options` | `id`, `label` | read-only, filled by the import |
| `office_locations` | `id`, `name` | read-only |
| `planner_labels` | `id`, `name`, `color` | read-only |
| `planner_boards` | `id`, `group_number`, `name`, `description?` | read-only |
| `planner_buckets` | `id`, `board_id`, `name`, `sort_order` (API: `order`) | index `(board_id)` |
| `planner_tasks` | `id`, `board_id?`, `bucket_id?` (a non-numeric value is stored as NULL, as today), `title`, `status`, `priority`, `start_date`, `due_date`, `assignee`, `labels` (JSON, numbers), `checklist` (JSON), `comments?` (JSON), `description?`, `acceptance_criteria?`, `completed` (0/1 → boolean), `completed_date?`, `created_at`, `updated_at` | index `(board_id)`; `json_valid` checks |
| `deletion_logs` | `id`, `type`, `task_id?`, `task_title`, `deleted_by`, `deleted_by_eid`, `comment_author?`, `comment_text?`, `comment_created_at?`, `deleted_at` | index `(deleted_by_eid)` |
| `project_reachouts` | `id`, `eid`, `project_name`, `tech_role`, `poc_eid`, `status`, `details`, `group_number?`, `created_at`, `updated_at?` (POST doesn't set it today) | – |
| `competency_records` | `eid` (PK), `primary_skill`, `primary_proficiency`, `recent_retake_date`, `next_retake_date`, `secondary_skill`, `secondary_proficiency`, `retake_date` | defaults `''` / `'N/A'`, the same as the GET's default row |

Pragmas: `journal_mode = WAL`, `busy_timeout = 5000`, `foreign_keys = OFF` (decision 9). The schema version is kept in `PRAGMA user_version`.

`planner_tasks.notes` doesn't exist; the column is dropped (always `""`). `completed_date` is kept, and it's on the write allowlist, so it survives a round trip.

## Phases

Each phase is one or more PRs into `develop`, and each step within a phase is its own commit. Commits that only move files stay separate from commits that change logic. After every commit, `npm run test:api` passes. **Only Phase 2 (a format change) and Phase 3 (bug fixes) may update snapshots.** Every other phase must pass with no snapshot change at all.

| Phase | What | Snapshots | Risk |
|---|---|---|---|
| 0 | Prerequisites | none | Low |
| 1 | Store interface on JSON | none | Medium |
| 2 | Tests that work with any backend | format only, verified mechanically | Medium |
| 3 | Fix the storage bugs, on JSON | reviewed, one bug per commit | Medium |
| 4 | SQLite stores, import, schema | **none** | High |
| 5 | Export (the fallback) and round-trip tests | none | Medium |
| 6 | Cutover: SQLite becomes the default | none | Medium |
| 7 | Soak period with the fallback available | – | Low |
| 8 | Remove the JSON backend | delete the JSON-only tests | Low |

### Phase 0: prerequisites

1. Merge `feature/backend-refactor` into `develop`.
2. **Spike `better-sqlite3`.** Install the current major version on a team Windows machine and on CI (`ubuntu-latest`), and confirm the prebuilt binary downloads. If a proxy blocks the download, it falls back to compiling, which needs Visual Studio Build Tools; the old `run-npm-install*.cmd` scripts suggest that happened before. **Stop the plan if it doesn't install cleanly on both.** Pin the exact version in `package.json`.
3. Update [CLAUDE.md](../CLAUDE.md):
   - replace "Do not start any SQLite work" with a pointer to this plan;
   - allow reviewed snapshot updates in Phases 2 and 3 only;
   - add `better-sqlite3` to the "only `persistence/`" rule;
   - drop the duplicate "Persistence rules" section.
4. Delete the stale `server/schema.sql`, and the orphaned `song-tracker.sqlite-wal`/`-shm` files on each developer's machine (they're untracked). Add `server/data/*.sqlite` to `.gitignore` (`-wal`/`-shm` are already there).
5. Add `PERSISTENCE` (default `json`) and `sqlitePath` to `config/index.js`. An unknown value throws when the module loads. Extend `paths.test.js` to cover both.

### Phase 1: store interface on JSON (no behaviour change)

1. Pure move: `persistence/db-file.repository.js` and `persistence/roster-file.repository.js` → `persistence/json/`.
2. One feature per commit, in the restructure order: lookups → sprints → capacity → attendance → planner → reachouts → competency → onboarding. Each commit adds `persistence/json/<feature>.store.js` with the unit-of-work interface, and rewrites the service against it.
   - Moving `nextId()` into the JSON stores is fine. The SQLite stores don't need it.
   - **The pinned TypeError text in `data-shape-edges.test.js`** (`(db.sprints || []).map is not a function` and the like) now comes from the JSON store. Keep the same expression and variable name (`db`) there, so the message doesn't change.
   - **Reachouts PATCH:** today the changes are applied to the loaded row first and the required fields checked afterwards. Instead, build the changed row in the service, validate it, and only then call `update`. The result is the same: one load, and no save on error.
   - **Onboarding** keeps its current calls (`load`, `append`, `update`, plus a new `remove`), including the multiple roster reads per request that fs-trace pins. Fewer reads come in Phase 8.
3. Every feature repository now picks the store from `config.PERSISTENCE`. Only `json` exists so far.

Done when: services contain no `db[` and no `repository.load()`, and the suite is green with no snapshot change.

### Phase 2: tests that work with any backend

Today's snapshots record the storage side as raw line diffs of the data files. A SQLite run can't produce those diffs.

1. Add `dumpStore(dataDir)` to the harness. Through each store's `list` operations it returns `{ collection: rows[] }`, and the snapshot records a **logical diff**: rows added, changed and removed per collection. `tasks.json` and the fruits file keep their raw file diffs, because they stay on JSON.
2. Switch the characterization snapshots from file diffs to logical diffs in **one commit that changes only the storage sections.** A script in the PR checks that every response section is byte-identical, and that each logical diff matches the parsed old file diff.
3. Tag the tests that only make sense on JSON files as **json-only**. These cover BOMs, corrupt files, a missing roster and CSV seeding, fractional-id repair, non-array collections, `fs-trace` and the JSON half of `no-read-cache`. They keep pinning the JSON backend until Phase 8.
4. The harness reads `PERSISTENCE` and skips tests tagged for the other backend. Add `npm run test:api:sqlite`, which sets `PERSISTENCE=sqlite`. It skips everything until Phase 4.
5. **Raw-file guarantees for the JSON backend stay covered.** Keep a small json-only test that checks `db.json` is written with 2-space indentation and no trailing newline, and the roster with a trailing newline, because the export script (Phase 5) has to match it.

### Phase 3: fix the storage bugs, on the JSON backend

The fixes go in the service layer and the canonical row mappers, so both backends share them. **Make one commit per bug.** Each commit message names the bug id, and the snapshot diff in that commit may only show that bug's change. For each PR, run a key-order-insensitive comparison of the snapshots, so a reordering of keys can't hide a change in values.

| Bug | Fix |
|---|---|
| M12 (storage part) | Allowlist on attendance POST/PATCH, planner-tasks POST/PATCH, deletion-logs POST and competency PATCH. Unknown keys are dropped, and a client's `id`/`createdAt`/`updatedAt`/`deletedAt` is ignored. **The validation part stays:** `{}`, unknown statuses and duplicate cells are still accepted |
| M8 | Competency PATCH ignores `eid`, `name` and `clLevel` in the body, so a row can't be renamed and the names from the roster can't be hidden |
| M6 (id type) | Attendance ids are always numbers, on GET and on PATCH. **The stale `location` stays:** PATCH still merges the fields it receives |
| M7 | A non-numeric `cadence`/`admin`/`holiday` becomes `0` on an existing entry too, the same as on a new one |
| L2 (sprints) | `null` on `PATCH /api/sprints/:id` leaves the field unchanged instead of storing `"null"`. The legacy-tasks half is out of scope and stays |
| H2 | An unreadable `db.json` becomes a 500 on reads and writes, instead of loading `{}` and wiping the file on the next write. This matters for the fallback, because exported files can be damaged by hand edits (e.g. a BOM from PowerShell) |
| M4, M5 | Competency group membership and skill options read the roster through the same camelCase-first rule as `formatOnboardingResource`. Example: `kevin.r.lim` appears in group 5, and camelCase skills appear in skill options |
| Mixed id types | Lookups, boards, buckets and labels always return numeric `id`s, and task `labels` are always numbers. This one isn't in found-bugs.md; log it there as L16 first, then fix it |
| Response shape | Optional fields are left out when absent, and present fields come in a fixed column order. This only reorders keys: the key-order-insensitive comparison must show no change in values |

Update [found-bugs.md](found-bugs.md) in each commit, marking the bug as fixed with the commit hash.

**Bugs that stay unchanged** (their snapshots don't move): H1, H3, H4, M1, M2, M9, M10, M11, M13, M14, L1, L3–L7, L10–L13, L15, the validation part of M12, the stale-location part of M6, the legacy-tasks part of L2, and the `tasks.json` part of L8.

**Bugs that only the SQLite backend removes.** They come from the JSON files themselves, so json-only tests keep pinning them on JSON until Phase 8: M3 (a corrupt roster), M15 (fractional ids), L8 (the roster rewrites itself on a GET), L9 (records with both key styles) and L14 (CSV seeding).

### Phase 4: SQLite stores, import and schema

1. Add `persistence/sqlite/connection.js`, `schema.sql` and `migrations.js`. The harness gets a `close()` hook: it requires `persistence/sqlite/connection.js` from the same freshly loaded module cache as `app.js`, and closes it in `t.after()`, before the temp directory is deleted. Without that, Windows refuses to delete the open file.
2. Add `persistence/sqlite/import.js`. It reads `db.json` and `custom-onboarding.json` from `DATA_DIR` and fills the database in one transaction:
   - skip the dead keys (decision 5);
   - drop the attendance rows whose `Number(id)` isn't an integer (decision 6);
   - convert every id to a number, and task `labels` to numbers;
   - merge the roster's two key styles with the camelCase-first rule;
   - keep `completedDate`, drop `notes`;
   - refuse rows that would break a `UNIQUE` constraint, with a clear error naming the row;
   - print a report: rows per table, dropped rows with their ids, and skipped keys.
3. **The harness builds the database from the fixtures.** It copies the fixtures, runs the test's `setup(dataDir)` on the JSON (so existing setups keep working), then imports. Setups that break the JSON on purpose belong to json-only tests (Phase 2).
4. Add `persistence/sqlite/<feature>.store.js` for each feature, in the Phase 1 order, one commit each. Use prepared statements and `ORDER BY id`. Each commit makes that feature's shared tests pass under `npm run test:api:sqlite` **with no snapshot update**.
5. **Guardrails:**
   - extend `fs-boundary` to `better-sqlite3`;
   - add a sqlite half of `no-read-cache` that edits a row with SQL between requests;
   - add `sqlite-trace.test.js`, which records the SQL statements each request runs (through the `verbose` option) and snapshots them, catching N+1 queries and missing transactions;
   - add import unit tests for the random-id rows, the mixed roster keys, a duplicate `eid`, and the dead keys (the fixtures have none of these, so they need tests of their own).
6. CI runs `test:api` and `test:api:sqlite` on every push.

Done when: both suites are green, no shared snapshot changed, and the import of `develop`'s real data reports 98 roster rows, 325 attendance rows (36 dropped), and the expected counts everywhere else.

### Phase 5: export (the fallback) and round-trip tests

1. Add `persistence/sqlite/export.js`, run as `npm run db:export [--out <dir>]`.
   - It writes `db.json` (collections in a fixed key order, 2-space indent, no trailing newline) and `custom-onboarding.json` (newest first, with a trailing newline), using Node's `fs`.
   - It backs up existing files to `*.bak-<timestamp>` before overwriting them.
   - Exported rows use the canonical camelCase shape.
2. **Round-trip tests:**
   - import the fixtures → export → import again, and the two `dumpStore()` results are identical;
   - run the shared suite with `PERSISTENCE=json` against exported fixtures, and it passes with no snapshot change, which proves the exported files work as a fallback.
3. Write the fallback runbook into [running-backend.md](running-backend.md) (see "Fallback runbook" below).

### Phase 6: cutover

1. Make `PERSISTENCE` default to `sqlite`.
2. Change `npm run api` and `npm run dev` to run `node server/scripts/db-migrate.js --if-missing` first. A fresh clone then builds `dashboard.sqlite` from the committed JSON. `db:migrate --force` rebuilds it. It refuses to overwrite an existing database unless `--force` is given.
3. **Playwright:** a `globalSetup` builds a database in a temp `DATA_DIR` from `server/data`'s JSON, and the `npm run api` webServer gets that `DATA_DIR`, so e2e runs stop writing to the developer's database. (CI runs Playwright only for `main`; see the repo's workflow.)
4. Update the docs:
   - [CLAUDE.md](../CLAUDE.md): Persistence and Gotchas. The "check `git diff server/data`" gotcha no longer applies to dashboard data, and `npm run json-api` writes to the JSON files, not the live data.
   - [backend-overview.md](backend-overview.md) §5 and [running-backend.md](running-backend.md) §5: where the data lives, how to reset it (`db:migrate --force`), and how to back it up (`db:export`).
5. Tell the team: after pulling, each developer's UI edits stay local, and the committed JSON is now only the seed.

### Phase 7: soak period

Run on SQLite with the fallback available for **[N weeks: the team decides at cutover]**. Fall back only through the runbook. Phase 8 can start when the period has passed with no fallback, or when every fallback has been followed by a successful switch back with `db:migrate --force`.

### Phase 8: remove the JSON backend

1. Delete `persistence/json/`, the `PERSISTENCE` setting and the store switch in the feature repositories. Delete the json-only tests and their snapshots, `fs-trace` (replaced by `sqlite-trace`), and `npm run test:api:sqlite`, because `test:api` is now SQLite only.
2. Remove `npm run json-api` and the `json-server` references from README and CLAUDE.md.
3. Mark M3, M15, L8 (the roster part), L9 and L14 as fixed in found-bugs.md.
4. **Optional clean-ups, now that services no longer have to suit JSON files:**
   - onboarding's repeated roster reads become targeted queries;
   - the competency join becomes one SQL `JOIN`;
   - list filters (`?boardId`, `?year`, `?month`…) move into `WHERE` clauses.

   Each of these changes `sqlite-trace` only.
5. **Decide what the seed becomes.** Either keep the committed JSON plus `import.js` as a seed loader, or replace them with a committed SQL seed. Also decide whether `export.js` stays as a backup tool. Neither choice affects the runtime.
6. Still on JSON after Phase 8, by decision 10: `tasks-file.repository.js` and `fruits-file.repository.js`. Migrating or deleting them is separate work.

## Fallback runbook (Phases 6–7)

```bash
# Switch to the JSON backend
#   1. stop the server
npm run db:export                       # writes server/data/db.json + custom-onboarding.json (originals backed up as *.bak-<ts>)
PERSISTENCE=json npm run api            # PowerShell: $env:PERSISTENCE = 'json'; npm run api

# Switch back to SQLite (keeps whatever was written while on JSON)
#   1. stop the server
npm run db:migrate -- --force
npm run api
```

Never edit the exported files with PowerShell (`Set-Content`, `Out-File`). After Phase 3 a BOM no longer wipes data, but it still makes every `db.json` route return 500.

## Risks

- **Native dependency.** `better-sqlite3` breaks when Node is upgraded without a rebuild, and wherever prebuilt binaries can't be downloaded. Phase 0 checks the install. Keep the Node version pinned in the README (22 LTS).
- **Roster order.** `GET /api/onboarding-resources` already sorts (newest `created_at` first, then highest id). But `GET /api/competency-records` lists group members **in roster file order**, which the real data doesn't keep consistently. The SQLite store gives the competency list the same order as the resources list. The fixtures are in strictly descending id order, so no snapshot changes. On the real data, the order of rows in the myCompetency table may change, which is harmless.
- **Phase 3 reorders response keys.** The UI never relies on key order, but the snapshots do. The key-order-insensitive comparison is the safeguard; don't skip it.
- **Two backends running against each other.** Never run the API on JSON and on SQLite against the same `DATA_DIR` at once, or `npm run json-api` alongside the API. The runbook always stops the server first.
- **Windows file locks.** An open database blocks deleting the temp directory, and `db:migrate --force` while the server is running. The harness's `close()` hook covers the first; `db:migrate` should fail with a clear message for the second.
- **Uncommitted local data.** The migration reads the committed JSON. Anyone with UI edits they want to keep must commit them to `develop` before the cutover, or lose them on their next `db:migrate --force`.
- **Keep the planner's arrays as JSON for now.** Child tables for checklist items and comments only pay off once the API saves them one at a time. The UI saves the whole task each time, so every save would delete and re-insert every child row. Treat that as a later feature, not part of this migration.
