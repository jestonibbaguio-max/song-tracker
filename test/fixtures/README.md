# Test fixtures

`data/` is a small, fictional copy of `server/data/`. It uses the same files, the same collections and the same field shapes, including the quirks in the real data. None of the people, EIDs, task text or timestamps come from real records. The values shared with the real data are reference and enum values that the code depends on: statuses, attendance options, group names, the `Story Point N` labels the burndown parses, skills and cities.

The harness (`test/helpers/test-server.js`) copies `data/` to a fresh temp directory for every test and points `DATA_DIR` at it, so tests can write freely. Run the tests with `npm run test:api`. `test/fixtures-integrity.test.js` fails if an edit here breaks a cross-reference.

## Files

| File | Mirrors | Notes |
|---|---|---|
| `data/custom-onboarding.json` | roster | 9 people, newest first, as the server writes it |
| `data/db.json` | everything else | Every collection the server reads or writes, including `project-reachouts` and `deletion-logs`, which the real file doesn't have yet. It leaves out the stale `dashboard`/`onboarding-resources`/`$schema` keys that the server ignores |
| `data/custom.csv` | seed for the roster | Uses the `EID,GROUP,Primary Skill` layout that `server/persistence/roster-file.repository.js` expects. The real `server/data/custom.csv` has drifted to a different layout, so seeding from it is broken |
| `data/test_bwd/db.json` | fruits test bench | 3 fruits. There's no `index.html`, so `/test/` returns 404 under the harness |

`tasks.json` is left out on purpose. The server creates it on the first `GET /api/tasks`, the same as it does with the real data.

## Cast

The app has no user accounts or auth roles. A person's "role" comes from domain fields: CL level (juniors 11–12 need P2 for the competency minimum, seniors 6–10 need P3), bench or deployment status, and being a group's POC (referenced by other people's `poc` and by reachouts' `pocEid`).

| id | EID | Group | CL | Role in the data | Record shape |
|---|---|---|---|---|---|
| 3 | `rafael.t.mendoza` | 5 | 7 | **Group 5 POC**, senior, rolled off "Atlas Banking Revamp". Competency P3+ (meets the minimum) | camelCase |
| 4 | `andrea.s.bautista` | 1 | 8 | **Group 1 POC**, senior. React P3 (meets) | camelCase |
| 5 | `teresa.villanueva` | 5 | 9 | Senior, recently rolled off "Retail Loyalty Platform", `dn: "Yes"`. AEM P2 (**misses** the senior minimum) | camelCase |
| 6 | `miguel.a.torres` | 1 | 10 | **Deployed** to "Northwind Commerce" since 10/19/2026. Attendance shows `Deployed` | camelCase |
| 7 | `jomar.c.pascual` | 5 | 11 | Junior new joiner. AEM P1 (**misses** the junior minimum). Has a reachout with a retired status (`On hold`) | camelCase |
| 8 | `liza.m.navarro` | 5 | 12 | Junior new joiner. Angular P2 (meets the junior minimum) | camelCase |
| 9 | `paolo.d.ramos` | – | 12 | Brand-new joiner, **no group** (`groupNumber: null`), no skills or POC yet | camelCase |
| 2 | `nina.g.castro` | 1 | – | Legacy CSV-seeded record. Its `name` equals its EID | **snake_case** |
| 1 | `kevin.r.lim` | 5 | – | Legacy CSV-seeded record. Has no competency row, so it should get a default row | **snake_case** |

`external.candidate` appears only in a reachout (`groupNumber: null`). It stands for someone who isn't on the roster.

## Relationships

- **Planner:** board `"1"` → group 1 and board `"2"` → group 5. **Board id ≠ group number on purpose**, so code that mixes them up fails. Buckets are named after sprints, and each task's bucket belongs to that task's board. Every assignee is in the board's group, and every label id exists.
- **Sprints:** Sprint 1 is 10/13–10/24, **Sprint 2 (current) is 10/27–11/07**, and Sprint 3 is 11/10–11/21. Retros reference `sprintId` and capacity entries reference `sprintName`. Sprint 2 attendance crosses the Oct/Nov month boundary, so the capacity code has to merge two months.
- **People:** `poc`, `pocEid`, `assignee`, `deletedByEid`, and attendance, capacity and competency `eid`s all resolve to the roster. Comment `author`, `deletedBy` and `commentAuthor` use display names.
- **Deletion logs:** task 4 was deleted, so tasks are 1–3 and 5–7. The comment-deletion log points at task 3, which still exists. Retro id 3 is missing for the same reason.

## Quirks kept on purpose (they exist in the real data)

- **IDs are sometimes strings.** This applies to board ids, office-location ids, attendance-option ids, and some bucket, label and attendance ids. One task's `labels` mixes `1` and `"5"`. The server and UI coerce these with `Number()`.
- **The roster mixes camelCase and snake_case.** CamelCase records still use `created_at`/`updated_at`, and snake_case records have no `clLevel`/`officeLocation`.
- **Optional fields vary by task.** Older tasks have `completedDate`/`notes` but no `description`/`acceptanceCriteria`/`comments`, and newer tasks are the reverse.
- **Only `RTO` attendance rows have a `location`.** It's a free-text building name. Roster `officeLocation` is a city from `office-locations`.

## Known server bugs these fixtures expose

The fixtures expose these bugs; they don't cause them. The server code hasn't been changed.

- `GET /api/competency-records?group=5` omits `kevin.r.lim`, because the route filters on `groupNumber` only and misses snake_case `group_number`.
- `GET /api/skill-options` returns only `["AEM","React Native"]`, because `getSkillOptions()` reads snake_case keys only.
