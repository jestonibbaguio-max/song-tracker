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

module.exports = { WRITABLE_FIELDS, pickWritable };
