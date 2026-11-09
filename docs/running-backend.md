# Running the Backend Locally

How to get the Express API in `server/` running from a fresh clone. I tested this on 2026-11-06 with Node 22.23.2 and npm 10.9.8 on Windows 11, using a copy of `server/` so the repo's data wasn't touched.

For what the API does (routes, middleware, payloads), see [backend-overview.md](backend-overview.md).

---

## TL;DR

```bash
npm ci                 # from the repo root, not from server/
npm run api            # → "API running on http://127.0.0.1:3000"
curl http://localhost:3000/api/health   # → {"ok":true}
```

That's all you need. There are no env vars to set, no database to provision, and no build step for the server.

---

## 1. Prerequisites

| Requirement | Version | Why |
|---|---|---|
| Node.js | **22 LTS recommended** (Express 5 needs ≥ 18) | The README standardises on 22, because `npm run dev` (concurrently 10) and Playwright need it |
| npm | Whatever ships with Node 22 (10.x) | The lockfile is npm's |

You **don't** need Visual Studio Build Tools, Python, or node-gyp. The `run-npm-install.cmd` / `run-npm-install2.cmd` scripts in the root date from when `better-sqlite3` (a native module) was a dependency. It's no longer in `package.json` or `package-lock.json`, so ignore those scripts. They also delete `node_modules` and `package-lock.json` and point at another developer's machine paths.

## 2. Install

The server has **no `package.json` of its own**. Its only runtime dependencies, `express@^5.2.1` and `cors@^2.8.6`, are in the root `package.json` together with the Angular app, so install from the repo root:

```bash
cd song-tracker
npm ci          # exact versions from package-lock.json; use `npm install` if you're changing deps
```

This installs the Angular toolchain too. No smaller install for just the server is set up.

## 3. Start

From the repo root, use one of these:

| Command | What it runs |
|---|---|
| `npm run api` | `node server/server.js`, the API alone on :3000 |
| `node server/server.js` | Same thing, without npm |
| `npm run dev` | API **and** `ng serve` (:4200) together via `concurrently`, with logs prefixed `api` / `web` |

When it starts successfully you'll see:

```
API running on http://127.0.0.1:3000
```

The README quotes "Server listening on port 3000". That message is wrong; the line above is what the server prints.

To stop it, press `Ctrl+C`. It has no graceful-shutdown handling and doesn't need any, because every write finishes synchronously inside the request that makes it.

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

That's the only one. There's no `.env` loading, no config file, no secrets, and no API keys.

To change the port:

```bash
PORT=4000 npm run api              # Git Bash / macOS / Linux
$env:PORT = 4000; npm run api      # PowerShell
set PORT=4000 && npm run api       # cmd.exe
```

> ⚠️ The dev frontend has `http://localhost:3000` hard-coded in `src/envinronments/environment.development.ts`. If you change `PORT`, `ng serve` on :4200 won't find the API unless you also edit that file. Changing the port is only harmless when Express is serving the built UI itself, because the UI then uses relative URLs.

If something already holds port 3000, the server crashes on startup with `EADDRINUSE`. This often happens when `npm run json-api` (json-server) is still running. Stop the other process or set `PORT`.

## 5. Where the data lives

All data is plain JSON in **`server/data/`**. The server reads and rewrites these files synchronously on each request. There's no database yet; the move to SQLite is planned in [sqlite-migration-plan.md](sqlite-migration-plan.md).

| File | In git? | What uses it | Notes |
|---|---|---|---|
| `server/data/db.json` | ✅ | Sprints, sprint retros, capacity, attendance, office locations, planner (labels/boards/buckets/tasks), deletion logs, project reachouts, competency records | Most writes land here. Its `onboarding-resources` and `dashboard` keys are stale and the server ignores them |
| `server/data/custom-onboarding.json` | ✅ | Onboarding resources (`/api/onboarding-resources`, and group membership for `/api/competency-records`) | **The source of truth for the resource roster. Don't delete it** (see below) |
| `server/data/tasks.json` | ❌ | Legacy `/api/tasks` endpoints | Not in the repo. It's created with one seed task the first time something calls `GET /api/tasks` |
| `server/data/custom.csv` | ✅ | Seed source for `custom-onboarding.json` | See the warning below |
| `server/data/test_bwd/db.json` | ✅ | `/api/fruits` test bench | Unrelated to the dashboard |
| `attendance.json`, `attendance-options.json`, `routes.json`, `*.xlsx`, `groupings name` | ✅ | Nothing in the Express server | Leftovers / reference material |

Dashboard content (`/api/dashboard`, which includes the sidebar nav) isn't stored in a file. It's hard-coded in `server/features/dashboard/dashboard.service.js`.

### Things that will bite you

- **Your local edits change files that are committed to git.** Every save in the UI rewrites `db.json` or `custom-onboarding.json`. Check `git diff server/data` before you commit, and leave those files out unless the data change is intentional.
- **Resetting data:** `git checkout -- server/data` restores the committed data. You can also delete `server/data/tasks.json`, which isn't tracked.
- **Don't delete `custom-onboarding.json` to "reset" it.** The server reseeds it from `custom.csv`, but that CSV is now a training-progress sheet rather than the `EID,GROUP,Primary Skill` layout the seeder expects. I tested this on a copy: it produces 41 records that are all named `Unknown` with eid `unknown` and no group. Restore the file from git instead.
- **Never edit the JSON files with PowerShell** (`ConvertTo-Json`, `Set-Content`, `Out-File`). They add a UTF-8 BOM. `JSON.parse` then fails, `loadDb()` silently falls back to `{}`, and every `db.json` endpoint returns empty arrays without any error. Edit them in your editor or with Node instead.
- **Run only one writer at a time.** `npm run json-api` (json-server) also writes `db.json` on port 3000. Running it alongside the Express server means lost writes, or an `EADDRINUSE` crash.
- **The server is reachable from your network.** It listens on all interfaces, even though the log line says `127.0.0.1`, with no auth and CORS open to every origin. Be careful on shared networks.

## 6. Quick troubleshooting

| Symptom | Likely cause |
|---|---|
| `Error: Cannot find module 'express'` | You haven't run `npm ci` in the repo root yet, or you're running from a directory that can't see the root `node_modules` |
| `EADDRINUSE :::3000` | Another process (often json-server, or a previous `npm run api`) is on 3000 |
| Every `db.json` endpoint returns `[]` | `db.json` is invalid JSON, most likely because of a BOM. Run `node -e "JSON.parse(require('fs').readFileSync('server/data/db.json','utf8'))"` to see the parse error |
| Resources list is full of `Unknown` | `custom-onboarding.json` was deleted and reseeded from the CSV. Run `git checkout -- server/data/custom-onboarding.json` |
| UI on :4200 loads but has no data | The API isn't running on **3000** specifically (see the `PORT` warning above) |
| GET `/api/something-new` returns HTML | That route doesn't exist. The SPA catch-all serves `index.html` whenever `dist/` has been built, and returns a 404 when it hasn't |
