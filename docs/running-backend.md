# Running the Backend Locally

How to get the Express API in `server/` running from a fresh clone. I tested this on 2026-11-06 with Node 22.23.2 and npm 10.9.8 on Windows 11, using a copy of `server/` so the repo's data wasn't touched.

For what the API does (routes, middleware, payloads), see [backend-overview.md](backend-overview.md).

---

## TL;DR

```bash
npm ci                 # from the repo root, not from server/
npm run api            # first run: "Built …/dashboard.sqlite …", then "API running on http://127.0.0.1:3000"
curl http://localhost:3000/api/health   # → {"ok":true}
```

That's all you need. There are no env vars to set and no build step for the server. The database is a local SQLite file that `npm run api` builds from the committed JSON the first time (§5).

---

## 1. Prerequisites

| Requirement | Version | Why |
|---|---|---|
| Node.js | **22 LTS recommended** (Express 5 needs ≥ 18) | The README standardises on 22, because `npm run dev` (concurrently 10) and Playwright need it |
| npm | Whatever ships with Node 22 (10.x) | The lockfile is npm's |

You **don't** need Visual Studio Build Tools, Python, or node-gyp. The one native dependency, `better-sqlite3` 13, ships prebuilt binaries for Windows, macOS and Linux (x64 and arm64) inside its npm package, so `npm ci` compiles nothing. Ignore the `run-npm-install.cmd` / `run-npm-install2.cmd` scripts in the root:
- they delete `node_modules` and `package-lock.json`;
- they require Visual Studio Build Tools at a fixed path;
- they point npm at another developer's `node-gyp` (`C:\Users\michael.bobis\…`);
- they set up a native compile that isn't needed.

## 2. Install

The server has **no `package.json` of its own**. Its runtime dependencies, `express@^5.2.1`, `cors@^2.8.6` and `better-sqlite3@13.0.3` (pinned exactly; the default SQLite backend, see the [SQLite migration](sqlite-migration-plan.md)), are in the root `package.json` together with the Angular app, so install from the repo root:

```bash
cd song-tracker
npm ci          # exact versions from package-lock.json; use `npm install` if you're changing deps
```

This installs the Angular toolchain too. No smaller install for just the server is set up.

## 3. Start

From the repo root, use one of these:

| Command | What it runs |
|---|---|
| `npm run api` | `node server/scripts/db-migrate.js --if-missing` (builds `dashboard.sqlite` if there's none, §5), then `node server/server.js`, the API alone on :3000 |
| `node server/server.js` | The API without the database check. With no database, every data route returns 500 until you run `npm run db:migrate` |
| `npm run dev` | The same database check, then API **and** `ng serve` (:4200) together via `concurrently`, with logs prefixed `api` / `web` |

When it starts successfully you'll see, after the database check's line ("Built …" with the rows per table on the first start, "already exists; nothing to do (--if-missing)" after that):

```
API running on http://127.0.0.1:3000
```

The README quotes "Server listening on port 3000". That message is wrong; the line above is what the server prints.

To stop it, press `Ctrl+C`. It has no graceful-shutdown handling and doesn't need any, because every write finishes synchronously inside the request that makes it (one transaction on SQLite).

**There's no hot reload.** Restart the process after editing anything under `server/`. If you want auto-restart, Node 22's built-in watcher works and needs no extra install: `node --watch server/server.js`.

### Verify

```bash
curl http://localhost:3000/api/health                 # {"ok":true}
curl http://localhost:3000/api/onboarding-resources   # JSON array of resources (~45 KB)
```

`/api/health` doesn't read any files, so it's the safest check.

### Using it with the frontend

Run `npm start` in a second terminal (or use `npm run dev` above) and open http://localhost:4200. When the page is on port 4200 or 4201, the Angular app calls `http://localhost:3000`.

To have Express serve the UI as well (a single process on :3000):

```bash
npm run build      # outputs dist/atcp-song-dashboard/browser/
npm run api        # now http://localhost:3000/ serves the app too
```

Without a build, `/` returns a 404, but the API still works.

## 4. Environment variables

| Variable | Required | Default | Effect |
|---|---|---|---|
| `PORT` | No | `3000` | Port the API listens on |
| `DATA_DIR` | No | `server/data` | Folder that holds the data files. A relative path resolves against the working directory. The API tests point it at a temp copy |
| `PERSISTENCE` | No | `sqlite` | Storage backend, `sqlite` or `json`. With `sqlite` the dashboard data comes from `DATA_DIR/dashboard.sqlite`, which `npm run api`/`npm run dev` build if it's missing (`npm run db:migrate`, §5). Without it, every route that reads or writes stored data returns 500 naming the missing file. `json` is the fallback (§6) until Phase 8 of the [migration plan](sqlite-migration-plan.md) removes it. `/api/tasks` and `/api/fruits` stay on their JSON files either way. Any other value stops the server from starting |

All three are read once, in `server/config/index.js`. There's no `.env` loading, no config file, no secrets, and no API keys.

To change the port:

```bash
PORT=4000 npm run api              # Git Bash / macOS / Linux
$env:PORT = 4000; npm run api      # PowerShell
set PORT=4000 && npm run api       # cmd.exe
```

> ⚠️ The dev frontend has `http://localhost:3000` hard-coded in `src/envinronments/environment.development.ts`. If you change `PORT`, `ng serve` on :4200 won't find the API unless you also edit that file. Changing the port is only harmless when Express is serving the built UI itself, because the UI then uses relative URLs.

If something already holds port 3000, the server crashes on startup with `EADDRINUSE`. This often happens when `npm run json-api` (json-server) is still running. Stop the other process or set `PORT`.

## 5. Where the data lives

Since the cutover (Phase 6 of [sqlite-migration-plan.md](sqlite-migration-plan.md)), the dashboard data lives in **`server/data/dashboard.sqlite`**, a SQLite database on your machine. It's gitignored, so **every developer has their own copy, and your UI edits stay local.** The JSON files in `server/data/` that are committed to git are only the **seed** the database is built from, and the format of the JSON fallback (§6).

| File | In git? | What uses it | Notes |
|---|---|---|---|
| `server/data/dashboard.sqlite` (+ `-wal`, `-shm` while the server runs) | ❌ | Every dashboard route: onboarding resources, sprints, retros, capacity, attendance, office locations, planner, deletion logs, reachouts, competency records | Built by `npm run db:migrate` (below). Every save in the UI lands here |
| `server/data/db.json` | ✅ | The seed for everything but the roster; the live data only with `PERSISTENCE=json` | Its `onboarding-resources` and `dashboard` keys are stale; the import skips them |
| `server/data/custom-onboarding.json` | ✅ | The seed for the resource roster; the live roster only with `PERSISTENCE=json` | **Don't delete it**: `db:migrate` needs it, and the JSON backend reseeds it badly (see below) |
| `server/data/tasks.json` | ❌ | Legacy `/api/tasks` endpoints | Not in the repo. It's created with one seed task the first time something calls `GET /api/tasks`. Stays on JSON |
| `server/data/custom.csv` | ✅ | Seed source for `custom-onboarding.json` on the JSON backend | See the warning below |
| `server/data/test_bwd/db.json` | ✅ | `/api/fruits` test bench | Unrelated to the dashboard. Stays on JSON |
| `attendance.json`, `attendance-options.json`, `routes.json`, `*.xlsx`, `groupings name` | ✅ | Nothing in the Express server | Leftovers / reference material |

Dashboard content (`/api/dashboard`, which includes the sidebar nav) isn't stored in a file. It's hard-coded in `server/features/dashboard/dashboard.service.js`.

### Build, reset and back up the database

```bash
npm run db:migrate              # build server/data/dashboard.sqlite from the JSON seed (refuses if it exists)
npm run db:migrate -- --force   # reset: rebuild it from the JSON seed, discarding every change made since
npm run db:export               # back up: write it out as db.json + custom-onboarding.json (originals → *.bak-<ts>)
npm run db:export -- --out ../my-backup   # …or into another folder, leaving server/data's JSON alone
```

- **You rarely need `db:migrate` yourself.** `npm run api` and `npm run dev` run `db:migrate --if-missing` before they start, which builds the database when there's none (a fresh clone, or after you deleted it) and does nothing otherwise.
- **It prints what it built:** the rows per table, the attendance rows it dropped (the 36 with random json-server ids, decision 6 of the plan) and the stale keys it skipped.
- **`--force` needs the server stopped.** It builds the new database first, so a seed it can't read leaves your old one untouched. It then refuses while another process has the old one open, with "… is open in another process (is the API server running?)". Stop the server (`Ctrl+C`) and run it again.
- **`--force` discards your local edits.** Back them up first with `npm run db:export -- --out <folder>` if you might want them.
- **To pick up a change to the seed** (someone committed new JSON), pull, stop the server, and run `npm run db:migrate -- --force`. Your database never changes on its own when the JSON changes.
- **To share data with the team**, edit the committed JSON (in your editor or with Node, never PowerShell) and commit it; everyone then rebuilds with `--force`. Saving it in the UI only changes your own database.

### Things that will bite you

- **The committed JSON doesn't change when you use the app**, so `git diff server/data` stays clean. It changes only when you edit it, run on the JSON fallback (§6), export into `server/data` with `db:export`, or use `npm run json-api`. After any of those, check `git diff server/data` before you commit, and leave those files out unless the data change is intentional. The `*.bak-*` backups are gitignored.
- **Resetting data:** `npm run db:migrate -- --force` (above). On the JSON fallback, `git checkout -- server/data/db.json server/data/custom-onboarding.json` restores the committed files. You can also delete `server/data/tasks.json`, which isn't tracked.
- **Don't delete `custom-onboarding.json` to "reset" it.** `db:migrate` then stops with "custom-onboarding.json is missing", and the JSON backend reseeds it from `custom.csv`. That CSV is now a training-progress sheet rather than the `EID,GROUP,Primary Skill` layout the seeder expects. I tested this on a copy: it produces 41 records that are all named `Unknown` with eid `unknown` and no group. Restore the file from git instead.
- **Never edit the JSON files with PowerShell** (`ConvertTo-Json`, `Set-Content`, `Out-File`). They add a UTF-8 BOM. `JSON.parse` then fails: `db:migrate` stops with "db.json is not valid JSON", and on the JSON backend every `db.json` endpoint returns a 500 until the file is fixed. Nothing is written over it. Edit them in your editor or with Node instead.
- **Run only one server per data folder.** Never run the API on SQLite and on JSON against the same `DATA_DIR` at once. `npm run json-api` (json-server) writes `db.json` on port 3000 too; running it alongside the Express server means an `EADDRINUSE` crash, or lost writes on the JSON backend.
- **E2E runs use their own data.** `npx playwright test` starts the API on a fresh copy of the seed in `<os temp>/song-tracker-e2e-data`, never on `server/data`. It stops with "http://localhost:3000/… is already used" if your own API is running; stop it first.
- **The server is reachable from your network.** It listens on all interfaces, even though the log line says `127.0.0.1`, with no auth and CORS open to every origin. Be careful on shared networks.

## 6. Falling back to the JSON backend

The [SQLite migration](sqlite-migration-plan.md) keeps the JSON backend as a temporary fallback (decision 7) until Phase 8 removes it. To fall back, you write the SQLite data out as JSON files and start the server on them with `PERSISTENCE=json`. SQLite has been the default since the cutover (Phase 6); the soak period with this fallback available (Phase 7) is 1–2 days.

### Switch to JSON

1. **Stop the server** (`Ctrl+C`). Never run the API on JSON and on SQLite against the same `DATA_DIR` at once, or `npm run json-api` alongside either.
2. **Export:**

   ```bash
   npm run db:export                           # DATA_DIR/dashboard.sqlite → DATA_DIR/db.json + custom-onboarding.json
   npm run db:export -- --out ../json-copy     # or into another folder (relative to the repo root)
   ```

   It prints the rows per collection, the files it wrote and the backups it made. Before it replaces a file, it copies it to `<file>.bak-<timestamp>` next to it (these are gitignored in `server/data`). If there's no `dashboard.sqlite`, or the file is empty, it stops with exit code 1 and writes nothing.
3. **Start on JSON:**

   ```bash
   PERSISTENCE=json npm run api                # Git Bash / macOS / Linux
   $env:PERSISTENCE = 'json'; npm run api      # PowerShell
   set PERSISTENCE=json && npm run api         # cmd.exe
   ```

   `npm run api` still runs its database check first. The database is still there, so it prints "already exists; nothing to do" and leaves it alone; the JSON server never reads it.
4. **Check it:** `curl http://localhost:3000/api/health` returns `{"ok":true}`, and `curl http://localhost:3000/api/sprints` lists the same sprints as before the switch.

### Switch back to SQLite

Anything written while you were on JSON is only in the JSON files, so rebuild the database from them:

1. Stop the server.
2. **Rebuild:**

   ```bash
   npm run db:migrate -- --force    # DATA_DIR's db.json + custom-onboarding.json → a new DATA_DIR/dashboard.sqlite
   ```

   It builds the new database first and only then replaces the old one (with its `-wal`/`-shm`), so if the JSON can't be imported (e.g. a BOM), it stops with exit code 1 and the old database is untouched. It also refuses while another process has the database open. It prints the rows per table; compare them with what you expect.
3. Start the server on SQLite again: `npm run api`, with `PERSISTENCE` unset. In PowerShell, `Remove-Item Env:PERSISTENCE` clears a value you set earlier in the session.

### What the exported files look like

They hold the same data the SQLite backend serves (every GET returns the same body on both backends), but they aren't the files you started from:

- `db.json` has all 13 collections, in a fixed order, with empty ones written as `[]`. The dead keys `onboarding-resources`, `dashboard` and `$schema` are gone, because the import never copied them into SQLite.
- Every id is a number (the committed `db.json` has some `"1"`-style ids). The 36 attendance rows with random json-server ids are gone; the import dropped them.
- Every roster record has its camelCase fields in one order, plus `created_at`/`updated_at`, newest first. Legacy snake_case and mixed records are rewritten that way. As a result, the order of members on the myCompetency page can change, which is harmless.
- So after a fallback, `git diff server/data` is large. Don't commit it by accident.
- A few values can't make the round trip, because the SQLite backend never held them the way `db.json` did (bug L18 in [found-bugs.md](found-bugs.md)). They come out the way SQLite reads them: a `null` sent for an optional field is missing, a task's `completed` is a boolean, and an `Infinity` (e.g. `1e999` in a request) is `null`. No page sends any of these, and neither the fixtures nor `develop`'s data has any, so the round-trip tests can't catch them.

### Undoing an export

The backups are the files exactly as they were. To go back to them, stop the server and copy each `<file>.bak-<timestamp>` over `<file>`, in your editor, file manager or with Node (`node -e "require('fs').copyFileSync('server/data/db.json.bak-…', 'server/data/db.json')"`). Delete the backups once you don't need them.

**Never edit the exported files with PowerShell** (`Set-Content`, `Out-File`, `ConvertTo-Json`). A BOM no longer wipes data, but every `db.json` route then returns 500 until the file is fixed.

## 7. Quick troubleshooting

| Symptom | Likely cause |
|---|---|
| `Error: Cannot find module 'express'` | You haven't run `npm ci` in the repo root yet, or you're running from a directory that can't see the root `node_modules` |
| `EADDRINUSE :::3000` | Another process (often json-server, or a previous `npm run api`) is on 3000 |
| Every `db.json` endpoint returns 500 "db.json is not valid JSON" | `db.json` is invalid JSON, most likely because of a BOM. Run `node -e "JSON.parse(require('fs').readFileSync('server/data/db.json','utf8'))"` to see the parse error |
| Resources list is full of `Unknown` | `custom-onboarding.json` was deleted and reseeded from the CSV. Run `git checkout -- server/data/custom-onboarding.json` |
| UI on :4200 loads but has no data | The API isn't running on **3000** specifically (see the `PORT` warning above) |
| GET `/api/something-new` returns HTML | That route doesn't exist. The SPA catch-all serves `index.html` whenever `dist/` has been built, and returns a 404 when it hasn't |
| `db:export failed: No SQLite database at …` | There's no `dashboard.sqlite` in `DATA_DIR`: it was never built, or `DATA_DIR` points somewhere else. Nothing was written |
| `db:export failed: … has no dashboard schema` | `dashboard.sqlite` exists but is empty. Nothing was written |
| `db:export failed: ….bak-… already exists` | A backup with the same timestamp is already there. Nothing was overwritten; run the export again |
| Every route returns 500 `No SQLite database at …` | There's no `dashboard.sqlite` in `DATA_DIR`, and the server was started without its database check (`node server/server.js` rather than `npm run api`). Run `npm run db:migrate` and start it again |
| `db:migrate failed: … already exists; nothing was changed` | You ran `npm run db:migrate` without `--force` and there's already a database. Nothing to do, or run `npm run db:migrate -- --force` to rebuild it (discarding your local edits) |
| `db:migrate failed: … is open in another process (is the API server running?)` | A server (or a database browser) has `dashboard.sqlite` open. Stop it and run `--force` again. Nothing was changed |
| `db:migrate failed: dashboard.sqlite-wal … belong to no database` | `dashboard.sqlite` was deleted but its `-wal`/`-shm` files weren't. `npm run api` refuses too. Run `npm run db:migrate -- --force`, which deletes them and builds the database |
| `db:migrate failed: custom-onboarding.json is missing …` or `… is not valid JSON` | The seed is missing or damaged (e.g. a BOM). Restore it with `git checkout -- server/data/<file>`. Nothing was changed |
| `npx playwright test` stops with `http://localhost:3000/… is already used` | Your own API is running on :3000. The e2e API never reuses it, so the specs can't write into your database; stop it and run the specs again |
