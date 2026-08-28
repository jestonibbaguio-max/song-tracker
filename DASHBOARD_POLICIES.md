# Song Bench Dashboard — Policies & Feature Reference

This document captures all business rules, data policies, and feature behaviours
implemented in the dashboard so they do not need to be re-explained in future sessions.

---

## Table of Contents

1. [CL Level & Rank System](#1-cl-level--rank-system)
2. [myCompetency — Status Details](#2-mycompetency--status-details)
3. [Proficiency Levels](#3-proficiency-levels)
4. [Minimum Competency Requirements](#4-minimum-competency-requirements)
5. [Row Colour Rules](#5-row-colour-rules)
6. [Resources (Onboarding) Table](#6-resources-onboarding-table)
7. [Group Filtering](#7-group-filtering)
8. [Data Sources](#8-data-sources)
9. [Navigation Structure](#9-navigation-structure)
10. [Planner — Views & Toolbar](#10-planner--views--toolbar)
11. [Planner — Sprint Burndown Dashboard](#11-planner--sprint-burndown-dashboard)
12. [Planner — Grid View Details](#12-planner--grid-view-details)
13. [Planner — Task Dialog](#13-planner--task-dialog)
14. [Planner — Data Integrity Rules](#14-planner--data-integrity-rules)

---

## 1. CL Level & Rank System

CL levels represent seniority. The numbering is **inverse** — the lower the CL number, the higher the rank.

| CL Level | Rank |
|----------|------|
| CL 6 | Highest |
| CL 7 | ↑ |
| CL 8 | ↑ |
| CL 9 | ↑ |
| CL 10 | ↑ |
| CL 11 | ↓ |
| CL 12 | Lowest |

CL 12 and CL 11 are the most junior personnel.
CL 10 through CL 6 are considered mid to senior level.

---

## 2. myCompetency — Status Details

The myCompetency page displays a fillable assessment grid for all members of the
selected group. Every member appears in the table regardless of whether they have
existing competency records — the row is always ready for input.

### Columns

| Column | Description |
|--------|-------------|
| Name | Member's full name pulled from onboarding profile |
| EID | Employee ID |
| Primary Skill | Free-text skill name |
| Primary Proficiency | Dropdown — see Proficiency Levels |
| Recent Retake Date | Date picker (YYYY-MM-DD stored, calendar picker in UI) |
| Next Retake Date | Date picker |
| Secondary Skill | Free-text skill name |
| Secondary Proficiency | Dropdown — see Proficiency Levels |
| Retake Date | Date picker (secondary skill) |

### Group Filter

The group selector above the table filters which members are shown.
Switching groups reloads records from the server for that group only.
All 18 members of a group appear — not just those with existing records.

---

## 3. Proficiency Levels

Proficiency runs from lowest to highest:

| Value | Meaning |
|-------|---------|
| N/A | Not assessed |
| TBD | To be determined |
| P1 | Lowest — beginner |
| P2 | |
| P3 | |
| P3+ | P3 with distinction |
| P4 | |
| P5 | Highest — expert |

P1 is the lowest assessed level. P5 is the highest.
N/A and TBD are considered "not started" for reporting purposes.

---

## 4. Minimum Competency Requirements

Minimum requirements apply to the **Primary Skill** only.
Requirements differ by CL level because junior staff (CL 12 & 11) have a lower bar.

| CL Level | Minimum Primary Proficiency |
|----------|-----------------------------|
| CL 12 | **P2** |
| CL 11 | **P2** |
| CL 10 | **P3** |
| CL 9 | **P3** |
| CL 8 | **P3** |
| CL 7 | **P3** |
| CL 6 | **P3** |

- CL 12 & 11: P2 or above = requirement met
- CL 10 – 6: P3 or above = requirement met
- Secondary skill requirement (where applicable): P3 minimum for all CL levels

---

## 5. Row Colour Rules

Row background colour in the myCompetency table reflects whether the member
has met their minimum requirement for their CL level.

| Colour | Condition |
|--------|-----------|
| Light green (`#c8e6c9`) | Minimum requirement met (P2+ for CL 11/12, P3+ for CL 10–6) |
| Light yellow (`#fff176`) | Requirement not yet met (N/A, TBD, P1, or P2 for CL 10–6) |

---

## 6. Resources (Onboarding) Table

The nav item was renamed from **Onboarding** to **Resources**. The nav badge shows a
live count that updates automatically based on the active Group filter.

### Visible Columns

| Column | Notes |
|--------|-------|
| Name | Clickable — opens edit form |
| EID | Employee ID |
| Project | Project name only. A green **Deployed** badge appears only when `projectDeployed === 'Yes'` — nothing shown for undeployed resources |
| Group | Truncated to 7 characters (e.g. `Group 5`) to save column width |
| Skills | Primary skill + any additional skills |
| _(trash icon)_ | Delete action — rightmost column |

Columns **Hire Date**, **Roll-In Date**, and **POC** are intentionally hidden from the
table to reduce clutter. They are still stored in the record and editable via the form.

### Record List Behaviour

- Default sort: **Name A–Z** on every page load and after every filter/sort action
- Pagination: **10 records per page** with full navigation (First / Prev / page numbers / Next / Last)
- Page resets to 1 whenever the search query, group, or sort column changes
- Smart ellipsis (`…`) appears in page numbers when there are more than 7 pages

### Editing a Profile

- Clicking a name opens the edit form pre-filled with that member's data
- After saving an edit, **the form stays open** with the saved data — it does not reset
- The form only resets (clears) when the user clicks **Cancel Edit**
- Dates on edit are optional — existing records without hire/roll-in dates can still be updated

### Deleting a Profile

- Each row has a trash icon button on the right
- Clicking it opens a confirmation dialog showing the member's name and EID
- The user must type the word `DELETE` (uppercase) before the confirm button becomes active
- Deletion is permanent and removes the record from storage immediately

### Validation Rules

| Field | New Record | Edit |
|-------|-----------|------|
| Name | Required | Required |
| EID | Required, unique | Required, unique (among other records) |
| Hire Date | Required (MM/DD/YYYY) | Optional |
| Roll-In Date | Required (MM/DD/YYYY) | Optional |
| Date format | MM/DD/YYYY | MM/DD/YYYY if provided |

---

## 7. Group Filtering

The **Group** selector in the left sidebar is a global filter that affects:

- **Onboarding Resources** list — shows only members of the selected group
- **myCompetency** table — loads competency records for the selected group only
- **Attendance Tracker** — filters attendance view by group
- **Planner** — shows plans for the selected group

Selecting "All Groups" in the sidebar shows records across all groups in the
Onboarding list (and uses the group selector within myCompetency for that page).

---

## 8. Data Sources

The dashboard uses two separate storage files. Understanding which is which
prevents future confusion when debugging missing records.

| File | Used for | Accessed via |
|------|----------|-------------|
| `server/data/custom-onboarding.json` | All onboarding resource profiles (the live source of truth) | `onboarding-store.js` → `loadOnboardingRecords()` |
| `server/data/db.json` | Competency records, tasks, attendance, planner data | `loadDb()` / `saveDb()` |

**Important:** The myCompetency endpoint (`GET /api/competency-records`) reads group
membership from `custom-onboarding.json` (not `db.json`), so all 18 members of a
group will always appear — regardless of whether a competency record exists for them yet.

### Key API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/onboarding-resources` | All onboarding profiles |
| POST | `/api/onboarding-resources` | Create new profile |
| PATCH | `/api/onboarding-resources/:id` | Update existing profile |
| DELETE | `/api/onboarding-resources/:id` | Delete profile (permanent) |
| GET | `/api/competency-records?group=N` | Competency records for group N |
| PATCH | `/api/competency-records/:eid` | Save/update a competency row |

---

## 9. Navigation Structure

Nav groups are hardcoded in `server/json-store.js` inside `getDashboardPayload()`.
Editing `db.json` nav entries has no effect — only `json-store.js` is read.

### MAIN

| Label | View key | Notes |
|-------|----------|-------|
| Dashboard | `dashboard` | Home / overview |
| Resources | `onboarding` | Member profiles, fillable form (renamed from Onboarding) |
| Attendance Tracker | `attendance` | Monthly attendance by group |
| Planner | `planner` | Group task planner |
| myCompetency | `mycompetency` | Competency assessment grid |
| Trainings | `trainings` | Coming soon |
| Mock Interview | `mockinterview` | Coming soon |
| Projects and Reachouts | `reachout` | Coming soon |
| Training | `training` | Coming soon |
| Initiatives | — | Coming soon |

### POC TOOLS

Reports · Resource tracking · POC how-to

### GENERAL

Announcements · Settings

---

## 10. Planner — Views & Toolbar

The Planner has a unified single-row toolbar at the top containing (left to right):

| Element | Description |
|---------|-------------|
| **Grid** tab | Table view of all sprint tasks |
| **Board** tab | Kanban columns: NEW · IN PROGRESS · REVIEW · DONE |
| **Dashboard** tab | Sprint Burndown Chart |
| _(thin divider)_ | Visual separator |
| **Sprint selector** | Dropdown listing all sprints; active sprint marked with ★ and a "Current" badge |
| **Filter** icon | Opens assignee filter float panel (anchors right, opens leftward to stay in viewport) |
| **Search tasks** | Inline search input filtering task title |
| **Capacity Plan** button | Opens the capacity panel overlay |

All toolbar elements are left-aligned (`justify-content: flex-start`). There is no
space-between spreading — elements sit close together with a thin purple divider
separating the view tabs from the sprint/action controls.

### Grid View

Columns: checkbox · Task Name · Assigned To · Start · Due · Bucket · Status.
Filtered by the active sprint bucket, assignee filter, and search input simultaneously.
Label chips are **hidden** in the grid rows to save space — labels are still visible inside
the task detail dialog. The Assigned To column shows the avatar and name **horizontally**
side-by-side. Task Name column uses `table-layout: fixed` at `34%` width with text truncation.

### Board View

Kanban columns per sprint bucket. Supports drag-and-drop reorder and status change via
Angular CDK. Completed tasks are collapsible under each bucket.

### Assignee Filter

- Stores selected display names (e.g. "Michael Bobis"), not EIDs
- Task `assignee` field stores EIDs — conversion via `getPlannerMemberName(eid)` happens
  at the comparison point, not at storage time
- Filter float panel uses `right: 0; left: auto` so it always opens leftward and stays
  within the viewport

---

## 11. Planner — Sprint Burndown Dashboard

Accessible via the **Dashboard** tab inside the Planner view.

### What it shows

A 2-week sprint breakdown with:
- A **summary table** (left) with one row per working day
- A **SVG burndown chart** (right) with a dark background

### Summary Table Columns

| Column | Description |
|--------|-------------|
| Day / Sprint / Iteration | Working day number (0 = sprint start) |
| Features / Story Points Goal | Daily burn target (total ÷ 10) |
| Complete | Tasks burned that day (previous remaining − current remaining) |
| TARGET | Tasks remaining if burning linearly (highlighted yellow) |
| ACTUALS | Actual tasks remaining based on DONE task due dates (highlighted purple) |
| Target Completion Rate | `(day ÷ 10) × 100%` |
| Actual Completion Rate | `((total − actuals) ÷ total) × 100%` |

### Chart

- **Blue bars** = TARGET (linear burn, descending day 1–10)
- **Orange line + labeled bubbles** = ACTUALS
- ACTUALS are plotted only for days up to and including today
- Future days show no actuals until the date arrives
- Dark navy background (`#1e2235`) with grid lines

### Data Logic

- Story points = **total task count** in the selected sprint bucket (1 task = 1 point)
- Sprint duration = **10 working days** (Mon–Fri, derived from `sprintSchedule` start/end dates)
- A task counts as burned on the working day matching its `dueDate`, if its status is
  `DONE` or `completed === true`
- Switching the Sprint selector in the toolbar updates the chart immediately

### Highlights Bar

Below the chart, three quick stats are shown:
- Total sprint tasks
- Remaining (as of the latest computed day)
- Completed so far

---

## 12. Planner — Grid View Details

### Column Widths (`table-layout: fixed`)

| Column | Width | Notes |
|--------|-------|-------|
| Checkbox | 28 px | Compact; padding-right: 4px |
| Task Name | 34% | Truncates with `…` on overflow; full title visible in dialog |
| Assigned To | 160 px | Avatar + name horizontally aligned side-by-side |
| Start | 90 px | Formatted MM/DD/YYYY |
| Due | 90 px | Colour-coded: red = overdue, orange = due soon |
| Bucket | 100 px | Sprint name from `plannerBuckets` |
| Status | auto | Pill badge coloured by status |

### What is NOT shown in Grid rows

- **Label chips** — hidden to reduce row height. Labels are shown in the task detail dialog only.
- **Description / Checklist / Comments** — dialog only.

---

## 13. Planner — Task Dialog

### Header

The group/board selector that previously appeared at the top of the dialog has been
**removed**. The header now contains only the delete icon and close (×) button.

### Fields

| Field | Notes |
|-------|-------|
| Title | Editable inline; required to save |
| Labels | Tag pills with × to remove; + button to add |
| Assigned To | Dropdown of group members |
| Status | NEW · IN PROGRESS · REVIEW · DONE · COMPLETED |
| Priority | Low · Medium · High · Urgent |
| Start Date / Due Date | Date pickers |
| Bucket | Sprint selector — determines which sprint this task belongs to. **Bucket = Sprint** in this system; changing it moves the task to another sprint |
| Acceptance Criteria | Free-text textarea |
| Checklist | Add/toggle/remove sub-items |
| Comments | Threaded comments with author |

### Bucket vs Sprint

These are the **same concept** with two names:
- **Bucket** is the internal data-model field (`bucketId` on each task).
- **Sprint** is what appears in the toolbar selector and in the UI labels.
- The Bucket dropdown in the dialog lets you move a task from one sprint to another.
- The Sprint selector in the toolbar filters which bucket's tasks are displayed.

### Save Error Handling

If the server returns an error on save, a red message appears above the Cancel button
explaining the failure. The dialog stays open so the user can retry or cancel.
The error clears automatically the next time the dialog is opened.

---

## 14. Planner — Data Integrity Rules

### Task IDs

All planner tasks use **auto-incremented numeric IDs** generated by the server
(`nextId()` in `server.js`). Tasks originally imported from Microsoft Planner Excel
exports had GUID-style string IDs (e.g. `"r3USREMFqn0"`); these were migrated to
sequential integers (1–95) in a one-time normalization script.

**Rule:** Never manually assign string or GUID IDs to tasks. The server's `POST /api/planner-tasks`
endpoint assigns the next available integer automatically.

### Type Normalization

All IDs returned from the server are coerced to `Number` on the client side when loaded:

| Field | Source type in db.json | Normalized to |
|-------|------------------------|---------------|
| `PlannerBoard.id` | string | number |
| `PlannerBucket.id` | string | number |
| `PlannerTask.id` | number (post-migration) | number |
| `PlannerTask.boardId` | number | number |
| `PlannerTask.bucketId` | number | number |

This normalization happens in `openBoard()` in `app.component.ts` so Angular's
`[ngValue]` strict-equality binding works correctly on the Bucket select.

### db.json Write Safety

Always write `db.json` using Node.js `fs.writeFileSync(path, JSON.stringify(db, null, 2), 'utf8')`.
**Never use PowerShell's `ConvertTo-Json`** — it adds a UTF-8 BOM that silently corrupts
JSON.parse (the `loadDb()` catch returns `{}`, breaking all API responses).
