PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 10000;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS tasks_updated_at
AFTER UPDATE ON tasks
FOR EACH ROW
BEGIN
  UPDATE tasks SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

INSERT INTO tasks (title, status)
SELECT 'Prepare onboarding report', 'open'
WHERE NOT EXISTS (SELECT 1 FROM tasks);

CREATE TABLE IF NOT EXISTS dashboard_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS nav_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS nav_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL,
  icon TEXT NOT NULL,
  label TEXT NOT NULL,
  badge TEXT,
  active INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (group_id) REFERENCES nav_groups(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS dashboard_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  value TEXT NOT NULL,
  detail TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS checklist_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  status TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  warning INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS initiatives (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  group_name TEXT NOT NULL,
  meta TEXT NOT NULL,
  status TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS initiative_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  initiative_id INTEGER NOT NULL,
  tag TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (initiative_id) REFERENCES initiatives(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  meta TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS poc_people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  initials TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  pending TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS quick_tools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  icon TEXT NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS onboarding_resources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  eid TEXT NOT NULL UNIQUE,
  hire_date TEXT NOT NULL,
  roll_in_date TEXT NOT NULL,
  project_deployed TEXT NOT NULL DEFAULT 'No',
  deployment_date TEXT NOT NULL DEFAULT '',
  project_name TEXT NOT NULL DEFAULT '',
  poc TEXT NOT NULL DEFAULT '',
  dn TEXT NOT NULL DEFAULT 'No',
  roll_off_date TEXT NOT NULL DEFAULT '',
  from_project TEXT NOT NULL DEFAULT '',
  group_number INTEGER,
  primary_skill TEXT NOT NULL DEFAULT '',
  primary_years TEXT NOT NULL DEFAULT '',
  secondary_skill TEXT NOT NULL DEFAULT '',
  secondary_years TEXT NOT NULL DEFAULT '',
  another_skills TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS skill_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  skill TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TRIGGER IF NOT EXISTS onboarding_resources_updated_at
AFTER UPDATE ON onboarding_resources
FOR EACH ROW
BEGIN
  UPDATE onboarding_resources SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

INSERT INTO dashboard_settings (key, value)
SELECT 'notice_title', 'RTO policy update effective Aug 1'
WHERE NOT EXISTS (SELECT 1 FROM dashboard_settings WHERE key = 'notice_title');

INSERT INTO dashboard_settings (key, value)
SELECT 'notice_detail', '3 days onsite required for bench resources.'
WHERE NOT EXISTS (SELECT 1 FROM dashboard_settings WHERE key = 'notice_detail');

INSERT INTO dashboard_settings (key, value)
SELECT 'notice_badge', 'New'
WHERE NOT EXISTS (SELECT 1 FROM dashboard_settings WHERE key = 'notice_badge');

INSERT INTO dashboard_settings (key, value)
SELECT 'welcome_name', 'Aldhen Dignaran test 01'
WHERE NOT EXISTS (SELECT 1 FROM dashboard_settings WHERE key = 'welcome_name');

INSERT INTO dashboard_settings (key, value)
SELECT 'welcome_detail', 'Song Bench - Week 3 on bench - New joiner track'
WHERE NOT EXISTS (SELECT 1 FROM dashboard_settings WHERE key = 'welcome_detail');

INSERT INTO dashboard_settings (key, value)
SELECT 'checklist_completed', '8'
WHERE NOT EXISTS (SELECT 1 FROM dashboard_settings WHERE key = 'checklist_completed');

INSERT INTO dashboard_settings (key, value)
SELECT 'checklist_total', '12'
WHERE NOT EXISTS (SELECT 1 FROM dashboard_settings WHERE key = 'checklist_total');

INSERT INTO dashboard_settings (key, value)
SELECT 'checklist_progress', '67'
WHERE NOT EXISTS (SELECT 1 FROM dashboard_settings WHERE key = 'checklist_progress');

INSERT INTO nav_groups (label, sort_order)
SELECT 'MAIN', 1
WHERE NOT EXISTS (SELECT 1 FROM nav_groups);

INSERT INTO nav_groups (label, sort_order)
SELECT 'POC TOOLS', 2
WHERE NOT EXISTS (SELECT 1 FROM nav_groups WHERE label = 'POC TOOLS');

INSERT INTO nav_groups (label, sort_order)
SELECT 'GENERAL', 3
WHERE NOT EXISTS (SELECT 1 FROM nav_groups WHERE label = 'GENERAL');

INSERT INTO nav_items (group_id, icon, label, badge, active, sort_order)
SELECT id, 'bi-grid-1x2', 'Dashboard', NULL, 1, 1 FROM nav_groups
WHERE label = 'MAIN' AND NOT EXISTS (SELECT 1 FROM nav_items);

INSERT INTO nav_items (group_id, icon, label, badge, active, sort_order)
SELECT id, 'bi-person-check', 'Onboarding', '12', 0, 2 FROM nav_groups
WHERE label = 'MAIN' AND NOT EXISTS (SELECT 1 FROM nav_items WHERE label = 'Onboarding');

INSERT INTO nav_items (group_id, icon, label, badge, active, sort_order)
SELECT id, 'bi-kanban', 'Initiatives', NULL, 0, 3 FROM nav_groups
WHERE label = 'MAIN' AND NOT EXISTS (SELECT 1 FROM nav_items WHERE label = 'Initiatives');

INSERT INTO nav_items (group_id, icon, label, badge, active, sort_order)
SELECT id, 'bi-file-earmark-bar-graph', 'Reports', NULL, 0, 1 FROM nav_groups
WHERE label = 'POC TOOLS' AND NOT EXISTS (SELECT 1 FROM nav_items WHERE label = 'Reports');

INSERT INTO nav_items (group_id, icon, label, badge, active, sort_order)
SELECT id, 'bi-people', 'Resource tracking', NULL, 0, 2 FROM nav_groups
WHERE label = 'POC TOOLS' AND NOT EXISTS (SELECT 1 FROM nav_items WHERE label = 'Resource tracking');

INSERT INTO nav_items (group_id, icon, label, badge, active, sort_order)
SELECT id, 'bi-journal-text', 'POC how-to', NULL, 0, 3 FROM nav_groups
WHERE label = 'POC TOOLS' AND NOT EXISTS (SELECT 1 FROM nav_items WHERE label = 'POC how-to');

INSERT INTO nav_items (group_id, icon, label, badge, active, sort_order)
SELECT id, 'bi-megaphone', 'Announcements', NULL, 0, 1 FROM nav_groups
WHERE label = 'GENERAL' AND NOT EXISTS (SELECT 1 FROM nav_items WHERE label = 'Announcements');

INSERT INTO nav_items (group_id, icon, label, badge, active, sort_order)
SELECT id, 'bi-gear', 'Settings', NULL, 0, 2 FROM nav_groups
WHERE label = 'GENERAL' AND NOT EXISTS (SELECT 1 FROM nav_items WHERE label = 'Settings');

INSERT INTO dashboard_stats (label, value, detail, sort_order)
SELECT 'Onboarding progress', '67%', '8 of 12 tasks complete', 1
WHERE NOT EXISTS (SELECT 1 FROM dashboard_stats);

INSERT INTO dashboard_stats (label, value, detail, sort_order)
SELECT 'Pending tasks', '4', '2 overdue', 2
WHERE NOT EXISTS (SELECT 1 FROM dashboard_stats WHERE label = 'Pending tasks');

INSERT INTO dashboard_stats (label, value, detail, sort_order)
SELECT 'Active initiatives', '23', 'Across 5 Song groups', 3
WHERE NOT EXISTS (SELECT 1 FROM dashboard_stats WHERE label = 'Active initiatives');

INSERT INTO dashboard_stats (label, value, detail, sort_order)
SELECT 'Resources on bench', '47', '6 not started onboarding', 4
WHERE NOT EXISTS (SELECT 1 FROM dashboard_stats WHERE label = 'Resources on bench');

INSERT INTO checklist_items (label, status, done, warning, sort_order)
SELECT 'Complete HR verification', 'Done Jul 10', 1, 0, 1
WHERE NOT EXISTS (SELECT 1 FROM checklist_items);

INSERT INTO checklist_items (label, status, done, warning, sort_order)
SELECT 'Attend bench orientation', 'Done Jul 12', 1, 0, 2
WHERE NOT EXISTS (SELECT 1 FROM checklist_items WHERE label = 'Attend bench orientation');

INSERT INTO checklist_items (label, status, done, warning, sort_order)
SELECT 'Submit BIR documents', 'Overdue', 0, 1, 3
WHERE NOT EXISTS (SELECT 1 FROM checklist_items WHERE label = 'Submit BIR documents');

INSERT INTO checklist_items (label, status, done, warning, sort_order)
SELECT 'Complete mandatory trainings', 'Due today', 0, 0, 4
WHERE NOT EXISTS (SELECT 1 FROM checklist_items WHERE label = 'Complete mandatory trainings');

INSERT INTO checklist_items (label, status, done, warning, sort_order)
SELECT 'Set up myC profile', 'Due Aug 1', 0, 0, 5
WHERE NOT EXISTS (SELECT 1 FROM checklist_items WHERE label = 'Set up myC profile');

INSERT INTO initiatives (title, group_name, meta, status, sort_order)
SELECT 'myC review automation tool', 'Song Analytics', 'Updated 2 days ago', 'Completed', 1
WHERE NOT EXISTS (SELECT 1 FROM initiatives);

INSERT INTO initiatives (title, group_name, meta, status, sort_order)
SELECT 'Bench resource report generator', 'Song Delivery', 'Updated today', 'In progress', 2
WHERE NOT EXISTS (SELECT 1 FROM initiatives WHERE title = 'Bench resource report generator');

INSERT INTO initiatives (title, group_name, meta, status, sort_order)
SELECT 'Bench upskilling pathway guide', 'Song Learning', 'Added Jul 20', 'New', 3
WHERE NOT EXISTS (SELECT 1 FROM initiatives WHERE title = 'Bench upskilling pathway guide');

INSERT INTO initiative_tags (initiative_id, tag, sort_order)
SELECT id, 'Tool', 1 FROM initiatives
WHERE title = 'myC review automation tool'
  AND NOT EXISTS (
    SELECT 1 FROM initiative_tags
    WHERE initiative_id = initiatives.id AND tag = 'Tool'
  );

INSERT INTO initiative_tags (initiative_id, tag, sort_order)
SELECT id, 'Shared', 2 FROM initiatives
WHERE title = 'myC review automation tool'
  AND NOT EXISTS (
    SELECT 1 FROM initiative_tags
    WHERE initiative_id = initiatives.id AND tag = 'Shared'
  );

INSERT INTO initiative_tags (initiative_id, tag, sort_order)
SELECT id, 'Analytics', 3 FROM initiatives
WHERE title = 'myC review automation tool'
  AND NOT EXISTS (
    SELECT 1 FROM initiative_tags
    WHERE initiative_id = initiatives.id AND tag = 'Analytics'
  );

INSERT INTO initiative_tags (initiative_id, tag, sort_order)
SELECT id, 'Tool', 1 FROM initiatives
WHERE title = 'Bench resource report generator'
  AND NOT EXISTS (
    SELECT 1 FROM initiative_tags
    WHERE initiative_id = initiatives.id AND tag = 'Tool'
  );

INSERT INTO initiative_tags (initiative_id, tag, sort_order)
SELECT id, 'POC', 2 FROM initiatives
WHERE title = 'Bench resource report generator'
  AND NOT EXISTS (
    SELECT 1 FROM initiative_tags
    WHERE initiative_id = initiatives.id AND tag = 'POC'
  );

INSERT INTO initiative_tags (initiative_id, tag, sort_order)
SELECT id, 'Reporting', 3 FROM initiatives
WHERE title = 'Bench resource report generator'
  AND NOT EXISTS (
    SELECT 1 FROM initiative_tags
    WHERE initiative_id = initiatives.id AND tag = 'Reporting'
  );

INSERT INTO initiative_tags (initiative_id, tag, sort_order)
SELECT id, 'Resource', 1 FROM initiatives
WHERE title = 'Bench upskilling pathway guide'
  AND NOT EXISTS (
    SELECT 1 FROM initiative_tags
    WHERE initiative_id = initiatives.id AND tag = 'Resource'
  );

INSERT INTO initiative_tags (initiative_id, tag, sort_order)
SELECT id, 'LAD', 2 FROM initiatives
WHERE title = 'Bench upskilling pathway guide'
  AND NOT EXISTS (
    SELECT 1 FROM initiative_tags
    WHERE initiative_id = initiatives.id AND tag = 'LAD'
  );

INSERT INTO announcements (title, meta, sort_order)
SELECT 'RTO policy update - Aug 2026', 'Posted Jul 25 - HR Bench Team', 1
WHERE NOT EXISTS (SELECT 1 FROM announcements);

INSERT INTO announcements (title, meta, sort_order)
SELECT 'Updated leave filing guidelines', 'Posted Jul 22 - People Team', 2
WHERE NOT EXISTS (SELECT 1 FROM announcements WHERE title = 'Updated leave filing guidelines');

INSERT INTO announcements (title, meta, sort_order)
SELECT 'Q3 bench deployment forecast', 'Posted Jul 18 - Delivery POC', 3
WHERE NOT EXISTS (SELECT 1 FROM announcements WHERE title = 'Q3 bench deployment forecast');

INSERT INTO poc_people (initials, name, role, pending, sort_order)
SELECT 'MA', 'Maria Alcantara', 'Song Delivery POC', '2 pending', 1
WHERE NOT EXISTS (SELECT 1 FROM poc_people);

INSERT INTO poc_people (initials, name, role, pending, sort_order)
SELECT 'RS', 'Rico Santos', 'Song Analytics POC', '0 pending', 2
WHERE NOT EXISTS (SELECT 1 FROM poc_people WHERE name = 'Rico Santos');

INSERT INTO poc_people (initials, name, role, pending, sort_order)
SELECT 'CL', 'Clarisse Lim', 'Song Learning POC', '4 pending', 3
WHERE NOT EXISTS (SELECT 1 FROM poc_people WHERE name = 'Clarisse Lim');

INSERT INTO quick_tools (icon, label, sort_order)
SELECT 'bi-file-earmark-spreadsheet', 'Generate onboarding report', 1
WHERE NOT EXISTS (SELECT 1 FROM quick_tools);

INSERT INTO quick_tools (icon, label, sort_order)
SELECT 'bi-funnel', 'Filter by completion status', 2
WHERE NOT EXISTS (SELECT 1 FROM quick_tools WHERE label = 'Filter by completion status');

INSERT INTO quick_tools (icon, label, sort_order)
SELECT 'bi-book', 'View POC how-to', 3
WHERE NOT EXISTS (SELECT 1 FROM quick_tools WHERE label = 'View POC how-to');

INSERT INTO skill_options (skill, sort_order)
SELECT 'Angular', 1
WHERE NOT EXISTS (SELECT 1 FROM skill_options WHERE skill = 'Angular');

INSERT INTO skill_options (skill, sort_order)
SELECT 'TypeScript', 2
WHERE NOT EXISTS (SELECT 1 FROM skill_options WHERE skill = 'TypeScript');

INSERT INTO skill_options (skill, sort_order)
SELECT 'JavaScript', 3
WHERE NOT EXISTS (SELECT 1 FROM skill_options WHERE skill = 'JavaScript');

INSERT INTO skill_options (skill, sort_order)
SELECT 'Node.js', 4
WHERE NOT EXISTS (SELECT 1 FROM skill_options WHERE skill = 'Node.js');

INSERT INTO skill_options (skill, sort_order)
SELECT 'Express', 5
WHERE NOT EXISTS (SELECT 1 FROM skill_options WHERE skill = 'Express');

INSERT INTO skill_options (skill, sort_order)
SELECT 'SQLite', 6
WHERE NOT EXISTS (SELECT 1 FROM skill_options WHERE skill = 'SQLite');

INSERT INTO skill_options (skill, sort_order)
SELECT 'MySQL', 7
WHERE NOT EXISTS (SELECT 1 FROM skill_options WHERE skill = 'MySQL');

INSERT INTO skill_options (skill, sort_order)
SELECT 'PHP', 8
WHERE NOT EXISTS (SELECT 1 FROM skill_options WHERE skill = 'PHP');

INSERT INTO skill_options (skill, sort_order)
SELECT 'HTML', 9
WHERE NOT EXISTS (SELECT 1 FROM skill_options WHERE skill = 'HTML');

INSERT INTO skill_options (skill, sort_order)
SELECT 'CSS', 10
WHERE NOT EXISTS (SELECT 1 FROM skill_options WHERE skill = 'CSS');

INSERT INTO skill_options (skill, sort_order)
SELECT 'Bootstrap', 11
WHERE NOT EXISTS (SELECT 1 FROM skill_options WHERE skill = 'Bootstrap');

INSERT INTO skill_options (skill, sort_order)
SELECT 'React', 12
WHERE NOT EXISTS (SELECT 1 FROM skill_options WHERE skill = 'React');

INSERT INTO skill_options (skill, sort_order)
SELECT 'Java', 13
WHERE NOT EXISTS (SELECT 1 FROM skill_options WHERE skill = 'Java');

INSERT INTO skill_options (skill, sort_order)
SELECT 'Python', 14
WHERE NOT EXISTS (SELECT 1 FROM skill_options WHERE skill = 'Python');

INSERT INTO skill_options (skill, sort_order)
SELECT 'AWS', 15
WHERE NOT EXISTS (SELECT 1 FROM skill_options WHERE skill = 'AWS');

INSERT INTO skill_options (skill, sort_order)
SELECT 'Azure', 16
WHERE NOT EXISTS (SELECT 1 FROM skill_options WHERE skill = 'Azure');
