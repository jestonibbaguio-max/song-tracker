# SQLite migration plan

**Status:** Phase 0 is done on `feature/sqlite-phase-0`, with review fixes on `feature/sqlite-phase-0-fixes`; the Linux CI check waits for Phase 4 step 6. Phase 1 is done on `feature/sqlite-phase-1`, rebuilt on top of the fixes, with step 0 first (see "Deviations"). Phase 2 is done on `feature/sqlite-phase-2`, with steps 3 and 4 before step 2 (see "Deviations"). Phase 3 is done on `feature/sqlite-phase-3` (see "Deviations"). Phase 4 is done on `feature/sqlite-phase-4` (see "Deviations"). Phase 5 is done on `feature/sqlite-phase-5` (see "Deviations"). Phase 6 (the cutover) is done on `feature/sqlite-phase-6` (see "Deviations"): SQLite became the default. Phase 7, the soak, passed with no fallback. Phase 8 is done on `feature/sqlite-phase-8` (see "Deviations"): the JSON backend, the `PERSISTENCE` setting and the export are gone, and SQLite is the only backend. The migration is complete. This plan builds on the restructured backend from [server-restructure-plan.md](server-restructure-plan.md), which was merged into `develop` in `07f41a8`. Every phase branches off `develop`, and its PRs target `develop`.

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

These are verified against `develop` at `07f41a8` (the merge of `feature/backend-refactor`). Its `server/data` is identical to `0d602c3`, the commit before the merge:

- **`develop`'s `server/data` is identical to this branch's committed data.** It has 98 roster records and 361 attendance rows (36 with random ids). After dropping those 36 there are **no duplicate cells and no duplicate ids**.
- **Every `db.json` collection with ids is in ascending id order once the import has run.** `ORDER BY id` therefore returns rows in the same order as today's arrays. There are two caveats:
  - **Attendance isn't ascending as stored.** The order breaks at index 226 (`"247"` → `'RxJX-3dWOPE'`), and it's ascending only after the 36 random-id rows are dropped (decision 6).
  - **`competency-records` has no ids** (0 of 13 rows). Its order is file order, so its table must return rows `ORDER BY rowid` (insertion order). The import inserts rows in file order, and new rows are appended, as today.

  The roster is the exception: its file order is newest first (`unshift`), with gaps from id repair. See "Roster order" under Risks.
- **Ids are mixed types:** numeric strings appear in lookups, boards, some buckets, labels and attendance. Nothing in the frontend relies on string ids. Labels are compared with `Number()` (`planner.component.ts:579-599`), and attendance options and office locations are read by `label`/`name` only (`attendance.component.ts:34`, `shared-data.service.ts:37`).
- **The roster mixes key styles.** Not counting `created_at`/`updated_at`, which every record has:
  - **By style:** 60 records use only snake_case fields, 20 only camelCase, and 18 have both.
  - **By field:** 14 records store at least one field in both styles, and 24 others use camelCase without a duplicated field. 4 of those 24 (jayson.mark.d.castro, daniel.x.b.legaspi, erald.j.l.sanchez, johnbert.c.d.tagle) still keep 10 fields in snake_case only.
  - **Disagreements:** in **14** records the two styles of a field disagree, e.g. `hireDate: "08/05/2026"` next to `hire_date: ""`, and iverson.c.cabangis with `groupNumber: 5` next to `group_number: 6`.

  `formatOnboardingResource` reads camelCase first and falls back to snake_case, so the API already returns the camelCase value. The import uses exactly the same rule.
- **Planner tasks carry fields the UI doesn't know about.** `completedDate` exists on 86 tasks, and holds a date on 59 of them and `""` on 27. `notes` exists on 78 tasks and is `""` on every one of them. Neither field is in `PlannerTask` or anywhere else in `src/`.
- **`deletion-logs` doesn't exist in the real `db.json`** (the fixtures have 2 rows), and `project-reachouts` exists only in uncommitted edits. Both start empty.
- **The test suite is green:** 588 tests before Phase 0, 594 after it, 601 after Phase 1, 620 after Phase 2 and 622 after Phase 3, run with `npm run test:api`. After Phase 2, `npm run test:api:sqlite` passes the 43 tests that don't need the stores and skips the rest. After Phase 4 (with its review fixes), `test:api` passes 661 and `test:api:sqlite` passes 582, skipping the 74 json-only tests. After Phase 5, `test:api` passes 677 (skipping the 2 sqlite-only round trips), `test:api:sqlite` passes 599 (skipping the 74 json-only tests and the json round trip), and `test:api:exported` passes 580 (skipping 77: those 75 and the 2 sqlite-only round trips). The leftover `song-tracker.sqlite-wal`/`-shm` files are gitignored and untracked, and there's no main `.sqlite` file, so they can't be read. After Phase 6, `test:api` (now explicitly json) passes 689, `test:api:sqlite` 611 and `test:api:exported` 592, each with one more skip than above (3, 76 and 78) on a machine where `dist/` isn't built (see "Deviations › Phase 6"). After Phase 8, `test:api` is the only suite and runs on SQLite: it passes 616 and skips 4 without a built `dist/` (the `dist/` check and 3 `notApplicable` placeholders); see "Deviations › Phase 8".

## Target structure

As built after Phase 8 (the JSON backend, `select-store.js`, the export and `PERSISTENCE` are gone):

```
server/
  config/index.js                 DATA_DIR, PORT, sqlitePath (DATA_DIR/dashboard.sqlite) and the JSON files' paths
  persistence/
    sqlite/
      connection.js               opens the database lazily on first use, sets pragmas, js_number(), close()
      schema.sql                  the full schema (replaces the stale server/schema.sql)
      migrations.js               PRAGMA user_version-based schema upgrades
      tables.js                   API fields ↔ columns, used by the stores and the import
      sqlite-store.js             the unit of work (read/write) and shared select/insert/update/delete helpers
      <feature>.store.js          one per feature, with prepared statements
      import.js                   JSON seed → SQLite (used by db:migrate and the test harness)
    tasks-file.repository.js      unchanged, out of scope
    fruits-file.repository.js     unchanged, out of scope
  scripts/
    db-migrate.js                 CLI: npm run db:migrate [--force] [--if-missing]
  features/<name>/<name>.repository.js   exports persistence/sqlite/<name>.store.js
```

### Layer rules (in addition to the restructure plan's)

- **Services never see the storage shape.** No `db[...]`, no arrays loaded from a file, no SQL. They call the store interface only.
- **The store interface is a unit of work.** `store.read(fn)` and `store.write(fn)` hand `fn` a session object with operations such as `list`, `findById`, `insert`, `update` and `remove`.
  - On JSON, `write` loads the file once and saves it once, and only if `fn` changed something. That keeps today's one-load, one-save pattern, and fs-trace stays green.
  - **"Changed" means a mutating operation was called, not that the data differs.** Today a no-op `PATCH /api/sprints/1` with `{}` still saves `db.json` (`sprints.service.js:44-45`). A store that compared content before saving would silently stop that write, and fs-trace has no no-op case to catch it (Phase 1 step 0 adds one).
  - On SQLite, `write` wraps `fn` in a `db.transaction()`.
- **Only `persistence/**` may require `fs` or `better-sqlite3`.** `server/middleware/static.js` stays the one documented exception, and `server/scripts/*` reach both only through `persistence/`.
- **The server owns server fields.** `id`, `createdAt`, `updatedAt` and `deletedAt` are set by the service with `new Date().toISOString()`, never by SQL `CURRENT_TIMESTAMP`, whose format is different.
- **Ids:** use plain `INTEGER PRIMARY KEY` **without** `AUTOINCREMENT`. SQLite then picks `max(id)+1`, including reusing the id of a deleted last row, which is exactly today's `nextId()`. Competency rows use `eid` as the key, as they do today.
- **Opening the database has no side effect on load.** `connection.js` opens on the first query, and the test harness can call `close()`. `app.js` keeps `module.exports = app`.

## Schema

Columns are snake_case, and the stores map them to the camelCase API fields. "Optional" columns are NULL when a record doesn't have the field, **and they're left out of responses when NULL**, so existing records keep their current response keys. **Only an absent key becomes NULL.** A stored `""` stays `""` through the import, the stores and the export; it must never turn into NULL and drop out of a response. Examples are the 27 empty `completedDate` values and every `notes` value. Every other column is always present.

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
| `planner_tasks` | `id`, `board_id?`, `bucket_id?` (a non-numeric value is stored as NULL, as today), `title`, `status`, `priority`, `start_date`, `due_date`, `assignee`, `labels` (JSON, numbers), `checklist` (JSON), `comments?` (JSON), `description?`, `acceptance_criteria?`, `completed` (0/1 → boolean), `completed_date?`, `notes?`, `created_at`, `updated_at` | index `(board_id)`; `json_valid` checks |
| `deletion_logs` | `id`, `type`, `task_id?`, `task_title`, `deleted_by`, `deleted_by_eid`, `comment_author?`, `comment_text?`, `comment_created_at?`, `deleted_at` | index `(deleted_by_eid)` |
| `project_reachouts` | `id`, `eid`, `project_name`, `tech_role`, `poc_eid`, `status`, `details`, `group_number?`, `created_at`, `updated_at?` (POST doesn't set it today) | – |
| `competency_records` | `eid` (PK), `primary_skill`, `primary_proficiency`, `recent_retake_date`, `next_retake_date`, `secondary_skill`, `secondary_proficiency`, `retake_date` | defaults `''` / `'N/A'`, the same as the GET's default row |

Pragmas: `journal_mode = WAL`, `busy_timeout = 5000`, `foreign_keys = OFF` (decision 9). The schema version is kept in `PRAGMA user_version`.

**As built in Phase 4**, the column types, the optional columns and the competency defaults differ from this table. [server/persistence/sqlite/schema.sql](../server/persistence/sqlite/schema.sql) is the reference; the Phase 4 deviations explain why.

**Binding rules for `better-sqlite3`** (all verified on 13.0.3). The stores convert every value before binding it:
- **Booleans throw.** Binding `true`/`false` fails with `TypeError: SQLite3 can only bind numbers, strings, bigints, buffers, and null`, so `planner_tasks.completed` needs an explicit `0`/`1` on write and `=== 1` on read.
- **`NaN` binds as NULL**, so the M7 fix has to coerce it explicitly.
- **Every JS number binds as a REAL**, so a TEXT column stores `1` as `"1.0"` (see the capacity risk under Risks). Numbers bound to TEXT columns have to go through `String()` first. INTEGER and REAL columns store them correctly.

`planner_tasks.completed_date` and `planner_tasks.notes` are kept as optional columns, and both are on the write allowlist, so they survive a round trip. `notes` is `""` wherever it exists, but `GET /api/planner-tasks` returns every stored key, and the planner snapshots pin `"notes": ""`. Dropping it would change responses in Phase 4, which no snapshot update is allowed to cover.

## Phases

Each phase is one or more PRs into `develop`, and each step within a phase is its own commit. Commits that only move files stay separate from commits that change logic. After every commit, `npm run test:api` passes.

**The snapshot rule:**
- **Existing snapshot entries** may change only in three phases, always as reviewed changes:
  - Phase 2: the storage-section format change, verified by a script;
  - Phase 3: one listed bug per commit;
  - Phase 8: deleting the json-only tests and their snapshots, and the `sqlite-trace` changes caused by the Phase 8 clean-ups.
- **New entries for new test cases** may be added in any phase. Examples are the Phase 1 no-op case (step 0) and `sqlite-trace` (Phase 4). Record each one against the code *before* the change it guards, and check that the snapshot diff only adds entries.
- Everything else must pass with no snapshot change at all.

| Phase | What | Existing snapshots | Risk |
|---|---|---|---|
| 0 | Prerequisites | none | Low |
| 1 | Store interface on JSON | none (step 0 adds a case) | Medium |
| 2 | Tests that work with any backend | format only, verified mechanically | Medium |
| 3 | Fix the storage bugs, on JSON | reviewed, one bug per commit | Medium |
| 4 | SQLite stores, import, schema | **none** (adds `sqlite-trace`) | High |
| 5 | Export (the fallback) and round-trip tests | none | Medium |
| 6 | Cutover: SQLite becomes the default | none | Medium |
| 7 | Soak period with the fallback available | – | Low |
| 8 | Remove the JSON backend | json-only snapshots deleted; `sqlite-trace` changes from the clean-ups, reviewed | Low |

### Phase 0: prerequisites

1. Merge `feature/backend-refactor` into `develop`.
2. **Spike `better-sqlite3`.** **Done:** `13.0.3` is pinned exactly. Version 13 ships its prebuilt binaries inside the npm package (`win32-x64`, `linux-x64` and others) and has no install script, so installing needs no download and no compiler. On Windows (Node 22.23.2, SQLite 3.53.4), a smoke test confirmed:
   - WAL mode works;
   - after the last row is deleted, its id is reused (`max(id)+1`);
   - `json_valid` CHECK constraints work;
   - after `close()`, the temp directory can be deleted;
   - `NaN` is bound as `NULL`, so the M7 fix has to coerce explicitly.

   **The Linux check waits for Phase 4 step 6, which is deferred** until GitHub Actions can run on the repository's account. It can't run before then: the only workflow, `.github/workflows/playwright.yml`, runs only on `main`/`master` and only runs `npx playwright test`, never `npm run test:api`.
3. Update [CLAUDE.md](../CLAUDE.md):
   - replace "Do not start any SQLite work" with a pointer to this plan;
   - state the snapshot rule (see "The snapshot rule" under Phases);
   - add `better-sqlite3` to the "only `persistence/`" rule;
   - drop the duplicate "Persistence rules" section.
4. Delete the stale `server/schema.sql`, and the orphaned `song-tracker.sqlite-wal`/`-shm` files on each developer's machine (they're untracked). Add `server/data/*.sqlite` to `.gitignore` (`-wal`/`-shm` are already there).
5. Add `PERSISTENCE` (default `json`) and `sqlitePath` to `config/index.js`. An unknown value throws when the module loads. Extend `paths.test.js` to cover both.

### Phase 1: store interface on JSON (no behaviour change)

0. **Add a no-op PATCH case to fs-trace**, e.g. `PATCH /api/sprints/1` with `{}`, which today loads `db.json` and saves it unchanged. Record it against the pre-Phase-1 server, so the snapshot diff only adds that entry. Every later Phase 1 commit must keep it green, which pins "changed" as "a mutating operation was called".
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
   - **`dumpStore` returns canonical rows**, through the same mapper on both backends: numeric ids, merged roster keys (camelCase first), the schema's column set. The fixtures store string ids and snake_case roster rows, so dumping raw JSON rows would give logical diffs that the SQLite backend can't reproduce in Phase 4.
   - **Canonical rows hide JSON-only storage differences.** Examples are M6's `"1"` → `1` and L9's records with both key styles. The json-only tests (step 3) keep raw file diffs for those.
2. Switch the characterization snapshots from file diffs to logical diffs in **one commit that changes only the storage sections.** A script in the PR checks that every response section is byte-identical, and that each logical diff matches the old file diff.
   - **Compare structurally, not by re-parsing line diffs.** `jsonDiff` in `test/helpers/characterize.js` produces a structural diff that matches records by `id`/`eid`. Before Phase 2, the snapshots showed its output as each file's "parsed JSON diff", next to the raw text diff. The script runs it on each case's before/after files and compares that with the new logical diff.
3. Tag the tests that only make sense on JSON files as **json-only**. These cover BOMs, corrupt files, a missing roster and CSV seeding, fractional-id repair, non-array collections, `fs-trace` and the JSON half of `no-read-cache`. They keep pinning the JSON backend until Phase 8.
4. The harness reads `PERSISTENCE` and skips tests tagged for the other backend. Add `npm run test:api:sqlite`, which sets `PERSISTENCE=sqlite`. Until Phase 4 it skips every test that needs the stores.
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
   - **Replace one Phase 0 guardrail.** `paths.test.js` has "loading the app with PERSISTENCE=sqlite creates no database file". It passes trivially until this phase, and it will fail once the harness builds `dashboard.sqlite` before the app loads (step 3). The replacement checks the real rule, that loading `connection.js` doesn't open the database, e.g. by spying on the `better-sqlite3` constructor while the app loads and asserting it isn't called until the first query.
2. Add `persistence/sqlite/import.js`. It reads `db.json` and `custom-onboarding.json` from `DATA_DIR` and fills the database in one transaction:
   - skip the dead keys (decision 5);
   - drop the attendance rows whose `Number(id)` isn't an integer (decision 6);
   - convert every id to a number, and task `labels` to numbers;
   - merge the roster's two key styles with the camelCase-first rule;
   - keep `completedDate` and `notes`;
   - refuse rows that would break a `UNIQUE` constraint, with a clear error naming the row;
   - print a report: rows per table, dropped rows with their ids, and skipped keys.
3. **The harness builds the database from the fixtures.** It copies the fixtures, runs the test's `setup(dataDir)` on the JSON (so existing setups keep working), then imports. Setups that break the JSON on purpose belong to json-only tests (Phase 2).
   - **Turn on the SQLite runs** in `test/helpers/backend.js`: add `'sqlite'` to `BACKENDS_WITH_STORES`, and list the database's files in `STORE_FILES.sqlite`, so the characterization snapshots leave them out of "data files".
   - **`dumpStore` calls the stores' list operations by name** (`test/helpers/store-dump.js`): `listSprints`, `listRetros`, `listEntries`, `listRecords` (attendance and competency), `attendanceOptions`, `officeLocations`, `plannerLabels`, `listBoards`, `listBuckets`, `listTasks`, `listDeletionLogs`, `listRows` and onboarding's `list`. The SQLite stores need the same operations.
   - **Known timestamps** still come from the data files before the app loads, i.e. the JSON before the import, so the normaliser keeps working unchanged.
   - **Since Phase 3, the services own field lists and response order** (`server/utils/fields.js`): they pick the writable fields before calling a store, and put returned rows in column order. A SQLite store gets only those fields and can return its columns in any order. It must still leave out an optional column that is NULL, and keep a value that's stored as `null`.
   - **`project_reachouts.group_number` is always written**, as `null` when a reachout has no group (`normalizeReachoutGroup`), and the fixtures and responses carry `"groupNumber": null`. Treat it as a nullable column that's always present, not as an optional one that drops out of responses.
4. Add `persistence/sqlite/<feature>.store.js` for each feature, in the Phase 1 order, one commit each. Use prepared statements and `ORDER BY id`. Each commit makes that feature's shared tests pass under `npm run test:api:sqlite` **with no snapshot update**.
5. **Guardrails:**
   - extend `fs-boundary` to `better-sqlite3`;
   - add a sqlite half of `no-read-cache` that edits a row with SQL between requests;
   - add `sqlite-trace.test.js`, which records the SQL statements each request runs (through the `verbose` option) and snapshots them, catching N+1 queries and missing transactions;
   - add import unit tests, because the fixtures cover none of these cases:
     - the random-id rows;
     - a duplicate `eid`;
     - the dead keys;
     - the mixed roster keys, including a record whose two styles disagree (the shape of iverson.c.cabangis: `groupNumber: 5`, `group_number: 6` → 5) and a camelCase record that keeps some fields in snake_case only;
     - `""` versus an absent `completedDate`/`notes`.
6. CI runs `test:api` and `test:api:sqlite` on every push. **Deferred** (see "Deviations › Phase 4"): GitHub Actions can't run on the repository's account for now.

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

Run on SQLite with the fallback available for **1–2 days** (decided at cutover, 2026-11-11). Fall back only through the runbook. Phase 8 can start when the period has passed with no fallback, or when every fallback has been followed by a successful switch back with `db:migrate --force`.

### Phase 8: remove the JSON backend

1. Delete `persistence/json/`, the `PERSISTENCE` setting and the store switch in the feature repositories. Delete the json-only tests and their snapshots, `fs-trace` (replaced by `sqlite-trace`), and `npm run test:api:sqlite`, because `test:api` is now SQLite only. Delete the Phase 2 verification script (`test/tools/verify-storage-snapshots.js`) and the `CHARACTERIZE_STORAGE_REPORT` hook in `characterize.js` too.
2. Remove `npm run json-api` and the `json-server` references from README and CLAUDE.md.
3. Mark M3, M15, L8 (the roster part), L9 and L14 as fixed in found-bugs.md.
4. **Optional clean-ups, now that services no longer have to suit JSON files:**
   - onboarding's repeated roster reads become targeted queries;
   - the competency join becomes one SQL `JOIN`;
   - list filters (`?boardId`, `?year`, `?month`…) move into `WHERE` clauses.

   Each of these changes `sqlite-trace` snapshots only. Those are reviewed updates, which the snapshot rule allows in this phase. Responses and the shared snapshots must not change.
5. **Decide what the seed becomes.** Either keep the committed JSON plus `import.js` as a seed loader, or replace them with a committed SQL seed. Also decide whether `export.js` stays as a backup tool. Neither choice affects the runtime.
6. Still on JSON after Phase 8, by decision 10: `tasks-file.repository.js` and `fruits-file.repository.js`. Migrating or deleting them is separate work.

## Reset and back up (since Phase 8)

The JSON fallback and its runbook were removed in Phase 8. What's left:

```bash
# Reset: rebuild the database from the committed JSON seed (discards local edits)
#   1. stop the server
npm run db:migrate -- --force
npm run api

# Back up: with the server stopped, copy the database and its -wal file (if any)
#   server/data/dashboard.sqlite   server/data/dashboard.sqlite-wal
```

`Ctrl+C` kills the server without closing the database, so its last writes may still be in the `-wal` file; copy both. To restore, stop the server and copy them back, deleting any other `-wal`/`-shm` in `server/data`. Never edit the seed with PowerShell (`Set-Content`, `Out-File`): the BOM it adds makes `db:migrate` refuse the file. The runbook as it was during Phases 6–7 is in git history ([running-backend.md](running-backend.md) §6 at `c836b08`).

## Risks

- **Native dependency.** `better-sqlite3` 13 bundles Node-API binaries for darwin, linux, linuxmusl and win32, each on x64 and arm64, so normal Node upgrades don't need a rebuild. It requires Node ≥ 22, which matches the README.
  - **Install with npm 12** (found in Phase 6). npm 10 and 11 ignore the package's `"gypfile": false` when they install from the lockfile (`npm ci`, or `npm install` into an empty `node_modules`) and run `node-gyp rebuild`, which fails without Visual Studio's C++ build tools. Phase 0's check only covered `npm install better-sqlite3@13.0.3`, which reads the full registry manifest and honours the setting. The docs say `npx npm@12 ci`. See "Deviations › Phase 6".
  - **On any other platform (e.g. 32-bit Windows), nothing compiles automatically.** There's no install script, so `npm ci` succeeds. `lib/binding.js` then falls back to `build/Release/better_sqlite3.node`, so the **first `new Database()` fails** until someone runs `npm run build-release` inside `node_modules/better-sqlite3`, which needs node-gyp and a C++ toolchain.
- **Numbers in TEXT columns (verify in Phase 4).** Capacity matches `(sprintName, eid)` with `===`, so on JSON a `sprintName` of `1` and one of `"1"` are two separate rows, and `1` comes back as a number.
  - better-sqlite3 binds JS numbers as REAL, so a TEXT `sprint_name` stores `1` as `"1.0"` (verified). The two rows stay separate, but the response changes from `1` to `"1.0"`.
  - Converting to `String()` before binding fixes that value, but then `1` and `"1"` would collide under `UNIQUE(sprint_name, eid)`.
  - Decide in Phase 4, with a shared test for each case, how every TEXT key that a client can send as a number behaves. Check at least capacity `sprintName`/`eid`, reachout and competency eids, and attendance `status`.
- **Roster order.** `GET /api/onboarding-resources` already sorts (newest `created_at` first, then highest id). But `GET /api/competency-records` lists group members **in roster file order**, which the real data doesn't keep consistently. The SQLite store gives the competency list the same order as the resources list. The fixtures are in strictly descending id order, so no snapshot changes. On the real data, the order of rows in the myCompetency table may change, which is harmless.
- **Phase 3 reorders response keys.** The UI never relies on key order, but the snapshots do. The key-order-insensitive comparison is the safeguard; don't skip it. (Done: the response-shape commit, `e75c870`, changed 30 entries in key order only and none in value.)
- **Two backends running against each other.** Never run the API on JSON and on SQLite against the same `DATA_DIR` at once, or `npm run json-api` alongside the API. The runbook always stops the server first.
- **Windows file locks.** An open database blocks deleting the temp directory, and `db:migrate --force` while the server is running. The harness's `close()` hook covers the first; `db:migrate` should fail with a clear message for the second.
- **Uncommitted local data.** The migration reads the committed JSON. Anyone with UI edits they want to keep must commit them to `develop` before the cutover, or lose them on their next `db:migrate --force`.
- **Keep the planner's arrays as JSON for now.** Child tables for checklist items and comments only pay off once the API saves them one at a time. The UI saves the whole task each time, so every save would delete and re-insert every child row. Treat that as a later feature, not part of this migration.

## Deviations

### Phase 1

- **Step 0 covers five no-op writes, not one.** The new fs-trace case runs five requests that leave `db.json`'s content unchanged but still save it: an empty sprint PATCH, a retro PATCH with the same text, a capacity upsert with no values, an empty attendance PATCH on a numeric id, and an empty competency PATCH.
  - Planner-task and reachout PATCHes always set `updatedAt`, and an attendance PATCH on a string id renumbers it (M6), so they're never no-ops and aren't included.
  - The case was recorded before the Phase 1 code (the snapshot diff only adds it). A `db-store` that skips saving when the content is unchanged fails this case and none of the older ones.
- **The stores are read/write sessions with feature-specific operations** (e.g. `findSprint`, `insertTask(body, serverFields)`), not a generic `list/findById/insert/update/remove`. Each operation keeps the key order its route produced before, e.g. `{ ...body, id }` for attendance and `{ id, ...fields }` for sprints, so the responses and stored rows stay identical.
- **Some list operations return rows as stored** (capacity, attendance, deletion logs, reachouts, competency, and the lookups). A non-array collection then still reaches the service's `filter`/`map`, with the variable names the pinned TypeError texts use. Sprints, retros, boards, buckets and tasks already made their ids numeric inside the pinned `(db['…'] || []).map(…)` expression, so that mapping now lives in the store.
- **Onboarding keeps its repeated roster reads.** Its store is `list/append/update/remove` rather than `read/write`, and `remove` is today's load → filter → save. fs-trace pins this.
- **The store is picked on each call** (`persistence/select-store.js`), not when the module loads. `PERSISTENCE=sqlite` loads the app and fails only on a request. `store-interface.test.js` pins this, along with the `read`/`write` contract.
- **Two faults in one request may report the other error.** A create now converts its body fields (e.g. `String(name).trim()`, `Number(body.boardId)`) before calling the store's insert, which computes `nextId`. Before, `nextId` ran first. A request that has both a non-array collection and an unconvertible body value (bug L15, or M1 on task POST) now fails on the body instead of with `arr.reduce is not a function`. Either fault on its own gives exactly the same result as before. No test pins the double fault.

### Phase 2

- **Steps 3 and 4 came before step 2.** The snapshot switch has to know which cases are json-only, so the backend switch and the tags landed first (`08deb0c`), with no snapshot change. The order was: tags and `test:api:sqlite`, `dumpStore`, raw copies (below), the switch, then the format guardrail (step 5).
- **What counts as json-only:**
  - a case with `jsonOnly: 'reason'`;
  - a case whose setup edits `db.json`, `custom-onboarding.json` or `custom.csv` directly (`removeFile`, `addBom`, `writeFile`, or a setup wrapped in `jsonOnlySetup()`). A `tasks.json` or fruits-file setup doesn't count, since those stay on JSON;
  - **tagged characterization cases:** BOMs, corrupt and missing files, CSV seeding, roster id repair, a string id and string `anotherSkills` in the roster, a read-only roster, and non-array collections;
  - **tagged guardrails:** `fs-trace`, the `db.json` unit of work, the `db.json` and roster halves of `no-read-cache`, two harness tests, and the new `json-format` test.
  
  An `editDb` setup that only drops a collection or edits rows runs on every backend.
- **Five raw copies.** The plan said the json-only tests keep raw file diffs for what canonical rows hide, but no existing json-only test covered M6 or L9. A dry run of the switch found exactly five cases where a store file changes in a way the logical diff can't show:
  - three attendance PATCHes on string ids, including M6's evidence case;
  - the two roster cases behind L9.
  
  Each got a json-only copy named "… (raw db.json)" or "… (raw custom-onboarding.json)", recorded before the switch with an add-only snapshot diff (`b03fedb`). The verification script fails if an entry with hidden changes has no copy holding its old text.
- **Canonical rows keep keys outside the schema.** They're placed after the schema's columns rather than dropped. Before Phase 3, the M12 cases store unknown client keys on JSON, and the logical diffs keep showing them, so the M12 fix will show up as those keys leaving "stored data".
- **`dumpStore` uses the stores' existing list operations.** No store method was added, and no server file changed in Phase 2. See Phase 4 step 3 for what the SQLite stores need.
- **Snapshot format.** Each entry of a case that runs on every backend gains a "stored data" line or block before "data files". "data files" now lists only `tasks.json` and the fruits file. json-only entries are unchanged.
- **The `test:api:sqlite` run** passes the 43 tests that don't need the stores (config, fs boundary, fixtures, helpers, canonical-row unit tests) and skips the rest.

### Phase 3

One commit per bug, in the table's order. Each commit's snapshot diff was reviewed with `test/tools/compare-snapshots.js`, which ignores key order. The commit hashes are in [found-bugs.md](found-bugs.md).

- **The fixes live in the services and in `server/utils/fields.js`**, not in separate "canonical row mappers":
  - `WRITABLE_FIELDS` and `pickWritable()` are the M12 allowlist;
  - `COLUMN_ORDER` and `inColumnOrder()` are the response shape;
  - `numericId()` in `server/utils/ids.js` serves M6 and L16.

  These are API field names, so services can use them without seeing storage. Both backends get them through the services.
- **M8 got two new cases before its fix** (`202ba08`, "Add competency cases for name and clLevel"). The existing case only covered the rename half of M8, not `name`/`clLevel` hiding the roster's values. Both cases were recorded against the unfixed code, with an add-only snapshot diff.
- **H2: a missing `db.json` still loads as empty.** Only a file that exists but can't be read or parsed is a 500 ("db.json is not valid JSON: …"). Decided with the user: there's nothing to lose when the file is missing.
- **M6: non-numeric ids stay as they are.** The 36 random attendance ids in the real data aren't turned into `null`; the Phase 4 import drops them (decision 6).
- **M4 and M5** read the roster through `formatOnboardingResource`. It moved, unchanged, to `onboarding.format.js` in its own commit first.
  - M4 keeps the `Number(groupNumber) === group` comparison, so `?group=0` still lists members with no group. That's a separate, newly logged bug (**L17**), and it isn't fixed here.
- **L16 was logged before its fix**, as the plan says. Boards and buckets already returned numeric ids, so the fix covers the lookups and task labels. Task labels are also numbers when written.
- **The response shape leaves out the roster:** `formatOnboardingResource` already builds every resource in one fixed order (`id`, `name`, `eid`, …).
- **One assertion changed outside the snapshots.** `store-interface.test.js` compared `GET /api/attendance-options` byte for byte with the stored rows; after L16 it expects the stored rows with numeric ids.
- **Fifteen cases were renamed** in a separate commit, because their names described the fixed behaviour (e.g. `null start becomes the string "null"`). The suite passed with no snapshot update after the rename, so every entry kept its content.

### Phase 4

No existing snapshot entry changed. Three new sets of entries were added, each with an add-only diff against `develop`: 10 shared "numbers and text" cases (`f3441ef`, recorded on the JSON code), the 5 `sqlite-trace` entries, and 4 shared "infinite number" cases from the review fixes (recorded on the JSON code before the SQLite fix). The `sqlite-trace` entries, new in this phase, were re-recorded once before merge for the review fixes (`BEGIN IMMEDIATE`, competency `ORDER BY seq`); nothing else in them changed.

- **"Numbers in TEXT columns": decided with the user (2026-11-10).** Every table is `STRICT`.
  - Columns where a service stores the client's value as sent are `ANY`. Numbers and text keep their type, and `1` and `"1"` stay different, in `UNIQUE(sprint_name, eid)` too, exactly as `===` kept them apart on db.json. That covers attendance, capacity `sprint_name`/`eid`, the planner-task text fields, the deletion logs and the competency fields.
  - Columns the service converts (`String()`, `Number()`, validated integers) and the read-only lookups have real TEXT/INTEGER/REAL types.
  - The shared cases in `f3441ef` pin the behaviour on both backends: capacity `1` versus `"1"` in both directions, attendance, task, deletion-log, reachout and competency values.
- **New bug L18**, also decided with the user: values SQLite can't hold the way db.json does.
  - A `null` for an optional field reads back as absent.
  - A boolean, object or array for a plain field is a 500 with a clear message (`tables.js` checks before binding).
  - A task's `completed` is stored as a boolean.
  - No page sends any of these. `test/api/backend-differences.test.js` pins each case on both backends (`f3441ef`).
- **More columns are optional than the Schema table says.** Shared snapshots store rows with only some fields: `{"eid":…}` (competency), `{"id":…,"deletedAt":…}` (deletion log), `{"id":…}` (attendance) and a task from `POST {}`. So every field a client writes through `pickWritable` is an optional column. **Competency has no `''`/`'N/A'` column defaults**: the GET's default row applies only when no row is saved.
- **Task and bucket `boardId`/`bucketId` are always present but nullable**, like reachout `group_number`, not optional. A non-numeric value (NaN) is stored as NULL. The write that stored it returns `null`, and the list operations return `0` (`Number(null)`), as on db.json; snapshots pin both. These columns are REAL, because `Number()` can give a fraction, as are bucket `sort_order` and capacity `cadence`/`admin`/`holiday`.
- **`persistence/sqlite/tables.js`** (not in "Target structure") maps every collection's API fields to its columns and converts values both ways. The import and the stores share it, so a value is stored and read back the same way whichever wrote it. `sqlite-store.js` is the unit of work (`read`/`write`, with `write` in `db.transaction()`) plus shared select/insert/update/delete helpers.
- **Writes return the row they built in JS** (`{ id, ...fields }`, `{ ...stored, ...changes }`), as the JSON stores do; they don't read it back. That keeps NaN → `null` in responses.
- **Roster rows** are stored merged and returned as the API writes them to the roster file: camelCase fields plus `created_at`/`updated_at`. `list()` orders them `created_at DESC, id DESC`, as "Roster order" under Risks says. The L9 risk (a blanked camelCase field falling back to a stale snake_case value on JSON) didn't come up in any shared case.
- **Step order: the sqlite runs were turned on in the last store commit**, not in step 3, so both suites stayed green at every commit. Until then, each store was checked with a scoped run, using a temporary `SQLITE_STORES_PREVIEW=1` switch in `backend.js`. In preview, `dumpStore` also skipped collections without a store yet. The onboarding commit (`a41b4dd`) removed both.
  - `store-interface.test.js`'s "fails clearly" test moved to the next feature without a store in each commit. It's now "every feature store has a json and a sqlite implementation", plus `selectStore`'s clear error.
- **Harness:** `characterize.js`'s `readTree` leaves the SQLite files out of the data-directory snapshots, because a read can touch `-shm`.
- **The import** builds only a new database, and refuses an existing file (Phase 6's `--force` will delete it first). It refuses unknown collections and non-array collections, and treats a missing `db.json` as empty, as the JSON backend does. A missing roster is an error.
  - Develop's real data imports as: 98 roster rows, 13 sprints, 16 retros, 18 capacity entries, 325 attendance rows (36 dropped), 12 attendance options, 2 office locations, 11 labels, 5 boards, 16 buckets, 96 tasks, 0 deletion logs, 0 reachouts, 13 competency rows. The 3 dead keys are skipped.
- **`sqlite-trace` shows two lookups per PATCH**: the service's `find…` check, then the store's `update…`. The JSON stores make the same two lookups in memory. It's left as is, and is a candidate for the Phase 8 clean-ups, along with onboarding's repeated roster reads.
- **Step 6 (CI) is deferred.** A workflow running both backends on every push was added and then removed: the repository's GitHub account can't start Actions jobs (it's locked over billing), so each push only produced failure notices. Both suites are run locally instead. The Linux check of `better-sqlite3` (Phase 0 step 2) is still open, until CI can run again.
- **Review fixes before merge** (a read-only review of the branch against this phase, in one commit):
  - **Opening never creates the database.** `connection.js` opens with `fileMustExist`, so with no `dashboard.sqlite` every request is a 500 naming the missing file, instead of an empty database that answers `200 []`, takes writes, and makes a later import refuse to build over it. That matters for Phase 5 (exporting with no database) and Phase 6 (`db:migrate --if-missing`). `paths.test.js` pins it; its lazy-open test now builds a database first.
  - **Writes start with `BEGIN IMMEDIATE`** (`.immediate()`). A write reads before it writes, and with a deferred `BEGIN` another connection committing in between fails it with `SQLITE_BUSY` at once, without waiting for `busy_timeout`. Only a second connection (a second server on the same `DATA_DIR`, a database browser) can cause that, but after merge `sqlite-trace` freezes the statements until Phase 8.
  - **Competency rows have a `seq INTEGER PRIMARY KEY`** (not an API field), with `eid TEXT NOT NULL UNIQUE`, and list `ORDER BY seq`. The table's order was the implicit rowid, which `VACUUM` may renumber; `seq` is the rowid itself, so it can't. Phase 5's export writes rows in this order. A new test pins the insertion order on both backends (no response shows it, because GET joins by eid).
  - **A stored `Infinity`/`-Infinity` reads back as `null`** (`tables.js` `fromColumns`), as db.json holds it after `JSON.stringify`. Before, `1e999` in a body listed a task's or bucket's `boardId`/`bucketId` as `null` on SQLite but `0` on JSON. A capacity `cadence` case shows the columns that already matched. Not a found-bugs entry: the SQLite store was wrong, and now matches JSON.
  - **A retro `groupNumber` of `1e19` or more is a 500 on SQLite** (past SQLite's 64-bit integers; it passes the service's integer check). Added to L18 with the user, and pinned per backend in `backend-differences.test.js`.
  - **The harness allows one open app at a time.** The feature repositories load their store through `require.cache` on every call (since Phase 1), so once a second app has loaded, the first app's requests reach the second app's stores and data, on JSON as well as SQLite. `startTestServer()` now refuses to start while another app is open. Phase 5's round-trip tests must close one app before starting the next.
  - **New tests:** the SQLite unit of work (a `read()` session runs no write; `write()` is one transaction; a throw or a failing statement rolls back everything), and two import cases (a row that fails inside the transaction leaves no database files; ids that aren't positive integers are refused).
  - **The import differs from the JSON backend's reads in three ways**, none of which occur in the real data or the fixtures:
    - a roster record with a missing or non-integer id is refused, where the JSON backend repairs it (`ensureRecordIds`). The JSON backend rewrites the roster on every GET (L8), so a file the app has run on already has repaired ids;
    - a reachout `groupNumber` stored as `"3"` imports as `3` (an INTEGER column, as the service writes it);
    - a task with no `boardId` key lists `boardId` as `0` on SQLite (NULL), where JSON gives `null` (`Number(undefined)` is NaN). The service always writes the key.
  - **Not done in this phase:** `formatReport()` is printed by `db:migrate` (Phase 6); until then, the real-data counts above are checked by hand, because tests never read `server/data`. `better-sqlite3`'s `verbose` hook stays on for every connection, so `sqlite-trace` can attach a tracer at any time; with none set it does nothing, at the cost of one call per statement.

### Phase 5

No snapshot entry changed and none was added. The export runs outside requests, on its own connection, so `sqlite-trace` is untouched.

- **`exportJson({ dbPath, outDir })` opens its own connection** at the path it's given, as `importJson` does, not `connection.js`'s. It needs no `config`, so the tests and the CLI pass their own paths.
  - A missing file is refused (`fileMustExist`) before anything in `outDir` is touched, and so are a file at `user_version` 0 (e.g. an empty file) and a file that isn't a database. The version is checked before `configure()`, because switching an empty file to WAL would write to it.
  - Otherwise the export runs `migrate()`, as the server does when it opens the database.
- **The roster keeps `created_at`/`updated_at` in snake_case.** "Canonical camelCase" covers every other field. The JSON service sorts the resources on `a.created_at`, and the API writes both keys that way. Records come out in the order the API writes them (`name, eid, … officeLocation, id, created_at, updated_at`), so a record the API wrote exports byte-identical. 15 of `develop`'s 98 records are; the rest are snake_case or mixed (L9).
- **db.json's fixed key order is the fixtures' order**, which is also `develop`'s order without the dead keys. All 13 collections are written, empty ones as `[]`. **The dead keys are dropped** (decided with the user, 2026-11-10): the import never stored them (decision 5).
- **Rows are the stored values**, read with `fromColumns()`, not through the list operations' `Number()` mapping. So a task's NULL `boardId` exports as `null`, the way db.json held the NaN.
- **Writing:** every table is read in one transaction and both files are formatted before any file is touched. Then the existing files are backed up (`COPYFILE_EXCL`, so an existing backup with the same name stops the export), and each new file is written to `<file>.tmp-<timestamp>` and renamed over its target. `outDir` is created if it's missing. The backups are gitignored (`server/data/*.bak-*`).
- **The shared suite on exported fixtures is its own script, `npm run test:api:exported`** (decided with the user).
  - `test/tools/test-api.js json --exported` builds the fixtures' round trip (`test/helpers/exported-fixtures.js`: copy, import, export over the copy) and points `TEST_FIXTURES_DIR` at it. `createDataDir()` copies from there; `FIXTURES_DIR` still names the committed fixtures.
  - The json-only tests are skipped in that run: they pin the committed files themselves (string ids, snake_case roster records, BOMs).
- **Round-trip tests** (`test/api/sqlite-roundtrip.test.js`):
  - on sqlite: fixtures → export → import gives the same `dumpStore()`, and so does a round trip after writes through the API (a task with `""` and one with no `completedDate`/`notes`, capacity `1` and `"1"`, a new competency eid, a new resource, a deleted sprint);
  - on json: the JSON stores read the exported fixtures as the same data as the fixtures;
  - on any backend: exporting what was exported gives the same bytes.

  A deliberately broken export (competency rows ordered by eid) failed three of these tests.
- **Real data, checked by hand** in a temp directory with `develop`'s files (tests never read `server/data`):
  - import → export → import leaves every table identical, row for row;
  - every GET route returns byte-identical bodies from a SQLite server and from a JSON server on the exported files;
  - compared with a JSON server on the original files, the only differences are attendance (the 36 dropped rows, decision 6) and the order of competency members (Risks, "Roster order").
- **Not round-trippable, and not worked around:** the L18 values (a `null` sent for an optional field reads back as absent, a task's `completed` as a boolean) and stored infinities (`null`). Neither the fixtures nor the real data has any, so the round-trip tests can't catch them. The runbook says so.
- **The runbook** is [running-backend.md](running-backend.md) §6. Until Phase 6 adds `db:migrate`, its "switch back" step calls `import.js` directly. Two lines of that file that had been stale since Phase 4 were fixed (§2, and §4's `PERSISTENCE` row).

### Phase 6

No snapshot entry changed and none was added; `sqlite-trace` is untouched. The new tests are plain assertions: `test/api/db-migrate.test.js` (12 cases, on every backend) and one `paths.test.js` case (`PERSISTENCE=json is accepted`).

- **Step order: `db:migrate` came before the default flip**, so `npm run api` worked at every commit. The commits were:
  1. the test harness picks its backend explicitly;
  2. `db:migrate`;
  3. the default flip, with `api`/`dev` running `db:migrate --if-missing` (plan steps 1 and 2);
  4. Playwright;
  5. the docs.
- **The test harness (decided with the user, 2026-11-11).**
  - `config.DEFAULT_PERSISTENCE` is the one default. `test/helpers/backend.js` takes an unset `PERSISTENCE` from it and writes the result back into `process.env`, so the harness and the app can't disagree, and a bare `node --test <file>` now runs on SQLite, like the app.
  - `npm run test:api` and `test:api:update` name json explicitly (`test/tools/test-api.js json`) until Phase 8.
  - **Snapshot updates must run on json.** `--test-update-snapshots` rewrites each snapshot file from the tests that ran, so a skipped test's entries are dropped (checked with a scratch test). A file in which every test is skipped isn't rewritten, so `sqlite-trace` survives a json update. An update on sqlite would drop the json-only entries of the mixed characterization files.
- **`db:migrate` lives in `persistence/sqlite/import.js`** (`buildDatabase`, `databaseExists`), next to `importJson`. `server/scripts/db-migrate.js` has no `fs` or `better-sqlite3`. Exit codes: 0 built or skipped, 1 failed (nothing changed), 2 bad arguments (including `--force` with `--if-missing`).
- **`--force` builds before it deletes.** The plan says "`--force` deletes and rebuilds it". Instead, the new database is built at `<dbPath>.tmp-<timestamp>` first, so JSON the import refuses (a BOM, an unknown collection) leaves the old database untouched. Only then are the old files deleted and the new one renamed into place.
- **The in-use check** (Risks, "Windows file locks"): before deleting, `--force` opens the old database with no busy wait and runs `PRAGMA journal_mode = DELETE`. Leaving WAL needs every other connection closed, so this fails at once with `SQLITE_BUSY` while a server holds it, even an idle one. It then exits 1 with "… is open in another process (is the API server running?) …; nothing was changed".
  - This was checked on Windows with a second process, with a real `npm run api` on a temp copy, and in the tests.
  - On Windows, deleting an open file fails too (`EBUSY`, also reported clearly). On Linux and macOS it would succeed, and the server would keep writing to the deleted file; the check prevents that.
  - A file that isn't a database at all doesn't block `--force`.
- **Stray `-wal`/`-shm` files without a database** block a plain build and `--if-missing` (SQLite would read a stale `-wal` into the new file). `--force` deletes them. The plan doesn't mention them.
- **The missing-database 500 now says "Build it from the JSON files with npm run db:migrate"** instead of naming `import.js`. No snapshot holds that text; `paths.test.js` matches only its `No SQLite database at` prefix.
- **Playwright: no `globalSetup` (decided with the user).** Playwright 1.63 starts its webServers before `globalSetup` (`createGlobalSetupTasks`), so a globalSetup can't prepare the API's `DATA_DIR`.
  - The API webServer's command is `node test/tools/e2e-data.js && npm run api`, with `env: { DATA_DIR: <os tmp>/song-tracker-e2e-data }`.
  - `e2e-data.js` empties that folder and copies `server/data` into it without databases, backups or temp files. It refuses any `DATA_DIR` that isn't strictly inside the OS temp directory. `npm run api`'s `--if-missing` then builds the database: the fresh-clone path.
  - The folder stays after a run, because the server holds it open until Playwright stops it; the next run empties it.
- **The API webServer is never reused** (`reuseExistingServer: false`, decided with the user). With reuse, a developer's own API on :3000 would have taken the specs' writes. Playwright now stops with "… is already used" instead (checked against a running API: no spec ran). `ng serve` is still reused.
- **E2E, checked locally.** `npx playwright test` (Chromium) passed all 78 specs against the e2e API on its own data. The developer's `server/data/dashboard.sqlite` kept its timestamp, and `git status server/data` stayed clean; the run's writes went to the temp copy's `-wal`. Playwright stops its API by killing it, so the temp folder keeps a `-wal`/`-shm`; the next run's `e2e-data.js` wipes the folder first. Earlier, with the developer's own API on :3000, Playwright stopped with "is already used" before any spec ran.
- **The five e2e spec headers** that said the specs write to the real `db.json` were corrected (comments only).
- **Baseline counts include a `dist/` skip.** `a built dist/ asset is served byte-for-byte` skips when `dist/` isn't built, as it wasn't on this machine. The baselines were therefore 676/3, 598/76 and 579/78, and the Phase 5 counts above assume a built `dist/`.
- **A clean clone only installs with npm 12.** A fresh-clone check of the new README found that `npm ci` and `npm install` fail with npm 10.9.8 (bundled with Node 22), 10.9.10 and 11.21.2.
  - npm's lockfile installs ignore `better-sqlite3`'s `"gypfile": false`: arborist's `rebuild.js` reads `gypfile` from the lockfile entry, which never stores it. They then run `node-gyp rebuild`, which needs Visual Studio's C++ tools.
  - npm 12.2.2 installs it with nothing compiled. It also passes the clean clone's `npm run api` (database built on first start), `ng serve`, a headless browser load, and `npm run test:api:sqlite`.
  - Phase 0 step 2's "no install script, … no compiler" holds only for `npm install <pkg>`, which uses the registry manifest. Developers who already have `node_modules`, or the C++ tools (as the `run-npm-install*.cmd` scripts assume), weren't affected.
  - **The fix is docs only, decided with the user:** install with `npx npm@12 ci`. No dependency, `engines` or `.npmrc` change.
- **Phase 7's soak period is 1–2 days**, decided with the user at cutover (2026-11-11).
- **Real data, checked by hand** in a temp copy of `develop`'s JSON. `db:migrate` reports 98 roster rows, 13 sprints, 16 retros, 18 capacity entries, 325 attendance rows (36 dropped), 12 attendance options, 2 office locations, 11 labels, 5 boards, 16 buckets, 96 tasks, 0 deletion logs, 0 reachouts and 13 competency rows, with the 3 dead keys skipped. `--if-missing` is a no-op, and a second plain run refuses. `--force` refuses while `npm run api` runs and succeeds after it stops, cleaning up the killed server's `-wal`/`-shm`. A fresh `npm run api` with `PERSISTENCE` unset builds the database and serves it.

### Phase 8

The Phase 7 soak passed with no fallback (confirmed by the user before Phase 8 started). Existing snapshot entries changed only as the snapshot rule allows for this phase: 70 json-only characterization entries were deleted (plus `fs-trace`'s 9, with its file), and `sqlite-trace` entries changed only in the three clean-up commits (2, 3 and 1 entries), each reviewed. 28 entries were added, add-only, before the clean-ups. No response or stored-data entry changed.

- **Step order.** Steps 1–5 in the plan's order, then one commit tightening `fs-boundary` (it could only list the files that need `fs` once `export.js` was gone in step 5), then the docs. Each step's deletions are in their own commits:
  1. step 1: delete the leaf files (`fs-trace`, `json-format`, `verify-storage-snapshots.js`); serve only from SQLite and drop the json-only tests (logic); delete `persistence/json/`, `select-store.js`, `test/helpers/backend.js` and the fixture `custom.csv`; delete `server/data/custom.csv`;
  2. step 2: `npm run json-api` and the json-server references;
  3. step 3: found-bugs;
  4. step 4: each clean-up as an add-only commit of new entries, then the change;
  5. step 5: the `db:export` script (logic), then the export's files.
- **`fs-trace` is deleted entirely (decided with the user)**, including its scenarios for the files that stay on JSON (legacy tasks, the fruits test bench, and "routes that touch no data file"). Their fs calls are no longer pinned; their behaviour still is (characterization, `no-read-cache`).
- **More json-only tests than the plan names.** Besides the tagged json-only tests, these pinned the JSON backend and went:
  - the json half of `backend-differences` (L18);
  - the json round trip;
  - `store-interface`'s db.json unit of work and store-switch tests;
  - `paths`' five `PERSISTENCE` tests;
  - the custom.csv fixture-integrity test.

  Plain tests were ported or added (no snapshots):
  - the harness's "writes never touch server/data" (now: no file under `server/data` changes) and "beforeStart reshapes the data" (now: it edits the seed before the build);
  - "a leftover `PERSISTENCE` (json, SQLite) is ignored";
  - "every feature repository is its SQLite store".
- **Three "not found" categories lost every case** (GET skill options, GET and POST onboarding resources: a missing or corrupt roster file). They're `notApplicable` now, which adds 3 skips and no entry.
- **The feature repositories export their store directly**, so it's loaded with the app instead of on every call. The harness still refuses a second open app (both would share DATA_DIR and the module cache `store-dump.js` reads).
- **`config` drops more than `PERSISTENCE`**: `dbPath`, `onboardingCsvPath` and `onboardingJsonPath` were only the JSON backend's. `nextId()` went with the JSON stores.
- **Test scripts (decided with the user).** `test:api` and `test:api:update` run every test, with no backend argument (`test/tools/test-api.js`). `test:api:sqlite` and `test:api:exported` are gone. The second ran the JSON backend on exported fixtures, so it had nothing left to run, and the export went in step 5. With no skipped test holding snapshot entries, `test:api:update` can't drop entries any more.
- **A leftover `PERSISTENCE` is ignored (decided with the user).** Config has no such key, and any value (`json`, or `SQLite`, which used to throw) loads the app on SQLite. The missing-database 500 lost " (PERSISTENCE=sqlite)"; no snapshot held it.
- **`custom.csv` is deleted (decided with the user):** `server/data/custom.csv` (a training-progress sheet since the initial commit, read only by the JSON backend's CSV seeding) and the fixture copy.
- **Step 3.** Each bug was checked first, on a temp copy of `origin/develop`'s seed with the server on SQLite (11 checks):
  - **M3:** the roster, skill options and competency still return 200 with the seed corrupted after the build, and `db:migrate --force` refuses the corrupt seed;
  - **M15:** the import refuses a fractional id, and new ids are integers;
  - **L8 (roster part):** roster GETs and a POST change no file;
  - **L9:** an upserted legacy record has one key per field;
  - **L14:** no CSV code is left.

  Evidence that named deleted tests now names surviving ones. **New bug L20:** the POC how-to page undoes an Edit click when that tab's HTML arrives after it, which makes `tests/poc-howto/poc-howto.spec.ts` flaky. It's reproduced on `develop` (`c836b08`), frontend-only, and not fixed.
- **Step 4: all three clean-ups (decided with the user).** Each has an add-only commit first, with cases recorded on the code before it, so the SQL had to reproduce the JS semantics exactly:
  - **Onboarding** (2 entries): the store gets `findById`/`findByEid`. POST's upsert and PATCH's lookup and 409 check use them instead of reading the whole roster.
  - **Competency** (8 entries): the store gets `listGroupRecords`, one `LEFT JOIN` of the roster and the saved rows with `WHERE IFNULL(group_number, 0) = ?`, which keeps L17 (a member with no group is in group 0).
    - It joins by exact eid, which keeps M9.
    - It's the one place SQL crosses features. The service no longer reads onboarding's repository.
  - **List filters** (18 entries): `WHERE` clauses, with the services still computing the JS value (`Number()`, `String()`, the truthy checks) and binding it.
    - Buckets and tasks compare `board_id` as it's listed (NULL or an infinity lists as 0).
    - Capacity and deletion logs compare ANY columns, where a number and the same digits as text stay apart, and a repeated parameter binds NULL.
    - Reachouts compare `IFNULL(CAST(group_number AS TEXT), 'null')`.
    - Attendance uses `js_number()`, a JS function registered on the server's connection only, which returns what `Number()` of the listed value was: text converts, NULL matches nothing, and an infinity counts as 0.
  - **Real data:** on a copy of `origin/develop`'s seed, 184 filtered GETs return byte-identical responses before the clean-ups (`9019b61`) and after.
- **Step 5: the seed stays JSON, and the export goes (decided with the user).** The committed `db.json` + `custom-onboarding.json` and `import.js` stay as the seed loader. `export.js`, `db:export`, their tests, `exported-fixtures.js` and the round-trip tests (every round trip went through the export) are deleted. A backup is a copy of `dashboard.sqlite` with its `-wal`, taken with the server stopped. `.gitignore` still ignores `server/data/*.bak-*`, so backups made before Phase 8 stay out of git.
- **`fs-boundary` lists files, not a directory.**
  - `fs`: the tasks and fruits repositories, `sqlite/import.js` and `sqlite/migrations.js`, plus `middleware/static.js`.
  - `better-sqlite3`: `sqlite/connection.js` and `sqlite/import.js`.

  Each entry must still exist and still need it. Adding `require('fs')` to `sqlite/tables.js` fails it.
- **E2E.** After step 1, `npx playwright test` passed 76 of 78. The 2 failures were `poc-howto` specs (L20), and the same spec also failed on `develop`. At the end (`de3b87b` plus the docs), all 78 passed. Both runs had nothing on :3000, and the e2e API ran on its own temp copy of the seed.
- **Clean clone.** A clone of the branch at `de3b87b` (the last code commit) installed with `npx npm@12 ci` (npm 12.2.2, 71 s, nothing compiled). `npm run api` on a temp `DATA_DIR` copy of its seed built the database on the first start (98 roster rows, 13 sprints, 16 retros, 18 capacity entries, 325 attendance rows, 12 options, 2 office locations, 11 labels, 5 boards, 16 buckets, 96 tasks, 0 deletion logs, 0 reachouts, 13 competency rows) and served `GET /api/onboarding-resources` with 98 rows.
- **Counts:** `npm run test:api` passes 616 and skips 4 on a machine without a built `dist/`. The baseline was `test:api` 689/3 (json), `test:api:sqlite` 611/76 and `test:api:exported` 592/78.
