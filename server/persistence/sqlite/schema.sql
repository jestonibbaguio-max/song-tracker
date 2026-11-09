-- The dashboard schema, version 1 (docs/sqlite-migration-plan.md, "Schema").
-- Applied by migrations.js when PRAGMA user_version is 0.
--
-- Every table is STRICT. Column types follow what the service hands the store:
--   TEXT / INTEGER / REAL  the service always converts the value (String(),
--                          Number(), a validated integer), or the table is
--                          read-only and filled by the import.
--   ANY                    the service stores the client's value as sent.
--                          ANY keeps its type: 1 stays a number and "1" stays
--                          text, so they never compare equal (in UNIQUE too),
--                          exactly as db.json kept them apart with ===.
--   TEXT + json_valid      a JSON value (arrays, or whatever the client sent).
--
-- A NULL in a column marked "optional" means the row doesn't have the field,
-- and the store leaves it out of the row it returns. Every other nullable
-- column is always returned, null included.
--
-- Ids are INTEGER PRIMARY KEY without AUTOINCREMENT, so a new row gets
-- max(id)+1, as nextId() does on db.json. No foreign keys (decision 9).

CREATE TABLE onboarding_resources (
  id               INTEGER PRIMARY KEY,
  eid              TEXT NOT NULL,
  name             TEXT NOT NULL,
  hire_date        TEXT NOT NULL,
  roll_in_date     TEXT NOT NULL,
  project_deployed TEXT NOT NULL,
  deployment_date  TEXT NOT NULL,
  project_name     TEXT NOT NULL,
  poc              TEXT NOT NULL,
  dn               TEXT NOT NULL,
  roll_off_date    TEXT NOT NULL,
  from_project     TEXT NOT NULL,
  cl_level         TEXT NOT NULL,
  group_number     INTEGER,            -- null: no group
  primary_skill    TEXT NOT NULL,
  primary_years    TEXT NOT NULL,
  secondary_skill  TEXT NOT NULL,
  secondary_years  TEXT NOT NULL,
  another_skills   TEXT NOT NULL CHECK (json_valid(another_skills)),
  office_location  TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  UNIQUE (eid)
) STRICT;

CREATE TABLE sprints (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  start_date TEXT NOT NULL,            -- API: start
  end_date   TEXT NOT NULL             -- API: end
) STRICT;

CREATE TABLE sprint_retros (
  id           INTEGER PRIMARY KEY,
  sprint_id    INTEGER NOT NULL,
  group_number INTEGER NOT NULL,
  category     TEXT NOT NULL,
  text         TEXT NOT NULL,
  created_at   TEXT NOT NULL
) STRICT;
CREATE INDEX sprint_retros_sprint_id ON sprint_retros (sprint_id);

CREATE TABLE capacity_entries (
  id          INTEGER PRIMARY KEY,
  sprint_name ANY NOT NULL,
  eid         ANY NOT NULL,
  cadence     REAL NOT NULL,
  admin       REAL NOT NULL,
  holiday     REAL NOT NULL,
  UNIQUE (sprint_name, eid)
) STRICT;

-- Every field optional: the API still accepts {} (the validation part of M12).
CREATE TABLE attendance (
  id       INTEGER PRIMARY KEY,
  eid      ANY,
  year     ANY,
  month    ANY,
  day      ANY,
  status   ANY,
  location ANY
) STRICT;
CREATE INDEX attendance_year_month ON attendance (year, month);

-- Read-only lookups, filled by the import.
CREATE TABLE attendance_options (
  id    INTEGER PRIMARY KEY,
  label TEXT NOT NULL
) STRICT;

CREATE TABLE office_locations (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL
) STRICT;

CREATE TABLE planner_labels (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL,
  color TEXT NOT NULL
) STRICT;

CREATE TABLE planner_boards (
  id           INTEGER PRIMARY KEY,
  group_number INTEGER NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT                    -- optional
) STRICT;

-- board_id and sort_order come from Number(): a non-numeric value is stored
-- as NULL (NaN), and a fractional one as it is.
CREATE TABLE planner_buckets (
  id         INTEGER PRIMARY KEY,
  board_id   REAL,
  name       TEXT NOT NULL,
  sort_order REAL NOT NULL             -- API: order
) STRICT;
CREATE INDEX planner_buckets_board_id ON planner_buckets (board_id);

-- board_id and bucket_id are always written (Number(), NaN stored as NULL).
-- Every client field is optional: POST {} stores none of them.
CREATE TABLE planner_tasks (
  id                  INTEGER PRIMARY KEY,
  board_id            REAL,
  bucket_id           REAL,
  title               ANY,
  status              ANY,
  priority            ANY,
  start_date          ANY,
  due_date            ANY,
  assignee            ANY,
  labels              TEXT CHECK (json_valid(labels)),
  checklist           TEXT CHECK (json_valid(checklist)),
  comments            TEXT CHECK (json_valid(comments)),
  description         ANY,
  acceptance_criteria ANY,
  completed           INTEGER CHECK (completed IN (0, 1)),
  completed_date      ANY,
  notes               ANY,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
) STRICT;
CREATE INDEX planner_tasks_board_id ON planner_tasks (board_id);

-- Every client field optional: POST {} stores only id and deleted_at.
CREATE TABLE deletion_logs (
  id                 INTEGER PRIMARY KEY,
  type               ANY,
  task_id            ANY,
  task_title         ANY,
  deleted_by         ANY,
  deleted_by_eid     ANY,
  comment_author     ANY,
  comment_text       ANY,
  comment_created_at ANY,
  deleted_at         TEXT NOT NULL
) STRICT;
CREATE INDEX deletion_logs_deleted_by_eid ON deletion_logs (deleted_by_eid);

CREATE TABLE project_reachouts (
  id           INTEGER PRIMARY KEY,
  eid          TEXT NOT NULL,
  project_name TEXT NOT NULL,
  tech_role    TEXT NOT NULL,
  poc_eid      TEXT NOT NULL,
  status       TEXT NOT NULL,
  details      TEXT NOT NULL,
  group_number INTEGER,                -- always written; null: no group
  created_at   TEXT NOT NULL,
  updated_at   TEXT                    -- optional: POST doesn't set it
) STRICT;

-- Keyed by eid (rows have no id). Listed in insertion order (rowid). Every
-- other field is optional: a PATCH stores only the fields it was sent, and the
-- GET's default row ('' / 'N/A') is used only when no row is saved.
CREATE TABLE competency_records (
  eid                   TEXT NOT NULL PRIMARY KEY,
  primary_skill         ANY,
  primary_proficiency   ANY,
  recent_retake_date    ANY,
  next_retake_date      ANY,
  secondary_skill       ANY,
  secondary_proficiency ANY,
  retake_date           ANY
) STRICT;
