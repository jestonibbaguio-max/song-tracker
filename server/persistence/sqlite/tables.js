// How each collection's API fields map to its table's columns, and how values
// cross between JS and SQLite (docs/sqlite-migration-plan.md, "Schema" and
// "Binding rules for better-sqlite3"). The import and the stores both go
// through toColumns() / fromColumns(), so a value is stored and read back the
// same way whichever wrote it.
//
// A column is one of:
//   value  stored as it is: a number, a string or null. NaN is stored as NULL
//          (bound explicitly, not left to the driver). A boolean, object or
//          array can't be held by a scalar column and is refused (bug L18).
//   json   JSON.stringify of any value, so arrays, objects and null round-trip.
//   bool   true/false as 1/0, read back as a boolean. Any other value is stored
//          as its truthiness (bug L18).
//
// `optional`: NULL means the row doesn't have the field, so fromColumns()
// leaves it out. Every other column is always returned, null included.
//
// Infinity and -Infinity (e.g. 1e999 in a request body) are stored as they
// are, and read back as null: db.json can't hold them, and JSON.stringify
// saved them as null. So a row reads back as the JSON backend would read it
// (a task's boardId then lists as 0, from Number(null)).

const value = (api, column, optional = false) => ({ api, column, kind: 'value', optional });
const json = (api, column, optional = false) => ({ api, column, kind: 'json', optional });
const bool = (api, column, optional = false) => ({ api, column, kind: 'bool', optional });
const OPTIONAL = true;

const TABLES = {
  'onboarding-resources': {
    table: 'onboarding_resources',
    columns: [
      value('id', 'id'), value('eid', 'eid'), value('name', 'name'), value('hireDate', 'hire_date'),
      value('rollInDate', 'roll_in_date'), value('projectDeployed', 'project_deployed'),
      value('deploymentDate', 'deployment_date'), value('projectName', 'project_name'), value('poc', 'poc'),
      value('dn', 'dn'), value('rollOffDate', 'roll_off_date'), value('fromProject', 'from_project'),
      value('clLevel', 'cl_level'), value('groupNumber', 'group_number'), value('primarySkill', 'primary_skill'),
      value('primaryYears', 'primary_years'), value('secondarySkill', 'secondary_skill'),
      value('secondaryYears', 'secondary_years'), json('anotherSkills', 'another_skills'),
      value('officeLocation', 'office_location'),
      // Stored records keep these two in snake_case, as the roster file does:
      // the resources list sorts on created_at.
      value('created_at', 'created_at'), value('updated_at', 'updated_at'),
    ],
  },
  sprints: {
    table: 'sprints',
    columns: [value('id', 'id'), value('name', 'name'), value('start', 'start_date'), value('end', 'end_date')],
  },
  'sprint-retros': {
    table: 'sprint_retros',
    columns: [value('id', 'id'), value('sprintId', 'sprint_id'), value('groupNumber', 'group_number'),
      value('category', 'category'), value('text', 'text'), value('createdAt', 'created_at')],
  },
  'capacity-entries': {
    table: 'capacity_entries',
    columns: [value('id', 'id'), value('sprintName', 'sprint_name'), value('eid', 'eid'), value('cadence', 'cadence'),
      value('admin', 'admin'), value('holiday', 'holiday')],
  },
  attendance: {
    table: 'attendance',
    columns: [value('id', 'id'), value('eid', 'eid', OPTIONAL), value('year', 'year', OPTIONAL),
      value('month', 'month', OPTIONAL), value('day', 'day', OPTIONAL), value('status', 'status', OPTIONAL),
      value('location', 'location', OPTIONAL)],
  },
  'attendance-options': { table: 'attendance_options', columns: [value('id', 'id'), value('label', 'label')] },
  'office-locations': { table: 'office_locations', columns: [value('id', 'id'), value('name', 'name')] },
  'planner-labels': { table: 'planner_labels', columns: [value('id', 'id'), value('name', 'name'), value('color', 'color')] },
  'planner-boards': {
    table: 'planner_boards',
    columns: [value('id', 'id'), value('groupNumber', 'group_number'), value('name', 'name'),
      value('description', 'description', OPTIONAL)],
  },
  'planner-buckets': {
    table: 'planner_buckets',
    columns: [value('id', 'id'), value('boardId', 'board_id'), value('name', 'name'), value('order', 'sort_order')],
  },
  'planner-tasks': {
    table: 'planner_tasks',
    columns: [
      value('id', 'id'), value('boardId', 'board_id'), value('bucketId', 'bucket_id'),
      value('title', 'title', OPTIONAL), value('status', 'status', OPTIONAL), value('priority', 'priority', OPTIONAL),
      value('startDate', 'start_date', OPTIONAL), value('dueDate', 'due_date', OPTIONAL),
      value('assignee', 'assignee', OPTIONAL), json('labels', 'labels', OPTIONAL),
      json('checklist', 'checklist', OPTIONAL), json('comments', 'comments', OPTIONAL),
      value('description', 'description', OPTIONAL), value('acceptanceCriteria', 'acceptance_criteria', OPTIONAL),
      bool('completed', 'completed', OPTIONAL), value('completedDate', 'completed_date', OPTIONAL),
      value('notes', 'notes', OPTIONAL), value('createdAt', 'created_at'), value('updatedAt', 'updated_at'),
    ],
  },
  'deletion-logs': {
    table: 'deletion_logs',
    columns: [
      value('id', 'id'), value('type', 'type', OPTIONAL), value('taskId', 'task_id', OPTIONAL),
      value('taskTitle', 'task_title', OPTIONAL), value('deletedBy', 'deleted_by', OPTIONAL),
      value('deletedByEid', 'deleted_by_eid', OPTIONAL), value('commentAuthor', 'comment_author', OPTIONAL),
      value('commentText', 'comment_text', OPTIONAL), value('commentCreatedAt', 'comment_created_at', OPTIONAL),
      value('deletedAt', 'deleted_at'),
    ],
  },
  'project-reachouts': {
    table: 'project_reachouts',
    columns: [
      value('id', 'id'), value('eid', 'eid'), value('projectName', 'project_name'), value('techRole', 'tech_role'),
      value('pocEid', 'poc_eid'), value('status', 'status'), value('details', 'details'),
      value('groupNumber', 'group_number'), value('createdAt', 'created_at'), value('updatedAt', 'updated_at', OPTIONAL),
    ],
  },
  'competency-records': {
    table: 'competency_records',
    columns: [
      value('eid', 'eid'), value('primarySkill', 'primary_skill', OPTIONAL),
      value('primaryProficiency', 'primary_proficiency', OPTIONAL),
      value('recentRetakeDate', 'recent_retake_date', OPTIONAL), value('nextRetakeDate', 'next_retake_date', OPTIONAL),
      value('secondarySkill', 'secondary_skill', OPTIONAL),
      value('secondaryProficiency', 'secondary_proficiency', OPTIONAL), value('retakeDate', 'retake_date', OPTIONAL),
    ],
  },
};

function spec(collection) {
  const found = TABLES[collection];
  if (!found) throw new Error(`no SQLite table for "${collection}"`);
  return found;
}

function describe(v) {
  if (Array.isArray(v)) return 'an array';
  if (v === null) return 'null';
  return typeof v === 'object' ? 'an object' : `a ${typeof v}`;
}

/** One value as it is bound to its column. */
function bindValue(collection, column, v) {
  if (v === undefined) return null;
  if (column.kind === 'json') return JSON.stringify(v);
  if (column.kind === 'bool') return v === null ? null : (v ? 1 : 0);
  if (v === null || typeof v === 'string' || typeof v === 'bigint') return v;
  if (typeof v === 'number') return Number.isNaN(v) ? null : v;
  throw new TypeError(`${collection}.${column.api} can't be ${describe(v)} on the SQLite backend (bug L18 in docs/found-bugs.md)`);
}

/**
 * The bind parameters for a row: { column: value } for every column of the
 * table. A field the row doesn't have is NULL. Fields that aren't columns are
 * ignored (the services pass only their collection's fields).
 */
function toColumns(collection, row) {
  const { columns } = spec(collection);
  const params = {};
  for (const column of columns) params[column.column] = bindValue(collection, column, row[column.api]);
  return params;
}

/** A row read from the table, as API fields. An optional column that is NULL is left out. */
function fromColumns(collection, record) {
  const { columns } = spec(collection);
  const row = {};
  for (const column of columns) {
    const v = record[column.column];
    if (v === null && column.optional) continue;
    if (v === Infinity || v === -Infinity) row[column.api] = null;
    else if (v === null || column.kind === 'value') row[column.api] = v;
    else if (column.kind === 'json') row[column.api] = JSON.parse(v);
    else row[column.api] = v === 1;
  }
  return row;
}

/** INSERT INTO <table> (every column) VALUES (@every column). */
function insertSql(collection) {
  const { table, columns } = spec(collection);
  return `INSERT INTO ${table} (${columns.map((c) => c.column).join(', ')}) VALUES (${columns.map((c) => '@' + c.column).join(', ')})`;
}

/** UPDATE <table> SET (every column but the key) WHERE key = @key. */
function updateSql(collection, key = 'id') {
  const { table, columns } = spec(collection);
  const set = columns.filter((c) => c.column !== key).map((c) => `${c.column} = @${c.column}`).join(', ');
  return `UPDATE ${table} SET ${set} WHERE ${key} = @${key}`;
}

module.exports = { TABLES, spec, toColumns, fromColumns, insertSql, updateSql, bindValue };
