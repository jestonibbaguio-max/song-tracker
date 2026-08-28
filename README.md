# ATCP Song Dashboard

An internal resource management and onboarding tracking dashboard for the Accenture Song practice bench. Built with Angular 19 (standalone components) on the frontend and supports two interchangeable API backends: a custom Node.js/Express server or json-server for lightweight local development.

---

## How to Run (Quick Start)

Open **two terminals** inside the `atcpsongdashboard` folder:

```bash
# Terminal 1 — API server (port 3000)
node server/server.js
```

```bash
# Terminal 2 — Angular dev server (port 4200)
npx ng serve
```

Then open **http://localhost:4200** in your browser.

> **Note:** Do NOT use `json-server`. The app requires its own Express server (`server/server.js`).

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

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Frontend framework | Angular (standalone API) | 19.1.0 |
| Frontend build | Angular CLI / esbuild (Vite) | 19.1.4 |
| CSS framework | Bootstrap | 5.3.8 |
| Icons | Bootstrap Icons | 1.13.1 |
| Backend runtime | Node.js | — |
| Backend framework | Express | 5.2.1 |
| Language | TypeScript (frontend) / JavaScript (backend) | 5.7.2 |
| Data persistence | JSON files (file-based, no database) | — |
| Test runner | Karma + Jasmine | — |

---

## Project Structure

```
atcpsongdashboard/
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
│   ├── server.js                 # Main Express server with all API routes
│   ├── json-store.js             # JSON file store for tasks and dashboard data
│   ├── onboarding-store.js       # JSON/CSV store for onboarding records
│   ├── schema.sql                # Reference SQLite schema (not yet active)
│   └── data/
│       ├── custom.csv            # Seed data — initial resource roster
│       ├── custom-onboarding.json  # Runtime-persisted onboarding records
│       └── custom.xlsx           # Source Excel file (reference only)
├── public/                       # Static assets (favicon)
├── dist/                         # Production build output (generated)
├── angular.json                  # Angular CLI workspace config
├── package.json                  # Dependencies and npm scripts
└── tsconfig.json                 # TypeScript compiler config
```

---

## How to Run the App

The app has **three separate service runners**. You need to start at least two of them together: the Angular frontend and one API backend.

### Prerequisites

- Node.js v18+
- npm

### Step 1 — Install dependencies

```bash
cd atcpsongdashboard
npm install
```

---

### Service runners at a glance

| Command | What it starts | Port | When to use |
|---|---|---|---|
| `npm start` | Angular dev server (frontend) | 4200 | Always — this is the browser app |
| `npm run api` | Express API (custom Node.js server) | 3000 | When you need full backend logic (EID upsert, CSV seeding) |
| `npm run json-api` | json-server (flat JSON REST API) | 3000 | **Recommended for local dev** — simpler, no Node.js server needed |

> **Important:** `npm run api` and `npm run json-api` both use port 3000. Never run both at the same time.

---

### Option A — json-server + Angular (recommended for local dev)

Open **two terminals** in the `atcpsongdashboard` directory:

```bash
# Terminal 1 — Start the json-server API (port 3000)
npm run json-api
```

```bash
# Terminal 2 — Start the Angular frontend (port 4200)
npm start
```

Then open [http://localhost:4200](http://localhost:4200) in your browser.

**How it works:** json-server reads `server/data/db.json` and exposes it as a full REST API with `GET`, `POST`, `PUT`, `PATCH`, and `DELETE` automatically. All reads and writes go directly to that JSON file. No Node.js server code runs.

---

### Option B — Express API + Angular (full backend)

Open **two terminals** in the `atcpsongdashboard` directory:

```bash
# Terminal 1 — Start the Express API (port 3000)
npm run api
```

```bash
# Terminal 2 — Start the Angular frontend (port 4200)
npm start
```

Then open [http://localhost:4200](http://localhost:4200) in your browser.

**How it works:** The Express server (`server/server.js`) handles all API routes, seeds data from `server/data/custom.csv` on first run, and persists records to `server/data/custom-onboarding.json`. Use this when you need the custom upsert logic or are testing backend changes.

---

### What each terminal should show

After starting, you should see:

- **json-server terminal:** `JSON Server started on PORT :3000`
- **Express terminal:** `Server listening on port 3000`
- **Angular terminal:** `Application bundle generation complete. Server is listening on localhost:4200`

If port 3000 is already in use, stop the process holding it before starting another API server.

---

### Data files used by each backend

| Backend | Data source | Records persisted to |
|---|---|---|
| json-server (`npm run json-api`) | `server/data/db.json` | Same file — json-server writes back directly |
| Express (`npm run api`) | `server/data/custom-onboarding.json` (seeded from `custom.csv`) | `server/data/custom-onboarding.json` |

The two backends use **separate data files**. Onboarding records added via json-server will not appear when you switch to Express, and vice versa.

---

### Run tests

```bash
npm test
```

### Build for production

```bash
npm run build
node server/server.js
```

Output goes to `dist/atcp-song-dashboard/browser/`. In production mode, Express serves both the API and the Angular SPA from a single process on port 3000. json-server is for local development only.

---

## Architecture

### Frontend

The entire frontend is a **single Angular standalone component** (`AppComponent`). There are no child components, services, guards, or NgModules. This monolithic component approach is intentional for the current scope — it is fast to build and easy to follow.

**View switching** is done via an `activeView` property (`'dashboard' | 'onboarding'`). Angular's `@if` control flow shows or hides the relevant sections. There is no Angular Router; the URL does not change between views.

All state is held as plain TypeScript properties on `AppComponent`, populated by `HttpClient` calls to the Express API.

### Backend

The Express server (`server/server.js`) exposes a REST API with the following responsibilities:

- Returns static dashboard content (currently hardcoded in `json-store.js`)
- Manages onboarding resource records via CRUD endpoints
- Seeds initial data from `server/data/custom.csv` on first run
- Persists onboarding records to `server/data/custom-onboarding.json`
- Serves the built Angular SPA as static files in production

### Data flow

```
Browser (Angular)  <-->  HTTP (JSON)  <-->  Express API  <-->  JSON files on disk
```

On first startup, if `custom-onboarding.json` does not exist, `onboarding-store.js` parses `custom.csv` and writes the JSON file. Subsequent reads and writes go directly to the JSON file.

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

### Onboarding store (`server/onboarding-store.js`)

- Persists records to `server/data/custom-onboarding.json`
- On first run (JSON file absent): bootstraps from `server/data/custom.csv` using a hand-written CSV parser that handles quoted fields and doubled-quote escaping
- Subsequent reads/writes go directly to the JSON file; the CSV is not re-read after initialization

### Dashboard store (`server/json-store.js`)

- Dashboard payload is currently **hardcoded** as a JavaScript object
- `server/schema.sql` defines the full intended SQLite relational schema for dynamic dashboard content (nav groups, stats, checklist items, initiatives, announcements, POC, quick tools) — this is the planned future data source

### Tasks store (`server/json-store.js`)

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
npm start      # Angular dev server — http://localhost:4200
npm run api    # Express API — http://localhost:3000
```

CORS is enabled on the Express server for cross-origin development requests.

### Production

Build the Angular app and serve everything from the Express server:

```bash
npm run build
node server/server.js
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
- **Dashboard data is hardcoded** — The `/api/dashboard` response is a static JavaScript object; it does not read from a database. Changes require editing `server/json-store.js` directly.
- **No authentication or authorization** — All endpoints are publicly accessible. The app is intended for internal network use only.
- **No containerization** — There is no Dockerfile or CI/CD configuration.
- **Single-component frontend** — All UI logic is in one file. As the feature set grows, splitting into multiple components and services will become necessary.

### Planned features (indicated by design mockups in `server/chart_requirement/`)

- **DSR (Daily Status Report) charts** — 12 chart types designed and mocked up; not yet implemented in code.
- **Daily Attendance charts** — 2 attendance visualization mockups; not yet implemented.
- **SQLite database** — `server/schema.sql` defines the full relational schema intended to replace the current JSON file store.
- **Additional sidebar views** — Initiatives, Reports, Resource Tracking, POC How-To, Announcements, and Settings are present in the nav but not yet wired to views.
