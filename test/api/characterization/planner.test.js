// Characterization tests: planner labels, boards, buckets, tasks and deletion logs.
// These pin down current behaviour, bugs included. See docs/found-bugs.md.
const {
  describeEndpoint, MALFORMED_JSON, editDb,
} = require('../../helpers/characterize');

const dropCollection = (name) => editDb((db) => { delete db[name]; });

// ── Labels and boards ────────────────────────────────────────────────────────

describeEndpoint('GET /api/planner-labels', {
  happy: { 'lists labels (ids as numbers)': {} },
  invalid: { 'malformed JSON body': MALFORMED_JSON },
  notFound: { 'planner-labels collection missing': { setup: dropCollection('planner-labels') } },
});

describeEndpoint('GET /api/planner-boards', {
  happy: {
    'lists boards with ids coerced to numbers (as the planner sends it)': {},
    'filters by groupNumber': { path: '/api/planner-boards?groupNumber=5' },
  },
  invalid: {
    'non-numeric groupNumber matches nothing': { path: '/api/planner-boards?groupNumber=abc' },
    'empty groupNumber matches nothing': { path: '/api/planner-boards?groupNumber=' },
    'malformed JSON body': MALFORMED_JSON,
  },
  notFound: {
    'group with no board': { path: '/api/planner-boards?groupNumber=3' },
    'planner-boards collection missing': { setup: dropCollection('planner-boards') },
  },
});

// ── Buckets ──────────────────────────────────────────────────────────────────

describeEndpoint('GET /api/planner-buckets', {
  happy: {
    'filters by boardId (as the planner sends it)': { path: '/api/planner-buckets?boardId=2' },
    'lists every bucket with ids coerced to numbers': {},
  },
  invalid: {
    'non-numeric boardId matches nothing': { path: '/api/planner-buckets?boardId=abc' },
    'malformed JSON body': MALFORMED_JSON,
  },
  notFound: {
    'board that does not exist': { path: '/api/planner-buckets?boardId=99' },
    'planner-buckets collection missing': { setup: dropCollection('planner-buckets'), path: '/api/planner-buckets?boardId=2' },
  },
});

describeEndpoint('POST /api/planner-buckets', {
  happy: {
    'auto-creates a sprint bucket (as the planner sends it)': { body: { boardId: 1, name: 'Sprint 1', order: 0 } },
    'string boardId and order are coerced; name trimmed': { body: { boardId: '1', name: '  Sprint 1  ', order: '2' } },
  },
  invalid: {
    'missing name': { body: { boardId: 1 } },
    'boardId 0': { body: { boardId: 0, name: 'Sprint 1' } },
    'whitespace-only name is stored as empty': { body: { boardId: 1, name: '   ' } },
    'non-numeric boardId is stored as null': { body: { boardId: 'abc', name: 'Sprint 1' } },
    // JSON has no Infinity: 1e999 parses to it, and db.json stores it as null.
    'infinite boardId and order (1e999) are stored as null; the list shows boardId 0': {
      rawBody: '{"boardId": 1e999, "name": "Sprint 9", "order": 1e999}',
    },
    'duplicate bucket name on the same board is accepted': { body: { boardId: 2, name: 'Sprint 2', order: 1 } },
    'no body': {},
    'malformed JSON body': MALFORMED_JSON,
  },
  notFound: {
    'board that does not exist is accepted': { body: { boardId: 99, name: 'Sprint 1', order: 0 } },
    'planner-buckets collection missing': { setup: dropCollection('planner-buckets'), body: { boardId: 1, name: 'Sprint 1', order: 0 } },
  },
});

// ── Tasks ────────────────────────────────────────────────────────────────────

// The full PlannerTask the planner sends when a task is created.
const newTask = {
  boardId: 1,
  bucketId: 4,
  title: 'Build a React form with validation',
  status: 'Not started',
  priority: 'Medium',
  startDate: '2026-10-28',
  dueDate: '2026-11-06',
  labels: [2, 4],
  assignee: 'miguel.a.torres',
  checklist: [{ id: 1, text: 'Pick a form library', done: false }],
  description: '<p>Practice controlled inputs</p>',
  acceptanceCriteria: '<ul><li>All fields validated</li></ul>',
  comments: [],
  completed: false,
  createdAt: '2026-10-28T01:00:00.000Z',
  updatedAt: '2026-10-28T01:00:00.000Z',
};

describeEndpoint('GET /api/planner-tasks', {
  happy: {
    'filters by boardId (as the planner sends it)': { path: '/api/planner-tasks?boardId=2' },
    'lists every task with ids coerced to numbers': {},
  },
  invalid: {
    'non-numeric boardId matches nothing': { path: '/api/planner-tasks?boardId=abc' },
    'malformed JSON body': MALFORMED_JSON,
  },
  notFound: {
    'board that does not exist': { path: '/api/planner-tasks?boardId=99' },
    'planner-tasks collection missing': { setup: dropCollection('planner-tasks'), path: '/api/planner-tasks?boardId=2' },
  },
});

describeEndpoint('POST /api/planner-tasks', {
  happy: {
    'creates a task (as the planner sends it); client timestamps replaced': { body: newTask },
    'string boardId and bucketId are coerced': { body: { ...newTask, boardId: '1', bucketId: '4' } },
  },
  invalid: {
    'empty object: boardId and bucketId stored as null': { body: {} },
    'infinite boardId and bucketId (1e999, -1e999) are stored as null; the list shows 0': {
      rawBody: '{"title": "Infinite", "boardId": 1e999, "bucketId": -1e999}',
    },
    'no title, status or assignee is accepted': { body: { boardId: 1, bucketId: 4 } },
    'client id is overwritten; unknown fields dropped': { body: { ...newTask, id: 1, isAdmin: true } },
    'completed flag contradicting status is accepted': { body: { ...newTask, status: 'Not started', completed: true } },
    'no body': {},
    'malformed JSON body': MALFORMED_JSON,
  },
  notFound: {
    'board and bucket that do not exist are accepted': { body: { ...newTask, boardId: 99, bucketId: 99 } },
    'bucket on a different board is accepted': { body: { ...newTask, boardId: 1, bucketId: 1 } },
    'planner-tasks collection missing': { setup: dropCollection('planner-tasks'), body: newTask },
  },
});

describeEndpoint('PATCH /api/planner-tasks/:id', {
  happy: {
    'kanban drag to Completed (as the planner sends it)': { path: '/api/planner-tasks/2', body: { status: 'Completed', completed: true } },
    'modal save with the full task, including a new comment': {
      path: '/api/planner-tasks/6',
      body: {
        id: 6,
        boardId: 1,
        bucketId: 4,
        title: 'Next.js routing walkthrough',
        status: 'In progress',
        priority: 'Low',
        startDate: '2026-10-29',
        dueDate: '2026-11-05',
        labels: [2],
        assignee: 'andrea.s.bautista',
        checklist: [],
        description: '<p>Walk through the app router</p>',
        acceptanceCriteria: '',
        comments: [{ id: 1, author: 'Miguel Torres', text: 'Can we cover layouts too?', createdAt: '2026-11-04T05:00:00.000Z' }],
        completed: false,
        createdAt: '2026-10-29T02:00:00.000Z',
        updatedAt: '2026-11-01T02:00:00.000Z',
      },
    },
  },
  invalid: {
    'non-numeric boardId is stored as null': { path: '/api/planner-tasks/2', body: { boardId: 'abc' } },
    'client createdAt and unknown fields are ignored; id is kept': {
      path: '/api/planner-tasks/2',
      body: { id: 99, createdAt: '2020-01-01T00:00:00.000Z', isAdmin: true },
    },
    'empty body still bumps updatedAt': { path: '/api/planner-tasks/2', body: {} },
    'numbers and text are stored as sent: numeric title, text labels, fractional boardId': {
      path: '/api/planner-tasks/2',
      body: { title: 42, priority: 1, labels: ['2', 'x'], boardId: 1.5 },
    },
    'infinite boardId (1e999) is stored as null; the list shows 0': { path: '/api/planner-tasks/2', rawBody: '{"boardId": 1e999}' },
    'no body': { path: '/api/planner-tasks/2' },
    'malformed JSON body': { path: '/api/planner-tasks/2', ...MALFORMED_JSON },
  },
  notFound: {
    'deleted task 4': { path: '/api/planner-tasks/4', body: { status: 'Completed', completed: true } },
    'unknown id': { path: '/api/planner-tasks/999', body: { status: 'Completed', completed: true } },
    'non-numeric id': { path: '/api/planner-tasks/abc', body: { status: 'Completed', completed: true } },
  },
});

describeEndpoint('DELETE /api/planner-tasks/:id', {
  happy: {
    'deletes task 5': { path: '/api/planner-tasks/5' },
  },
  invalid: {
    'non-numeric id': { path: '/api/planner-tasks/abc' },
    'malformed JSON body': { path: '/api/planner-tasks/5', ...MALFORMED_JSON },
  },
  notFound: {
    'already-deleted task 4': { path: '/api/planner-tasks/4' },
    'unknown id': { path: '/api/planner-tasks/999' },
  },
});

// ── Deletion logs ────────────────────────────────────────────────────────────

const taskDeletionLog = {
  type: 'task-deletion',
  taskId: 5,
  taskTitle: 'Accessibility audit of the onboarding form',
  deletedBy: 'Rafael Mendoza',
  deletedByEid: 'rafael.t.mendoza',
};

describeEndpoint('GET /api/deletion-logs', {
  happy: {
    'lists every log': {},
    'filters by deletedByEid': { path: '/api/deletion-logs?eid=rafael.t.mendoza' },
  },
  invalid: {
    'eid filter is not normalised (case, @domain)': { path: '/api/deletion-logs?eid=Rafael.T.Mendoza%40accenture.com' },
    'malformed JSON body': MALFORMED_JSON,
  },
  notFound: {
    'eid with no logs': { path: '/api/deletion-logs?eid=liza.m.navarro' },
    'deletion-logs collection missing': { setup: dropCollection('deletion-logs') },
  },
});

describeEndpoint('POST /api/deletion-logs', {
  happy: {
    'logs a task deletion (as the planner sends it)': { body: taskDeletionLog },
    'logs a comment deletion': {
      body: {
        type: 'comment-deletion',
        taskId: 3,
        taskTitle: 'PoC: Attendance export to CSV',
        deletedBy: 'Rafael Mendoza',
        deletedByEid: 'rafael.t.mendoza',
        commentAuthor: 'Rafael Mendoza',
        commentText: 'Use the shared date helper for the filename',
        commentCreatedAt: '2026-11-02T07:44:30.112Z',
      },
    },
  },
  invalid: {
    'empty object is stored with an id and deletedAt': { body: {} },
    'unknown type is accepted; unknown fields dropped': { body: { ...taskDeletionLog, type: 'anything', extra: 1 } },
    'client id and deletedAt are overwritten': { body: { ...taskDeletionLog, id: 1, deletedAt: '2020-01-01T00:00:00.000Z' } },
    'text taskId and numeric deletedByEid are stored as sent': { body: { ...taskDeletionLog, taskId: '5', deletedByEid: 77 } },
    'no body': {},
    'malformed JSON body': MALFORMED_JSON,
  },
  notFound: {
    'task that does not exist is accepted': { body: { ...taskDeletionLog, taskId: 999 } },
    'deletion-logs collection missing': { setup: dropCollection('deletion-logs'), body: taskDeletionLog },
  },
});
