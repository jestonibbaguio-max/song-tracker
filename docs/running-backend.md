# Running the Backend Locally

How to get the Express API in `server/` running from a fresh clone. I tested this on 2026-11-06 with Node 22.23.2 and npm 10.9.8 on Windows 11, using a copy of `server/` so the repo's data wasn't touched.

For what the API does (routes, middleware, payloads), see [backend-overview.md](backend-overview.md).

---

## TL;DR

```bash
npx npm@12 ci          # from the repo root, not from server/; npm 12, see §1
npm run api            # first run: "Built …/dashboard.sqlite …", then "API running on http://127.0.0.1:3000"
curl http://localhost:3000/api/health   # → {"ok":true}
```

That's all you need. There are no env vars to set and no build step for the server. The database is a local SQLite file that `npm run api` builds from the committed JSON the first time (§5).

---

## 1. Prerequisites

| Requirement | Version | Why |
|---|---|---|
| Node.js | **22 LTS recommended** (Express 5 needs ≥ 18) | The README standardises on 22, because `npm run dev` (concurrently 10) and Playwright need it |
| npm | **12 for installing** (`npx npm@12 ci`); the bundled 10.x for everything else | npm 10 and 11 try to compile `better-sqlite3` when they install from the lockfile (below) |

You **don't** need Visual Studio Build Tools, Python, or node-gyp, **as long as you install with npm 12**. The one native dependency, `better-sqlite3` 13, ships prebuilt binaries for Windows, macOS and Linux (x64 and arm64) inside its npm package and sets `"gypfile": false`. npm 10 and 11 ignore that setting when they install from `package-lock.json` (`npm ci`, or `npm install` into an empty `node_modules`) and run `node-gyp rebuild`, which fails with "You need to install the latest version of Visual Studio" unless the C++ build tools are installed. npm 12 honours it and compiles nothing. Checked on 2026-11-11 from a clean clone: npm 10.9.8, 10.9.10 and 11.21.2 fail, npm 12.2.2 installs in about a minute. Ignore the `run-npm-install.cmd` / `run-npm-install2.cmd` scripts in the root:
- they delete `node_modules` and `package-lock.json`;
- they require Visual Studio Build Tools at a fixed path;
- they point npm at another developer's `node-gyp` (`C:\Users\michael.bobis\…`);
- they set up a native compile that isn't needed.

## 2. Install

The server has **no `package.json` of its own**. Its runtime dependencies, `express@^5.2.1`, `cors@^2.8.6` and `better-sqlite3@13.0.3` (pinned exactly; the default SQLite backend, see the [SQLite migration](sqlite-migration-plan.md)), are in the root `package.json` together with the Angular app, so install from the repo root:

```bash
cd song-tracker
npx npm@12 ci   # exact versions from package-lock.json, installed with npm 12 (no global change)
```

This installs the Angular toolchain too. No smaller install for just the server is set up. To use npm 12 for every install instead, upgrade once with `npm install -g npm@12`, then `npm ci`.

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

Both are read once, in `server/config/index.js`. The dashboard data always comes from `DATA_DIR/dashboard.sqlite` (§5). The `PERSISTENCE` variable that chose the JSON fallback was removed in Phase 8 of the [migration plan](sqlite-migration-plan.md); if it's still set in your shell, it's ignored. There's no `.env` loading, no config file, no secrets, and no API keys.

To change the port:

```bash
PORT=4000 npm run api              # Git Bash / macOS / Linux
$env:PORT = 4000; npm run api      # PowerShell
set PORT=4000 && npm run api       # cmd.exe
```

> ⚠️ The dev frontend has `http://localhost:3000` hard-coded in `src/envinronments/environment.development.ts`. If you change `PORT`, `ng serve` on :4200 won't find the API unless you also edit that file. Changing the port is only harmless when Express is serving the built UI itself, because the UI then uses relative URLs.

If something already holds port 3000, the server crashes on startup with `EADDRINUSE`. This often happens when a previous `npm run api` is still running. Stop the other process or set `PORT`.

## 5. Where the data lives

Since the cutover (Phase 6 of [sqlite-migration-plan.md](sqlite-migration-plan.md)), the dashboard data lives in **`server/data/dashboard.sqlite`**, a SQLite database on your machine. It's gitignored, so **every developer has their own copy, and your UI edits stay local.** The JSON files in `server/data/` that are committed to git are only the **seed** the database is built from; the API never reads or writes them.

| File | In git? | What uses it | Notes |
|---|---|---|---|
| `server/data/dashboard.sqlite` (+ `-wal`, `-shm` while the server runs) | ❌ | Every dashboard route: onboarding resources, sprints, retros, capacity, attendance, office locations, planner, deletion logs, reachouts, competency records | Built by `npm run db:migrate` (below). Every save in the UI lands here |
| `server/data/db.json` | ✅ | The seed for everything but the roster (`db:migrate` only) | Its `onboarding-resources` and `dashboard` keys are stale; the import skips them |
| `server/data/custom-onboarding.json` | ✅ | The seed for the resource roster (`db:migrate` only) | **Don't delete it**: `db:migrate` needs it (see below) |
| `server/data/tasks.json` | ❌ | Legacy `/api/tasks` endpoints | Not in the repo. It's created with one seed task the first time something calls `GET /api/tasks`. Stays on JSON |
| `server/data/test_bwd/db.json` | ✅ | `/api/fruits` test bench | Unrelated to the dashboard. Stays on JSON |
| `attendance.json`, `attendance-options.json`, `routes.json`, `*.xlsx`, `groupings name` | ✅ | Nothing in the Express server | Leftovers / reference material |

Dashboard content (`/api/dashboard`, which includes the sidebar nav) isn't stored in a file. It's hard-coded in `server/features/dashboard/dashboard.service.js`.

### Build, reset and back up the database

```bash
npm run db:migrate              # build server/data/dashboard.sqlite from the JSON seed (refuses if it exists)
npm run db:migrate -- --force   # reset: rebuild it from the JSON seed, discarding every change made since
```

- **You rarely need `db:migrate` yourself.** `npm run api` and `npm run dev` run `db:migrate --if-missing` before they start, which builds the database when there's none (a fresh clone, or after you deleted it) and does nothing otherwise.
- **It prints what it built:** the rows per table, the attendance rows it dropped (the 36 with random json-server ids, decision 6 of the plan) and the stale keys it skipped.
- **`--force` needs the server stopped.** It builds the new database first, so a seed it can't read leaves your old one untouched. It then refuses while another process has the old one open, with "… is open in another process (is the API server running?)". Stop the server (`Ctrl+C`) and run it again.
- **`--force` discards your local edits.** Back the database up first (next point) if you might want them.
- **To back up your data**, stop the server (`Ctrl+C`) and copy `server/data/dashboard.sqlite` somewhere else, **together with `dashboard.sqlite-wal` if it exists**. `Ctrl+C` kills the server without closing the database, so its last writes may still be in the `-wal` file; SQLite reads them back when the two files are together. To restore, stop the server and copy the files back, deleting any `-wal` or `-shm` in `server/data` that isn't part of the backup. (`npm run db:export`, which wrote the data out as JSON, was removed in Phase 8 with the JSON fallback.)
- **To pick up a change to the seed** (someone committed new JSON), pull, stop the server, and run `npm run db:migrate -- --force`. Your database never changes on its own when the JSON changes.
- **To share data with the team**, edit the committed JSON (in your editor or with Node, never PowerShell) and commit it; everyone then rebuilds with `--force`. Saving it in the UI only changes your own database.

### Things that will bite you

- **The committed JSON doesn't change when you use the app**: the API never writes `db.json` or `custom-onboarding.json`, so a diff in them is a hand edit. The fruits test bench is the exception: `/api/fruits` writes the committed `server/data/test_bwd/db.json`. Backups that `npm run db:export` made before Phase 8 (`*.bak-*`) are gitignored; delete them when you don't need them.
- **Resetting data:** `npm run db:migrate -- --force` (above). You can also delete `server/data/tasks.json`, which isn't tracked.
- **Don't delete `custom-onboarding.json` to "reset" it.** `db:migrate` then stops with "custom-onboarding.json is missing" and builds nothing. Restore the file from git instead.
- **Never edit the JSON files with PowerShell** (`ConvertTo-Json`, `Set-Content`, `Out-File`). They add a UTF-8 BOM. `JSON.parse` then fails: `db:migrate` stops with "db.json is not valid JSON" and changes nothing until the file is fixed. Edit them in your editor or with Node instead.
- **Run only one server per data folder.** Two servers on the same `DATA_DIR` share the database (their writes wait for each other), and `db:migrate --force` refuses while any of them has it open.
- **E2E runs use their own data.** `npx playwright test` starts the API on a fresh copy of the seed in `<os temp>/song-tracker-e2e-data`, never on `server/data`. It stops with "http://localhost:3000/… is already used" if your own API is running; stop it first.
- **The server is reachable from your network.** It listens on all interfaces, even though the log line says `127.0.0.1`, with no auth and CORS open to every origin. Be careful on shared networks.

## 6. Quick troubleshooting

| Symptom | Likely cause |
|---|---|
| `Error: Cannot find module 'express'` | You haven't installed yet (`npx npm@12 ci` in the repo root), or you're running from a directory that can't see the root `node_modules` |
| Install fails: `gyp ERR! find VS … You need to install the latest version of Visual Studio` (path `node_modules\better-sqlite3`) | You installed with npm 10 or 11, which try to compile `better-sqlite3` (§1). Run `npx npm@12 ci` instead; no Visual Studio needed |
| `EADDRINUSE :::3000` | Another process (often a previous `npm run api`) is on 3000 |
| UI on :4200 loads but has no data | The API isn't running on **3000** specifically (see the `PORT` warning above) |
| GET `/api/something-new` returns HTML | That route doesn't exist. The SPA catch-all serves `index.html` whenever `dist/` has been built, and returns a 404 when it hasn't |
| Every route returns 500 `No SQLite database at …` | There's no `dashboard.sqlite` in `DATA_DIR`, and the server was started without its database check (`node server/server.js` rather than `npm run api`). Run `npm run db:migrate` and start it again |
| `db:migrate failed: … already exists; nothing was changed` | You ran `npm run db:migrate` without `--force` and there's already a database. Nothing to do, or run `npm run db:migrate -- --force` to rebuild it (discarding your local edits) |
| `db:migrate failed: … is open in another process (is the API server running?)` | A server (or a database browser) has `dashboard.sqlite` open. Stop it and run `--force` again. Nothing was changed |
| `db:migrate failed: dashboard.sqlite-wal … belong to no database` | `dashboard.sqlite` was deleted but its `-wal`/`-shm` files weren't. `npm run api` refuses too. Run `npm run db:migrate -- --force`, which deletes them and builds the database |
| `db:migrate failed: custom-onboarding.json is missing …` or `… is not valid JSON` | The seed is missing or damaged (e.g. a BOM). Restore it with `git checkout -- server/data/<file>`. `node -e "JSON.parse(require('fs').readFileSync('server/data/db.json','utf8'))"` shows the parse error. Nothing was changed |
| `npx playwright test` stops with `http://localhost:3000/… is already used` | Your own API is running on :3000. The e2e API never reuses it, so the specs can't write into your database; stop it and run the specs again |
