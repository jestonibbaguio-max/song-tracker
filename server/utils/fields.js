// The fields a client may write, per collection, by their API names
// (docs/sqlite-migration-plan.md, schema and Phase 3, bug M12). Server fields
// (id, createdAt, updatedAt, deletedAt) are never on these lists: the
// services set them.

const WRITABLE_FIELDS = {
  attendance: ['eid', 'year', 'month', 'day', 'status', 'location'],
  'planner-tasks': ['boardId', 'bucketId', 'title', 'status', 'priority', 'startDate', 'dueDate', 'assignee', 'labels',
    'checklist', 'comments', 'description', 'acceptanceCriteria', 'completed', 'completedDate', 'notes'],
  'deletion-logs': ['type', 'taskId', 'taskTitle', 'deletedBy', 'deletedByEid', 'commentAuthor', 'commentText',
    'commentCreatedAt'],
  // Not eid (the URL names the row), nor name and clLevel (they come from the roster): bug M8.
  'competency-records': ['primarySkill', 'primaryProficiency', 'recentRetakeDate',
    'nextRetakeDate', 'secondarySkill', 'secondaryProficiency', 'retakeDate'],
};

/**
 * The body's own fields that are on the collection's list, in the body's
 * order, values as sent. Anything that isn't a plain object (undefined, null,
 * an array, a string) has no fields.
 */
function pickWritable(collection, body) {
  const allowed = WRITABLE_FIELDS[collection];
  if (!allowed) throw new Error(`no writable fields for "${collection}"`);
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return {};
  const picked = {};
  for (const key of Object.keys(body)) if (allowed.includes(key)) picked[key] = body[key];
  return picked;
}

/**
 * Every field of each collection, by API name, in the schema's column order
 * (docs/sqlite-migration-plan.md, schema). Responses list a row's fields in
 * this order, the order SQLite returns its columns in, so both backends give
 * the same responses. The roster isn't here: formatOnboardingResource already
 * builds every resource in one fixed order.
 */
const COLUMN_ORDER = {
  sprints: ['id', 'name', 'start', 'end'],
  'sprint-retros': ['id', 'sprintId', 'groupNumber', 'category', 'text', 'createdAt'],
  'capacity-entries': ['id', 'sprintName', 'eid', 'cadence', 'admin', 'holiday'],
  attendance: ['id', 'eid', 'year', 'month', 'day', 'status', 'location'],
  'attendance-options': ['id', 'label'],
  'office-locations': ['id', 'name'],
  'planner-labels': ['id', 'name', 'color'],
  'planner-boards': ['id', 'groupNumber', 'name', 'description'],
  'planner-buckets': ['id', 'boardId', 'name', 'order'],
  'planner-tasks': ['id', 'boardId', 'bucketId', 'title', 'status', 'priority', 'startDate', 'dueDate', 'assignee',
    'labels', 'checklist', 'comments', 'description', 'acceptanceCriteria', 'completed', 'completedDate', 'notes',
    'createdAt', 'updatedAt'],
  'deletion-logs': ['id', 'type', 'taskId', 'taskTitle', 'deletedBy', 'deletedByEid', 'commentAuthor', 'commentText',
    'commentCreatedAt', 'deletedAt'],
  'project-reachouts': ['id', 'eid', 'projectName', 'techRole', 'pocEid', 'status', 'details', 'groupNumber',
    'createdAt', 'updatedAt'],
  'competency-records': ['eid', 'primarySkill', 'primaryProficiency', 'recentRetakeDate', 'nextRetakeDate',
    'secondarySkill', 'secondaryProficiency', 'retakeDate'],
};

/**
 * A copy of the row with the collection's fields first, in column order, then
 * any other keys in their stored order. Only the order changes: a field the row
 * doesn't have stays absent, and every value is kept. Anything that isn't a
 * plain object (null, undefined) is returned as it is.
 */
function inColumnOrder(collection, row) {
  const order = COLUMN_ORDER[collection];
  if (!order) throw new Error(`no column order for "${collection}"`);
  if (row === null || typeof row !== 'object' || Array.isArray(row)) return row;
  const out = {};
  for (const field of order) if (Object.prototype.hasOwnProperty.call(row, field)) out[field] = row[field];
  for (const key of Object.keys(row)) if (!Object.prototype.hasOwnProperty.call(out, key)) out[key] = row[key];
  return out;
}

/** inColumnOrder for every row of a list. A value that isn't an array is returned as it is, as before. */
function rowsInColumnOrder(collection, rows) {
  return Array.isArray(rows) ? rows.map((row) => inColumnOrder(collection, row)) : rows;
}

module.exports = { WRITABLE_FIELDS, pickWritable, COLUMN_ORDER, inColumnOrder, rowsInColumnOrder };
