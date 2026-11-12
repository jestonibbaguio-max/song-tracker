# ATCP Song Dashboard

An internal resource management and onboarding tracking dashboard for the Accenture Song practice bench. Built with Angular 19 (standalone components) on the frontend and a Node.js/Express API that keeps its data in a local SQLite database.

---

## How to Run (Quick Start)

You need **Node.js 22**. From the repo root (the `song-tracker` folder):

```bash
npx npm@12 ci      # install with npm 12 (see Prerequisites for why)
npm run dev        # the API on port 3000 and the Angular dev server on port 4200, together
```

Then open **http://localhost:4200** in your browser.

The first start builds your own local database, `server/data/dashboard.sqlite`, from the JSON files committed in `server/data/`, and prints the rows it loaded. Later starts reuse it. See [Your data](#your-data) for what that means for your edits.

> **Start the API with `npm run api` or `npm run dev`, not `node server/server.js`.** Running `server.js` directly skips the database build, so on a fresh clone every data route returns 500 and the UI stays empty.

---

## Table of Contents

1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [How to Run the App](#how-to-run-the-app)
5. [Architecture](#architecture)
6. [Features](#features)
7. [API Reference](#api-reference)
8. [Data Layer](#data-layer)
9. [Frontend Design System](#frontend-design-system)
10. [Build and Deployment](#build-and-deployment)
11. [Known Limitations and Roadmap](#known-limitations-and-roadmap)

---

## Overview

The ATCP Song Dashboard helps bench leads (POCs) run the Song bench: who is on it, their attendance, the group's sprint work, retros, skill proficiency, trainings, mock interviews and the projects each person has been put forward for. Every page is scoped by the **group filter** in the sidebar.

| Page | What it's for |
|---|---|
| Dashboard | Summary: notice bar, KPI cards, onboarding checklist, initiatives, announcements, POC contacts, quick tools |
| Resources | The bench roster: add, edit and delete resource profiles |
| Attendance Tracker | Monthly attendance grid per group, with RTO office locations |
| Planner | Microsoft Planner-style boards, buckets and tasks per group, with Grid, Board (kanban) and Sprint Burndown views and a capacity plan |
| Sprint Retros | Went well / didn't go well / improve cards per sprint and group (under the Planner menu) |
| myCompetency | Skill proficiency (P1–P5) and retake dates per group member, coloured by minimum requirement |
| Bench Trainings / Group Trainings | Course checklists per resource |
| Mock Interview | Mock assessment summary, feedback and head count |
| Project Reachouts | Which resource was put forward for which project, and the status |
| POC how-to | Guides for running calls, reports and sprint prep |

See [Features](#features) for details and [DASHBOARD_POLICIES.md](DASHBOARD_POLICIES.md) for the business rules.

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Frontend framework | Angular (standalone API) | 19.2.x (`^19.1.0` in package.json) |
| Frontend build | Angular CLI / esbuild (Vite) | 19.2.x (`^19.1.4` in package.json) |
| CSS framework | Bootstrap | 5.3.8 |
| Icons | Bootstrap Icons | 1.13.1 |
| Backend runtime | Node.js | 22 LTS or newer (see Prerequisites) |
| Backend framework | Express | 5.2.1 |
| Language | TypeScript (frontend) / JavaScript (backend) | 5.7.x |
| Data persistence | SQLite via `better-sqlite3`, built from committed JSON seed files | 13.0.3 |
| Test runner | Karma + Jasmine | — |

---

## Project Structure

```
song-tracker/
├── src/                          # Angular frontend source
│   ├── app/
│   │   ├── app.component.ts      # Shell: sidebar, activeView switching, nav label → view map
│   │   ├── app.component.html    # Sidebar + the @if/@else if chain that renders one view
│   │   ├── app.component.css     # Effectively global (ViewEncapsulation.None)
│   │   ├── app.config.ts         # App-level providers (HttpClient, zone)
│   │   ├── models/types.ts       # Shared interfaces
│   │   ├── services/             # SharedDataService (roster cache, group filter, apiUrl), POC how-to content
│   │   └── views/<page>/         # One standalone component per page
│   ├── envinronments/            # environment.development.ts (apiUrl; the folder name is misspelt)
│   ├── main.ts                   # Angular bootstrap entry point
│   ├── index.html                # Host HTML page
│   └── styles.css                # Global styles (Bootstrap, CSS variables)
├── server/                       # Node.js/Express API backend
│   ├── server.js                 # Starts the API: app.listen(PORT)
│   ├── app.js                    # Composes middleware, feature routers and static serving
│   ├── config/index.js           # PORT, DATA_DIR and every data-file path
│   ├── features/<name>/          # routes → controller → service → repository, one folder per feature
│   ├── persistence/              # The only code that reads/writes data: sqlite/ (the stores, schema, import), tasks and fruits files
│   ├── scripts/                  # db-migrate.js (npm run db:migrate)
│   ├── middleware/static.js      # /test mount, dist/ static files, index.html fallback
│   ├── utils/                    # numericId, normalizeEid, date and field normalisers
│   └── data/
│       ├── dashboard.sqlite      # Your local database (gitignored; built by npm run db:migrate)
│       ├── db.json               # Seed: sprints, attendance, planner, capacity, reachouts, competency…
│       ├── custom-onboarding.json  # Seed: the onboarding roster
│       └── custom.xlsx           # Source Excel file (reference only)
├── public/                       # Static assets (favicon, poc-howto/*.html guides)
├── test/                         # API tests (node:test): characterization, guardrails, fixtures
├── tests/                        # Playwright e2e specs, one folder per page
├── docs/                         # Backend overview, running the backend, found bugs, migration plans
├── dist/                         # Production build output (generated)
├── angular.json                  # Angular CLI workspace config
├── package.json                  # Dependencies and npm scripts
└── tsconfig.json                 # TypeScript compiler config
```

---

## How to Run the App

You need two processes: the Angular frontend and the Express API. `npm run dev` starts both.

### Prerequisites

- Node.js **v22 or newer** (22 LTS recommended)
  - The SQLite driver (`better-sqlite3` 13) and `npm run dev` (via `concurrently` 10) need Node 22, so use it for everything.
  - `better-sqlite3` ships prebuilt binaries for Windows, macOS and Linux (x64 and arm64), so an npm 12 install compiles nothing. Ignore the `run-npm-install*.cmd` scripts in the root.
- **npm 12 for installing.** Run `npx npm@12 ci`, which uses npm 12 for that one command without changing your global npm, or upgrade once with `npm install -g npm@12` and then run `npm ci`. npm 10 and 11 (npm 10 ships with Node 22) ignore `better-sqlite3`'s `"gypfile": false` when they install from the lockfile, and try to compile it with `node-gyp`, which fails without Visual Studio's C++ build tools. npm 12 doesn't, and uses the prebuilt binary the package ships. Every other command (`npm run …`) works with the npm that ships with Node 22.
- No global Angular CLI is needed; the npm scripts use the project's local Angular CLI 19.2.x

### Step 1 — Install dependencies

```bash
cd song-tracker
npx npm@12 ci      # or, with npm 12 installed globally: npm ci
```

If the install fails with `gyp ERR! … You need to install the latest version of Visual Studio`, it ran with npm 10 or 11. Run it again with npm 12 as above. You don't need Visual Studio.

---

### Service runners at a glance

| Command | What it starts | Port | When to use |
|---|---|---|---|
| `npm run dev` | The API and the Angular dev server together | 3000 + 4200 | Day-to-day work |
| `npm start` | Angular dev server (frontend) only | 4200 | With `npm run api` in a second terminal |
| `npm run api` | Express API only (builds the database first if it's missing) | 3000 | With `npm start`, or on its own for API work |

> **Important:** only one thing can use port 3000. Stop one API before starting another.

---

### Two terminals instead of `npm run dev`

Open **two terminals** in the `song-tracker` folder:

```bash
# Terminal 1 — the Express API (port 3000)
npm run api
```

```bash
# Terminal 2 — the Angular frontend (port 4200)
npm start
```

Then open [http://localhost:4200](http://localhost:4200) in your browser.

**How it works:** the Express server (`server/server.js`) handles every API route and keeps the dashboard data in `server/data/dashboard.sqlite`. `npm run api` first runs `npm run db:migrate -- --if-missing`, which builds that database from the committed JSON when there's none and does nothing otherwise.

---

### What each terminal should show

After starting, you should see:

- **API:** on the first start, `Built …dashboard.sqlite from the JSON files in …` and the rows per table; on later starts, `… already exists; nothing to do (--if-missing)`. Then `API running on http://127.0.0.1:3000`.
- **Angular:** `Application bundle generation complete. Server is listening on localhost:4200`

If port 3000 is already in use (`EADDRINUSE`), another API is still running, sometimes left over from a closed terminal. Stop it first: in PowerShell, `Get-NetTCPConnection -LocalPort 3000 -State Listen` shows its process id, and `Stop-Process -Id <id> -Force` stops it.

---

### Your data

- **Your edits stay on your machine.** Everything you save in the app goes into `server/data/dashboard.sqlite`, which is gitignored. Nobody else sees it, and `git diff` stays clean.
- **The committed JSON is only the seed.** `server/data/db.json` and `server/data/custom-onboarding.json` are what new databases are built from. Your database doesn't change when they change.
- **Reset your data, or pick up a newer seed after pulling:** stop the API, then run `npm run db:migrate -- --force`. It rebuilds the database from the JSON and discards your local edits. It refuses while a server still has the database open.
- **Back up your data:** stop the API, then copy `server/data/dashboard.sqlite` together with `dashboard.sqlite-wal` if there is one.
- **Change the shared data:** edit the JSON seed files in your editor or with Node, never with PowerShell (it adds a byte-order mark that breaks them), and commit them. Everyone then runs `npm run db:migrate -- --force`.
- **E2E tests use their own copy:** `npx playwright test` starts its own API on a fresh copy of the seed. Stop your own API first, or Playwright stops with "port 3000 … is already used".

More detail is in [docs/running-backend.md](docs/running-backend.md) §5.

---

### Run tests

```bash
npm run test:api       # API tests (node:test), each on a temp copy of the test fixtures
npx playwright test    # end-to-end tests in Chromium; stop your own API on :3000 first
```

`npm test` (Karma/Jasmine) is set up, but there are no unit tests under `src/` yet. CLAUDE.md lists every test command.

### Build for production

```bash
npm run build
npm run api
```

Output goes to `dist/atcp-song-dashboard/browser/`. In production mode, Express serves both the API and the Angular SPA from a single process on port 3000.

> **Known issue:** `npm run build` currently fails Angular's bundle budget (bug M16 in [docs/found-bugs.md](docs/found-bugs.md)). `npm run dev` and `npm start` aren't affected.

---

## Architecture

### Frontend

The frontend is a set of **standalone Angular components**: `AppComponent` is the shell (sidebar and main area), and each page is its own component in `src/app/views/<page>/`. There are no NgModules or guards.

**View switching** is done via an `activeView` property on `AppComponent` (`'dashboard' | 'onboarding' | 'attendance' | 'planner' | …`), saved in `localStorage['active-view']`. An `@if / @else if` chain in `app.component.html` renders one view component. There is no Angular Router; the URL does not change between views. The sidebar items come from `GET /api/dashboard`, and `selectNav()` maps each label to a view.

To add a page: extend the `activeView` union and `validViews` array, add the label to the nav maps in `app.component.ts`, add a template branch, import the component, and add the nav item in `server/features/dashboard/dashboard.service.js`.

**Shared state** lives in `SharedDataService` (`src/app/services/shared-data.service.ts`): the cached roster (`onboardingResources`), office locations, the sidebar group filter (`attendanceGroup`, used by every page), and `apiUrl(path)`. Always build API URLs with `apiUrl()`: on port 4200/4201 it prefixes `http://localhost:3000`, otherwise it returns the relative path, so the same build works when Express serves it.

Most pages call `HttpClient` directly from the component; Project Reachouts has its own data service. Some features are **frontend-only for now**: trainings progress (mocked with `of(...)`), mock interviews (browser localStorage) and POC how-to edits (in memory).

### Backend

The Express server (`server/server.js` starts it, `server/app.js` composes it) has one folder per feature in `server/features/<name>/`, each split into routes → controller → service → repository. Each repository exposes a SQLite store from `server/persistence/sqlite/`, the only code that runs SQL. See [docs/backend-overview.md](docs/backend-overview.md) for the details. It:

- Returns static dashboard content (currently hardcoded in `server/features/dashboard/dashboard.service.js`)
- Manages onboarding resource records via CRUD endpoints
- Stores every dashboard record (roster, sprints, attendance, planner, capacity, reachouts, competency) in the local SQLite database `server/data/dashboard.sqlite`
- Serves the built Angular SPA as static files in production

### Data flow

```
Browser (Angular)  <-->  HTTP (JSON)  <-->  Express API  <-->  SQLite (server/data/dashboard.sqlite)
```

`npm run db:migrate` (run by `npm run api` and `npm run dev` when the database is missing) builds the database from the committed JSON seed, `server/data/db.json` and `server/data/custom-onboarding.json`. After that, every read and write goes to the database.

---

## Features

### Dashboard View

- **Notice bar** — Dismissible top-of-page announcements
- **KPI stats** — Four metric cards (total resources, onboarding this month, deployed this week, pending actions)
- **Onboarding checklist** — Step-by-step onboarding status list with done/warning states
- **Song initiatives** — Cards showing active practice initiatives with group, tags, and status
- **Announcements** — Scrollable list of notices
- **POC contacts** — Point-of-contact roster with pending counts
- **Quick tools** — Shortcut buttons for common actions

The Dashboard's content is static: it's hard-coded in `server/features/dashboard/dashboard.service.js`.

### Resources (Onboarding)

- **Resource form** — Add or edit a resource profile: name, EID, hire date, roll-in date, project deployed (Yes/No), deployment date, project name (forced to "Song Bench" when not deployed), POC, DN, roll-off date, from project, CL level, group, primary and secondary skill with years, additional skills (tag input), office location
- **Table** — Name, EID, project (with a Deployed badge), group, skills; sorted by name, 10 per page, filtered by the sidebar group and a search box
- **Edit flow** — Clicking a name opens the form pre-filled; after saving it stays open until **Cancel Edit**
- **Delete** — Trash icon, confirmed by typing `DELETE`
- **Server rules** — `POST` upserts by EID; EIDs are lower-cased with everything from `@` removed; dates go over the wire as `MM/DD/YYYY`

Rules: [DASHBOARD_POLICIES.md](DASHBOARD_POLICIES.md) §6.

### Attendance Tracker

A month grid with one row per group member and one cell per day. Each cell holds a status (`Present`, `RTO`, `Absent`, `SL`, `VL`, …); choosing `RTO` asks for an office location, and clearing a cell deletes the entry. The selected month is remembered in localStorage.

### Planner and Sprint Retros

- **Boards → buckets → tasks** — one board per group; one bucket per sprint, created automatically the first time a sprint is opened
- **Views** — Grid (table), Board (kanban with drag and drop) and Dashboard (sprint burndown chart)
- **Task dialog** — title, assignee, dates, priority, labels, description, acceptance criteria, checklist and comments (saved with the task); deleting a task or comment writes a deletion log
- **Sprints** — created and edited from the sprint selector (`YYYY-MM-DD` dates)
- **Capacity Plan** — per-person cadence, admin and holiday hours for the sprint; refreshes attendance and tasks every 2.5 s while open
- **Sprint Retros** — went well / didn't go well / improve cards per sprint and group

Rules: [DASHBOARD_POLICIES.md](DASHBOARD_POLICIES.md) §10–14.

### myCompetency

One row per member of the selected group, whether or not they have saved data yet: primary and secondary skill, proficiency (N/A, TBD, P1–P5) and retake dates. Each field saves as soon as it changes. Rows are green when the member meets the minimum for their CL level (P2 for CL 11–12, P3 for CL 6–10) and yellow otherwise. Rules: [DASHBOARD_POLICIES.md](DASHBOARD_POLICIES.md) §1–5.

### Project Reachouts

One row per resource put forward for a project: EID, project, tech/role, POC EID, status, details and group. Status (`CV Requested`, `Interview Scheduled`, `Passed`, `Failed`, `Pending Update`) is editable inline; everything else through the add/edit dialog. Rules: [DASHBOARD_POLICIES.md](DASHBOARD_POLICIES.md) §15.

### Bench Trainings and Group Trainings

Course checklists per resource: a bench-wide course list, and course tracks per group (only Group 5 has courses so far). **Progress is mocked in the frontend** and isn't saved to the server yet.

### Mock Interview

Three tabs: Summary Table, Feedback and Head Count. **Everything is saved in the browser's localStorage**, so each user sees only their own data.

In Head Count, the Communication, Technical, and Client Interview status pills cycle
through Pending, Conducted, Pass, and Fail, then back to Pending. Results are saved
per resource in browser local storage. Previously conducted communication assessments
remain Conducted until a result is selected.

The summary table automatically calculates conducted, passed, and failed counts for
each stream within the selected group. Pass and fail rates are the respective counts
divided by total conducted (including assessments awaiting results), rounded to two
decimal places; both rates are 0% when none have been conducted. These counts and
rates are read-only in the edit dialog.

### POC how-to

Five guides (AM call with group, AM call with execs, EOD call, preparing the report, new sprint prep), loaded from `public/poc-howto/*.html` and editable in a rich-text editor. **Edits aren't saved**: they're lost on reload.

### Placeholder pages

Initiatives, Reports, Resource tracking, Announcements and Settings are in the sidebar but show a "coming soon" page.

---

## API Reference

All endpoints are prefixed with `/api`. The server runs on port **3000**. This section covers the main ones; [docs/backend-overview.md](docs/backend-overview.md) §4 lists every route with its validation, and §7 every call the frontend makes with its payload.

> A GET to an `/api` path that doesn't exist returns `index.html` with status 200 (the SPA fallback), not a 404.

### Health

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Returns `{ ok: true }` |

### Dashboard

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/dashboard` | Returns all dashboard content (notice, stats, checklist, initiatives, announcements, POC, quick tools) |

### Onboarding Resources

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/onboarding-resources` | Returns all records, sorted newest-first |
| `POST` | `/api/onboarding-resources` | Creates a new record (201). If the EID already exists, updates the existing record silently (upsert, 200). `name`, `eid`, `hireDate` and `rollInDate` are required |
| `PATCH` | `/api/onboarding-resources/:id` | Updates a specific record by ID; send the full record, since missing fields are blanked. If the new EID conflicts with a different record, returns `409`. If the EID is changed to a new value, creates a new record and leaves the old one |
| `DELETE` | `/api/onboarding-resources/:id` | Deletes the record; `404` if it doesn't exist |
| `GET` | `/api/skill-options` | Returns a deduplicated, sorted list of all skills from all records |

### Other dashboard data

| Path | Methods | Used by |
|---|---|---|
| `/api/attendance` | GET (`?year`, `?month`), POST, PATCH `/:id`, DELETE `/:id` | Attendance Tracker, Planner capacity |
| `/api/attendance-options`, `/api/office-locations`, `/api/planner-labels` | GET (read-only lookups) | Attendance, Resources, Planner |
| `/api/sprints` | GET, POST, PATCH `/:id`, DELETE `/:id` | Planner, Sprint Retros |
| `/api/sprint-retros` | GET (`?sprintId`, `?groupNumber`), POST, PATCH `/:id`, DELETE `/:id` | Sprint Retros |
| `/api/capacity-entries` | GET (`?sprintName`), POST (upsert by sprint name + EID) | Planner capacity |
| `/api/planner-boards` | GET (`?groupNumber`) | Planner |
| `/api/planner-buckets` | GET (`?boardId`), POST | Planner |
| `/api/planner-tasks` | GET (`?boardId`), POST, PATCH `/:id`, DELETE `/:id` | Planner |
| `/api/deletion-logs` | GET (`?eid`), POST | Planner (task and comment deletes) |
| `/api/project-reachouts` | GET (`?group`), POST, PATCH `/:id`, DELETE `/:id` | Project Reachouts |
| `/api/competency-records` | GET (`?group`, default 5), PATCH `/:eid` (upsert) | myCompetency |

### Tasks (legacy — not used by the UI, stored in `tasks.json`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/tasks` | Returns task list |
| `POST` | `/api/tasks` | Creates a task |
| `PATCH` | `/api/tasks/:id` | Updates a task |
| `DELETE` | `/api/tasks/:id` | Deletes a task |

### Request / Response format

All endpoints accept and return `application/json`.

**Onboarding resource object:**

```json
{
  "id": 1,
  "name": "Jane Doe",
  "eid": "jane.doe",
  "hireDate": "07/01/2026",
  "rollInDate": "07/15/2026",
  "projectDeployed": "Yes",
  "deploymentDate": "08/01/2026",
  "projectName": "Project Alpha",
  "poc": "john.smith",
  "dn": "No",
  "rollOffDate": "",
  "fromProject": "",
  "clLevel": "11",
  "groupNumber": 2,
  "primarySkill": "UX Design",
  "primaryYears": "2",
  "secondarySkill": "Research",
  "secondaryYears": "1",
  "anotherSkills": ["Figma", "Prototyping"],
  "officeLocation": "Manila",
  "createdAt": "2026-07-15T08:00:00.000Z",
  "updatedAt": "2026-07-15T08:00:00.000Z"
}
```

Keys are camelCase (the server also accepts snake_case on input). Onboarding dates are stored and returned in **MM/DD/YYYY** format; `YYYY-MM-DD` input is converted, and a `D/M/YYYY` date whose first part is over 12 is swapped to `M/D`. Sprint dates use `YYYY-MM-DD`.

---

## Data Layer

### Dashboard data (`server/persistence/sqlite/`)

- Stored in `server/data/dashboard.sqlite` (gitignored), one store per feature; the schema is `server/persistence/sqlite/schema.sql`
- Built from the JSON seed by `npm run db:migrate` (`server/persistence/sqlite/import.js`); the API never reads or writes the seed
- The JSON-file backend it replaced was removed in Phase 8 of [docs/sqlite-migration-plan.md](docs/sqlite-migration-plan.md)

### Dashboard store (`server/features/dashboard/dashboard.service.js`)

- Dashboard payload is currently **hardcoded** as a JavaScript object

### Tasks store (`server/persistence/tasks-file.repository.js`)

- Persisted in `server/data/tasks.json` with a seeded default task

---

## Frontend Design System

### Color palette (CSS custom properties)

| Variable | Value | Usage |
|---|---|---|
| `--accent` | `#A100FF` | Accenture purple — buttons, active nav, progress bar |
| `--ink` | `#000000` | Primary text |
| `--muted` | `#4d4d4d` | Labels, secondary text |
| `--line` | `#dbccff` | Borders, dividers |
| `--panel` | `#ffffff` | Panel / card backgrounds |
| `--surface` | `#f7f1ff` | Page background |
| `--good` | `#4f8f79` | Success / completed state |
| `--warning` | `#b85c48` | Warning / overdue state |

The sidebar uses a deep purple gradient (`#33006a → #12002e`) with the Accenture logo SVG embedded inline.

### Layout

CSS Grid is used throughout:

- Shell: `220px sidebar + 1fr main content`
- Stats row: 4-column grid
- Content area: `1.6fr panels + 1fr sidebar`
- Onboarding section: `max-420px form + 1fr table`

### Responsive breakpoints

| Breakpoint | Behavior |
|---|---|
| `< 1080px` | Stats drop to 2 columns; content grid becomes single-column |
| `< 760px` | Sidebar stacks above main; page header becomes single-column |
| `< 620px` | Onboarding form becomes single-column |

---

## Build and Deployment

### Development

Run two processes concurrently:

```bash
npm run dev    # both of these, in one terminal
npm start      # Angular dev server — http://localhost:4200
npm run api    # Express API — http://localhost:3000 (builds the database first if it's missing)
```

CORS is enabled on the Express server for cross-origin development requests.

### Production

Build the Angular app and serve everything from the Express server:

```bash
npm run build
npm run api
```

The Express server detects the built output at `dist/atcp-song-dashboard/browser/` and serves it as static files. A wildcard catch-all route returns `index.html` for all non-API paths, enabling Angular's client-side view switching.

### Bundle size budgets

Configured in `angular.json`:

| Boundary | Warning | Error |
|---|---|---|
| Initial bundle | 600 kB | 1 MB |
| Per-component styles | 10 kB | 12 kB |

---

## Known Limitations and Roadmap

### Current limitations

- **No Angular Router** — The URL does not reflect the current view; deep-linking and browser back/forward are not supported.
- **Dashboard data is hardcoded** — The `/api/dashboard` response is a static JavaScript object; it does not read from a database. Changes require editing `server/features/dashboard/dashboard.service.js` directly.
- **No authentication or authorization** — All endpoints are publicly accessible. The app is intended for internal network use only.
- **No containerization** — There is no Dockerfile. The only CI is a Playwright workflow (`.github/workflows/playwright.yml`) on pushes and PRs to `main`; GitHub Actions isn't running for this repository at the moment, so run the tests locally before opening a PR.
- **Some features aren't saved on the server yet** — trainings progress is mocked in the frontend, mock interviews live in browser localStorage, and POC how-to edits are lost on reload.
- **Known bugs** — see [docs/found-bugs.md](docs/found-bugs.md).

### Planned features (indicated by design mockups in `server/chart_requirement/`)

- **DSR (Daily Status Report) charts** — 12 chart types designed and mocked up; not yet implemented in code.
- **Daily Attendance charts** — 2 attendance visualization mockups; not yet implemented.
- **Placeholder sidebar views** — Initiatives, Reports, Resource tracking, Announcements, and Settings are in the nav but show "coming soon" pages.
- **Server endpoints for trainings progress** — the frontend services already name them (`/api/trainings-progress/:eid`, `/api/training-progress/:eid`); the server doesn't have them yet.
