// dumpStore(): every stored collection, read through the feature stores and
// mapped to canonical rows (docs/sqlite-migration-plan.md, Phase 2).
//
// The characterization snapshots record the storage side of a request as a
// logical diff of two dumps: rows added, changed and removed per collection.
// A dump never looks at the database file. It reads each collection through
// the running app's store (features/<name>/<name>.repository.js), then passes
// every row through canonicalRow(). That mapping was built in Phase 2 so the
// JSON and SQLite backends dumped the same rows; since Phase 8 only SQLite
// remains, and its rows only need the roster's created_at/updated_at renamed:
//
//   - Ids are numbers. A numeric-string id ("1") becomes 1, and so do the ids
//     in a planner task's `labels`. Any other id is left as it is.
//   - Roster records have one key per field. custom-onboarding.json stores
//     some fields twice (camelCase and snake_case, sometimes disagreeing; bug
//     L9). The canonical record takes each field the way the API does
//     (formatOnboardingResource: camelCase first, snake_case as the fallback,
//     the same defaults), and the import into SQLite uses the same rule.
//   - Keys come in a fixed order: the schema's column order (the API names),
//     then any other key the row has, in stored order. A field the row doesn't
//     have is left out; a stored null or "" is kept.
//
// dumpStore must not change any data (characterize.js checks that no file in
// DATA_DIR changes while it runs).
const path = require('node:path');
const { SERVER_DIR } = require('./test-server');

/**
 * Each collection: the API field order (from the schema in the plan) and how
 * to list it through its feature's store. `key` is what the logical diff
 * matches rows by.
 */
const COLLECTIONS = [
  {
    name: 'onboarding-resources',
    key: 'id',
    fields: ['id', 'eid', 'name', 'hireDate', 'rollInDate', 'projectDeployed', 'deploymentDate', 'projectName', 'poc', 'dn',
      'rollOffDate', 'fromProject', 'clLevel', 'groupNumber', 'primarySkill', 'primaryYears', 'secondarySkill',
      'secondaryYears', 'anotherSkills', 'officeLocation', 'createdAt', 'updatedAt'],
    list: (repo) => repo('onboarding').list(),
  },
  { name: 'sprints', key: 'id', fields: ['id', 'name', 'start', 'end'], list: (repo) => repo('sprints').read((s) => s.listSprints()) },
  {
    name: 'sprint-retros', key: 'id', fields: ['id', 'sprintId', 'groupNumber', 'category', 'text', 'createdAt'],
    list: (repo) => repo('sprints').read((s) => s.listRetros()),
  },
  {
    name: 'capacity-entries', key: 'id', fields: ['id', 'sprintName', 'eid', 'cadence', 'admin', 'holiday'],
    list: (repo) => repo('capacity').read((s) => s.listEntries()),
  },
  {
    name: 'attendance', key: 'id', fields: ['id', 'eid', 'year', 'month', 'day', 'status', 'location'],
    list: (repo) => repo('attendance').read((s) => s.listRecords()),
  },
  { name: 'attendance-options', key: 'id', fields: ['id', 'label'], list: (repo) => repo('lookups').read((s) => s.attendanceOptions()) },
  { name: 'office-locations', key: 'id', fields: ['id', 'name'], list: (repo) => repo('lookups').read((s) => s.officeLocations()) },
  { name: 'planner-labels', key: 'id', fields: ['id', 'name', 'color'], list: (repo) => repo('lookups').read((s) => s.plannerLabels()) },
  {
    name: 'planner-boards', key: 'id', fields: ['id', 'groupNumber', 'name', 'description'],
    list: (repo) => repo('planner').read((s) => s.listBoards()),
  },
  {
    name: 'planner-buckets', key: 'id', fields: ['id', 'boardId', 'name', 'order'],
    list: (repo) => repo('planner').read((s) => s.listBuckets()),
  },
  {
    name: 'planner-tasks',
    key: 'id',
    fields: ['id', 'boardId', 'bucketId', 'title', 'status', 'priority', 'startDate', 'dueDate', 'assignee', 'labels',
      'checklist', 'comments', 'description', 'acceptanceCriteria', 'completed', 'completedDate', 'notes', 'createdAt', 'updatedAt'],
    list: (repo) => repo('planner').read((s) => s.listTasks()),
  },
  {
    name: 'deletion-logs',
    key: 'id',
    fields: ['id', 'type', 'taskId', 'taskTitle', 'deletedBy', 'deletedByEid', 'commentAuthor', 'commentText',
      'commentCreatedAt', 'deletedAt'],
    list: (repo) => repo('planner').read((s) => s.listDeletionLogs()),
  },
  {
    name: 'project-reachouts',
    key: 'id',
    fields: ['id', 'eid', 'projectName', 'techRole', 'pocEid', 'status', 'details', 'groupNumber', 'createdAt', 'updatedAt'],
    list: (repo) => repo('reachouts').read((s) => s.listRows()),
  },
  {
    name: 'competency-records',
    key: 'eid',
    fields: ['eid', 'primarySkill', 'primaryProficiency', 'recentRetakeDate', 'nextRetakeDate', 'secondarySkill',
      'secondaryProficiency', 'retakeDate'],
    list: (repo) => repo('competency').read((s) => s.listRecords()),
  },
];

const BY_NAME = new Map(COLLECTIONS.map((c) => [c.name, c]));

/** "1" → 1; anything that isn't a numeric string is returned unchanged. */
function numericId(value) {
  if (typeof value !== 'string' || value.trim() === '') return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : value;
}

/** The roster's field rule, as formatOnboardingResource applies it (server/features/onboarding/onboarding.format.js). */
function mergeRosterKeys(r) {
  const pick = (camel, snake, fallback = '') => r[camel] || r[snake] || fallback;
  let groupNumber = null;
  if (r.groupNumber != null) groupNumber = Number(r.groupNumber);
  else if (r.group_number != null) groupNumber = Number(r.group_number);
  return {
    id: r.id,
    eid: r.eid || '',
    name: r.name || '',
    hireDate: pick('hireDate', 'hire_date'),
    rollInDate: pick('rollInDate', 'roll_in_date'),
    projectDeployed: pick('projectDeployed', 'project_deployed', 'No'),
    deploymentDate: pick('deploymentDate', 'deployment_date'),
    projectName: pick('projectName', 'project_name'),
    poc: r.poc || '',
    dn: r.dn || 'No',
    rollOffDate: pick('rollOffDate', 'roll_off_date'),
    fromProject: pick('fromProject', 'from_project'),
    clLevel: pick('clLevel', 'cl_level'),
    groupNumber,
    primarySkill: pick('primarySkill', 'primary_skill'),
    primaryYears: pick('primaryYears', 'primary_years'),
    secondarySkill: pick('secondarySkill', 'secondary_skill'),
    secondaryYears: pick('secondaryYears', 'secondary_years'),
    anotherSkills: skillTags(r.anotherSkills || r.another_skills),
    officeLocation: pick('officeLocation', 'office_location'),
    createdAt: pick('createdAt', 'created_at'),
    updatedAt: pick('updatedAt', 'updated_at'),
  };
}

function skillTags(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** One stored row of a collection, in canonical form (see the top of this file). */
function canonicalRow(collection, row) {
  const spec = BY_NAME.get(collection);
  if (!spec) throw new Error(`unknown collection "${collection}"`);
  if (row === null || typeof row !== 'object' || Array.isArray(row)) return row;

  const source = collection === 'onboarding-resources' ? mergeRosterKeys(row) : { ...row };
  if ('id' in source) source.id = numericId(source.id);
  if (collection === 'planner-tasks' && Array.isArray(source.labels)) source.labels = source.labels.map(numericId);

  const out = {};
  for (const field of spec.fields) if (field in source) out[field] = source[field];
  for (const [k, v] of Object.entries(source)) if (!(k in out)) out[k] = v;
  return out;
}

/** Every row of a collection, in canonical form and in the order the store lists it. */
function canonicalRows(collection, rows) {
  return rows.map((row) => canonicalRow(collection, row));
}

/**
 * Every collection of the app that is running now (the one startTestServer
 * loaded last), read through its stores: { collection: rows[] }, in
 * COLLECTIONS order.
 */
function dumpStore() {
  const repo = (feature) => require(path.join(SERVER_DIR, 'features', feature, `${feature}.repository.js`));
  const dump = {};
  for (const c of COLLECTIONS) dump[c.name] = canonicalRows(c.name, c.list(repo));
  return dump;
}

module.exports = { dumpStore, canonicalRow, canonicalRows, COLLECTIONS };
