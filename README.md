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

> **Start the API with `npm run api` or `npm run dev`, not `node server/server.js`.** Running `server.js` directly skips the database build, so on a fresh clone every data route returns 500 and the UI stays empty. Don't use `npm run json-api` (json-server) either; see [Legacy: json-server](#legacy-json-server).

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

The ATCP Song Dashboard provides two primary views:

- **Dashboard** — A summary view showing KPI stats, an onboarding checklist, active Song initiatives, announcements, POC contacts, and quick-access tools.
- **Onboarding** — A form and searchable table for managing resource onboarding records (EID, name, project assignment, skill tags, dates, and more).

### Mock Assessment Summary

In Head Count, the Communication, Technical, and Client Interview status pills cycle
through Pending, Conducted, Pass, and Fail, then back to Pending. Results are saved
per resource in browser local storage. Previously conducted communication assessments
remain Conducted until a result is selected.

The summary table automatically calculates conducted, passed, and failed counts for
each stream within the selected group. Pass and fail rates are the respective counts
divided by total conducted (including assessments awaiting results), rounded to two
decimal places; both rates are 0% when none have been conducted. These counts and
rates are read-only in the edit dialog.

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
│   │   ├── app.component.ts      # Root component — all app logic and state
│   │   ├── app.component.html    # Template — dashboard & onboarding views
│   │   ├── app.component.css     # Component-scoped styles
│   │   └── app.config.ts         # App-level providers (HttpClient, zone)
│   ├── main.ts                   # Angular bootstrap entry point
│   ├── index.html                # Host HTML page
│   └── styles.css                # Global styles (Bootstrap, CSS variables)
├── server/                       # Node.js/Express API backend
│   ├── server.js                 # Starts the API: app.listen(PORT)
│   ├── app.js                    # Composes middleware, feature routers and static serving
│   ├── config/index.js           # PORT, DATA_DIR and every data-file path
│   ├── features/<name>/          # routes → controller → service → repository, one folder per feature
│   ├── persistence/              # The only code that reads/writes data: sqlite/ (default) and json/ (fallback) stores
│   ├── scripts/                  # db-migrate.js (npm run db:migrate), db-export.js (npm run db:export)
│   ├── middleware/static.js      # /test mount, dist/ static files, index.html fallback
│   ├── utils/                    # nextId, normalizeEid, date and field normalisers
│   └── data/
│       ├── dashboard.sqlite      # Your local database (gitignored; built by npm run db:migrate)
│       ├── db.json               # Seed: sprints, attendance, planner, capacity, reachouts, competency…
│       ├── custom-onboarding.json  # Seed: the onboarding roster
│       ├── custom.csv            # Old roster source (only used by the JSON fallback, if the roster file is missing)
│       └── custom.xlsx           # Source Excel file (reference only)
├── public/                       # Static assets (favicon)
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
| `npm run json-api` | json-server (legacy) | 3000 | **Not for dashboard work**; see [Legacy: json-server](#legacy-json-server) |

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
- **Back up your data:** `npm run db:export -- --out <folder>` writes it out as JSON files.
- **Change the shared data:** edit the JSON seed files in your editor or with Node, never with PowerShell (it adds a byte-order mark that breaks them), and commit them. Everyone then runs `npm run db:migrate -- --force`.
- **E2E tests use their own copy:** `npx playwright test` starts its own API on a fresh copy of the seed. Stop your own API first, or Playwright stops with "port 3000 … is already used".

More detail, including the temporary JSON fallback, is in [docs/running-backend.md](docs/running-backend.md) §5–6.

### Legacy: json-server

`npm run json-api` serves `server/data/db.json` through json-server. It's left over from early development and will be removed. It doesn't implement the dashboard's own endpoints, it reads an old copy of the onboarding roster, and it writes the committed seed file rather than your database. Use `npm run api` instead.

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

The entire frontend is a **single Angular standalone component** (`AppComponent`). There are no child components, services, guards, or NgModules. This monolithic component approach is intentional for the current scope — it is fast to build and easy to follow.

**View switching** is done via an `activeView` property (`'dashboard' | 'onboarding'`). Angular's `@if` control flow shows or hides the relevant sections. There is no Angular Router; the URL does not change between views.

All state is held as plain TypeScript properties on `AppComponent`, populated by `HttpClient` calls to the Express API.

### Backend

The Express server (`server/server.js`) exposes a REST API with the following responsibilities:

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

### Onboarding View

- **Resource form** — Add or edit onboarding records with fields:
  - EID, Resource Name, POC, Group (1–6)
  - Primary Skill, Secondary Skill, Additional Skills (tag input with deduplication)
  - Project Deployed (Yes/No), Project Name (auto-set to "Song Bench" when not deployed)
  - Onboarding Date (native OS date picker via a hidden `<input type="date">`)
  - Status, Location
- **Search and filter** — Client-side search across name, EID, project, POC, and skills
- **Skill autocomplete** — Native `<datalist>` populated from all existing records via `/api/skill-options`
- **Edit flow** — Inline editing via row action; cancel returns to blank form
- **Skill removal confirmation** — Three-step confirm dialog (built with Bootstrap CSS + Angular `@if`, no Bootstrap JS)

---

## API Reference

All endpoints are prefixed with `/api`. The server runs on port **3000**.

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
| `POST` | `/api/onboarding-resources` | Creates a new record. If the EID already exists, updates the existing record silently (upsert). |
| `PATCH` | `/api/onboarding-resources/:id` | Updates a specific record by ID. If the new EID conflicts with a different record, returns `409`. If the EID is changed to a new value, creates a new record. |
| `GET` | `/api/skill-options` | Returns a deduplicated, sorted list of all skills from all records |

### Tasks (stub — not yet surfaced in UI)

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
  "eid": "EMP001",
  "resource_name": "Jane Doe",
  "poc": "John Smith",
  "group_num": 2,
  "primary_skill": "UX Design",
  "secondary_skill": "Research",
  "another_skills": ["Figma", "Prototyping"],
  "project_deployed": "Yes",
  "project_name": "Project Alpha",
  "onboarding_date": "07/15/2026",
  "status": "Active",
  "location": "Manila",
  "created_at": "2026-07-15T08:00:00.000Z",
  "updated_at": "2026-07-15T08:00:00.000Z"
}
```

Dates are stored and returned in **MM/DD/YYYY** format. The server normalizes and auto-corrects transposed day/month values on both create and update.

---

## Data Layer

### Dashboard data (`server/persistence/sqlite/`)

- Stored in `server/data/dashboard.sqlite` (gitignored), one store per feature; the schema is `server/persistence/sqlite/schema.sql`
- Built from the JSON seed by `npm run db:migrate` (`server/persistence/sqlite/import.js`), and written back out as JSON by `npm run db:export`
- The old JSON-file backend (`server/persistence/json/`) stays as a temporary fallback, chosen with `PERSISTENCE=json`, until it's removed (see [docs/sqlite-migration-plan.md](docs/sqlite-migration-plan.md))

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
- **No containerization** — There is no Dockerfile or CI/CD configuration.
- **Single-component frontend** — All UI logic is in one file. As the feature set grows, splitting into multiple components and services will become necessary.

### Planned features (indicated by design mockups in `server/chart_requirement/`)

- **DSR (Daily Status Report) charts** — 12 chart types designed and mocked up; not yet implemented in code.
- **Daily Attendance charts** — 2 attendance visualization mockups; not yet implemented.
- **Remove the JSON fallback** — the move to SQLite is done ([docs/sqlite-migration-plan.md](docs/sqlite-migration-plan.md)); its last phase removes the old JSON-file backend and json-server.
- **Additional sidebar views** — Initiatives, Reports, Resource Tracking, POC How-To, Announcements, and Settings are present in the nav but not yet wired to views.
