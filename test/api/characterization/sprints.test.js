// Characterization tests: /api/sprints and /api/sprint-retros.
// These pin down current behaviour, bugs included. See docs/found-bugs.md.
const {
  describeEndpoint, MALFORMED_JSON, editDb, addBom, removeFile,
} = require('../../helpers/characterize');

const dropCollection = (name) => editDb((db) => { delete db[name]; });

// ── Sprints ──────────────────────────────────────────────────────────────────

describeEndpoint('GET /api/sprints', {
  happy: {
    'lists every sprint': {},
  },
  invalid: {
    'malformed JSON body': MALFORMED_JSON,
  },
  notFound: {
    'sprints collection missing': { setup: dropCollection('sprints') },
    'db.json missing': { setup: removeFile('db.json') },
    'db.json starts with a UTF-8 BOM': { setup: addBom('db.json') },
  },
});

describeEndpoint('POST /api/sprints', {
  happy: {
    'creates a sprint (as the planner sends it)': { body: { name: 'Sprint 4', start: '2026-11-24', end: '2026-12-05' } },
    'trims the name and stringifies dates': { body: { name: '  Sprint 4  ', start: 20261124, end: 20261205 } },
  },
  invalid: {
    'missing end': { body: { name: 'Sprint 4', start: '2026-11-24' } },
    'empty name': { body: { name: '', start: '2026-11-24', end: '2026-12-05' } },
    'whitespace-only name': { body: { name: '   ', start: '2026-11-24', end: '2026-12-05' } },
    'dates are not validated': { body: { name: 'Sprint 4', start: 'not-a-date', end: 'yesterday' } },
    'end before start': { body: { name: 'Sprint 4', start: '2026-12-05', end: '2026-11-24' } },
    'no body': {},
    'malformed JSON body': MALFORMED_JSON,
  },
  notFound: {
    'sprints collection missing': { setup: dropCollection('sprints'), body: { name: 'Sprint 1', start: '2026-10-13', end: '2026-10-24' } },
    'db.json starts with a UTF-8 BOM': { setup: addBom('db.json'), body: { name: 'Sprint 4', start: '2026-11-24', end: '2026-12-05' } },
  },
});

describeEndpoint('PATCH /api/sprints/:id', {
  happy: {
    'renames and moves sprint 3 (as the planner sends it)': {
      path: '/api/sprints/3',
      body: { name: 'Sprint 3 (extended)', start: '2026-11-10', end: '2026-11-28' },
    },
    'partial update: end only': { path: '/api/sprints/3', body: { end: '2026-11-28' } },
    'ignores unknown fields': { path: '/api/sprints/3', body: { id: 99, goal: 'ship it' } },
  },
  invalid: {
    'empty name is accepted': { path: '/api/sprints/3', body: { name: '' } },
    'null start becomes the string "null"': { path: '/api/sprints/3', body: { start: null } },
    'no body': { path: '/api/sprints/3' },
    'malformed JSON body': { path: '/api/sprints/3', ...MALFORMED_JSON },
  },
  notFound: {
    'unknown id': { path: '/api/sprints/999', body: { name: 'Nope' } },
    'non-numeric id': { path: '/api/sprints/abc', body: { name: 'Nope' } },
    'unknown id with no body': { path: '/api/sprints/999' },
  },
});

describeEndpoint('DELETE /api/sprints/:id', {
  happy: {
    'deletes sprint 3 (buckets, retros and capacity that reference it are left in place)': { path: '/api/sprints/3' },
    'deletes sprint 1, which retros reference by id': { path: '/api/sprints/1' },
  },
  invalid: {
    'non-numeric id': { path: '/api/sprints/abc' },
    'malformed JSON body': { path: '/api/sprints/3', ...MALFORMED_JSON },
  },
  notFound: {
    'unknown id': { path: '/api/sprints/999' },
  },
});

// ── Sprint retros ────────────────────────────────────────────────────────────

describeEndpoint('GET /api/sprint-retros', {
  happy: {
    'lists every retro item': {},
    'filters by sprintId (as the retros page sends it)': { path: '/api/sprint-retros?sprintId=1' },
    'filters by sprintId and groupNumber': { path: '/api/sprint-retros?sprintId=2&groupNumber=1' },
  },
  invalid: {
    'non-numeric sprintId': { path: '/api/sprint-retros?sprintId=abc' },
    'empty groupNumber': { path: '/api/sprint-retros?groupNumber=' },
    'malformed JSON body': MALFORMED_JSON,
  },
  notFound: {
    'sprint with no retros': { path: '/api/sprint-retros?sprintId=3' },
    'sprint that does not exist': { path: '/api/sprint-retros?sprintId=999' },
    'sprint-retros collection missing': { setup: dropCollection('sprint-retros') },
  },
});

const retro = { sprintId: 2, groupNumber: 5, category: 'went-well', text: 'Daily pairing on AEM components kept everyone unblocked' };

describeEndpoint('POST /api/sprint-retros', {
  happy: {
    'adds a retro item (as the retros page sends it)': { body: retro },
    'coerces numeric strings and trims text': { body: { ...retro, sprintId: '2', groupNumber: '1', text: '  padded  ' } },
    'text of exactly 500 characters': { body: { ...retro, text: 'x'.repeat(500) } },
  },
  invalid: {
    'unknown category': { body: { ...retro, category: 'meh' } },
    'text over 500 characters': { body: { ...retro, text: 'x'.repeat(501) } },
    'whitespace-only text': { body: { ...retro, text: '   ' } },
    'groupNumber 0': { body: { ...retro, groupNumber: 0 } },
    'groupNumber 99 is accepted (no upper bound)': { body: { ...retro, groupNumber: 99 } },
    'fractional sprintId': { body: { ...retro, sprintId: 1.5 } },
    'extra fields are dropped': { body: { ...retro, id: 42, createdAt: '2020-01-01T00:00:00.000Z', author: 'x' } },
    'no body': {},
    'malformed JSON body': MALFORMED_JSON,
  },
  notFound: {
    'sprint does not exist': { body: { ...retro, sprintId: 999 } },
    'sprints collection missing': { setup: dropCollection('sprints'), body: retro },
  },
});

describeEndpoint('PATCH /api/sprint-retros/:id', {
  happy: {
    'edits the text (as the retros page sends it)': { path: '/api/sprint-retros/2', body: { text: 'Author instance setup took three days' } },
    'only text is updatable; other fields are ignored': {
      path: '/api/sprint-retros/2',
      body: { text: 'Edited', category: 'went-well', sprintId: 3, groupNumber: 1, createdAt: '2020-01-01T00:00:00.000Z' },
    },
  },
  invalid: {
    'empty text': { path: '/api/sprint-retros/2', body: { text: '' } },
    'text over 500 characters': { path: '/api/sprint-retros/2', body: { text: 'x'.repeat(501) } },
    'numeric text is stringified': { path: '/api/sprint-retros/2', body: { text: 12345 } },
    'no body': { path: '/api/sprint-retros/2' },
    'malformed JSON body': { path: '/api/sprint-retros/2', ...MALFORMED_JSON },
  },
  notFound: {
    'unknown id': { path: '/api/sprint-retros/999', body: { text: 'x' } },
    'id 3 (deleted earlier, gap in ids)': { path: '/api/sprint-retros/3', body: { text: 'x' } },
    'non-numeric id': { path: '/api/sprint-retros/abc', body: { text: 'x' } },
  },
});

describeEndpoint('DELETE /api/sprint-retros/:id', {
  happy: {
    'deletes retro 1': { path: '/api/sprint-retros/1' },
  },
  invalid: {
    'non-numeric id': { path: '/api/sprint-retros/abc' },
  },
  notFound: {
    'unknown id': { path: '/api/sprint-retros/999' },
    'id 3 (deleted earlier, gap in ids)': { path: '/api/sprint-retros/3' },
  },
});
