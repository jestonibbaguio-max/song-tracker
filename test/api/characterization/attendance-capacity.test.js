// Characterization tests: attendance, attendance options, office locations and
// capacity entries (all in db.json).
// These pin down current behaviour, bugs included. See docs/found-bugs.md.
const {
  describeEndpoint, MALFORMED_JSON, editDb,
} = require('../../helpers/characterize');

const dropCollection = (name) => editDb((db) => { delete db[name]; });

// ── Lookup lists ─────────────────────────────────────────────────────────────

describeEndpoint('GET /api/attendance-options', {
  happy: { 'lists attendance statuses (ids as numbers)': {} },
  invalid: { 'malformed JSON body': MALFORMED_JSON },
  notFound: { 'attendance-options collection missing': { setup: dropCollection('attendance-options') } },
});

describeEndpoint('GET /api/office-locations', {
  happy: { 'lists office locations (ids as numbers)': {} },
  invalid: { 'malformed JSON body': MALFORMED_JSON },
  notFound: { 'office-locations collection missing': { setup: dropCollection('office-locations') } },
});

// ── Attendance ───────────────────────────────────────────────────────────────

describeEndpoint('GET /api/attendance', {
  happy: {
    'lists every record (as the attendance page sends it)': {},
    'filters by year and month (as the planner capacity panel sends it)': { path: '/api/attendance?year=2026&month=11' },
  },
  invalid: {
    'non-numeric month matches nothing': { path: '/api/attendance?year=2026&month=abc' },
    'empty year is ignored': { path: '/api/attendance?year=&month=10' },
    'repeated month parameter': { path: '/api/attendance?month=10&month=11' },
    'malformed JSON body': MALFORMED_JSON,
  },
  notFound: {
    'month with no records': { path: '/api/attendance?year=2025&month=1' },
    'attendance collection missing': { setup: dropCollection('attendance') },
  },
});

const rtoCell = { eid: 'jomar.c.pascual', year: 2026, month: 11, day: 5, status: 'RTO', location: 'Riverside Tech Tower 2' };

describeEndpoint('POST /api/attendance', {
  happy: {
    'records an RTO day with a location (as the attendance page sends it)': { body: rtoCell },
    'records a Present day without a location': { body: { eid: 'liza.m.navarro', year: 2026, month: 11, day: 5, status: 'Present' } },
  },
  invalid: {
    'empty object is stored as-is': { body: {} },
    'unknown status and eid are accepted': { body: { ...rtoCell, eid: 'nobody.here', status: 'Moon base' } },
    'duplicate cell for the same person and day is accepted': {
      body: { eid: 'rafael.t.mendoza', year: 2026, month: 10, day: 27, status: 'Absent' },
    },
    'client id is overwritten by the server id': { body: { ...rtoCell, id: 1 } },
    'non-object JSON (array) stores no fields': { body: ['a', 'b'] },
    'no body': {},
    'malformed JSON body': MALFORMED_JSON,
  },
  notFound: {
    'attendance collection missing': { setup: dropCollection('attendance'), body: rtoCell },
  },
});

describeEndpoint('PATCH /api/attendance/:id', {
  happy: {
    'changes a cell status (as the attendance page sends it)': { path: '/api/attendance/6', body: { status: 'Absent' } },
    'RTO cell changed to Absent keeps its stale location; string id becomes a number': {
      path: '/api/attendance/1',
      body: { status: 'Absent' },
    },
    // The same request, pinning db.json itself: the stored id "1" is rewritten
    // as the number 1 (bug M6), which the logical diff of the stores can't show.
    'RTO cell changed to Absent keeps its stale location; string id becomes a number (raw db.json)': {
      path: '/api/attendance/1',
      body: { status: 'Absent' },
      jsonOnly: 'the string id in db.json is rewritten as a number (M6)',
    },
    'changes an RTO location': { path: '/api/attendance/1', body: { status: 'RTO', location: 'Harbor Point Building B' } },
    'changes an RTO location (raw db.json)': {
      path: '/api/attendance/1', body: { status: 'RTO', location: 'Harbor Point Building B' },
      jsonOnly: 'the string id in db.json is rewritten as a number (M6)',
    },
  },
  invalid: {
    'any status and eid are merged, unknown fields dropped; id cannot be changed': { path: '/api/attendance/6', body: { status: 'Nope', eid: 'nobody.here', id: 99, extra: true } },
    'empty body still rewrites the record': { path: '/api/attendance/2', body: {} },
    // The same request, pinning db.json itself: the stored id "2" is rewritten
    // as the number 2 (bug M6), which the logical diff of the stores can't show.
    'empty body still rewrites the record (raw db.json)': {
      path: '/api/attendance/2', body: {}, jsonOnly: 'the string id in db.json is rewritten as a number (M6)',
    },
    'no body': { path: '/api/attendance/6' },
    'malformed JSON body': { path: '/api/attendance/6', ...MALFORMED_JSON },
  },
  notFound: {
    'unknown id': { path: '/api/attendance/999', body: { status: 'Absent' } },
    'non-numeric id': { path: '/api/attendance/abc', body: { status: 'Absent' } },
  },
});

describeEndpoint('DELETE /api/attendance/:id', {
  happy: {
    'clears a cell stored with a numeric id': { path: '/api/attendance/6' },
    'clears a cell stored with a string id': { path: '/api/attendance/2' },
  },
  invalid: {
    'non-numeric id': { path: '/api/attendance/abc' },
    'malformed JSON body': { path: '/api/attendance/6', ...MALFORMED_JSON },
  },
  notFound: { 'unknown id': { path: '/api/attendance/999' } },
});

// ── Capacity entries ─────────────────────────────────────────────────────────

describeEndpoint('GET /api/capacity-entries', {
  happy: {
    'lists every entry': {},
    'filters by sprintName (as the planner sends it)': { path: '/api/capacity-entries?sprintName=Sprint%202' },
  },
  invalid: {
    'empty sprintName returns everything': { path: '/api/capacity-entries?sprintName=' },
    'sprintName match is case-sensitive': { path: '/api/capacity-entries?sprintName=sprint%202' },
    'malformed JSON body': MALFORMED_JSON,
  },
  notFound: {
    'sprint with no entries': { path: '/api/capacity-entries?sprintName=Sprint%203' },
    'capacity-entries collection missing': { setup: dropCollection('capacity-entries') },
  },
});

describeEndpoint('POST /api/capacity-entries', {
  happy: {
    'creates an entry for a new person and sprint': { body: { sprintName: 'Sprint 3', eid: 'rafael.t.mendoza', cadence: 4, admin: 1, holiday: 0 } },
    'upserts the existing (sprintName, eid) entry and returns 200 (as the planner sends it, with id)': {
      body: { id: 1, sprintName: 'Sprint 2', eid: 'rafael.t.mendoza', cadence: 3, admin: 1, holiday: 0 },
    },
    'upsert with only some fields leaves the others': { body: { sprintName: 'Sprint 2', eid: 'jomar.c.pascual', holiday: 2 } },
  },
  invalid: {
    'missing eid': { body: { sprintName: 'Sprint 3', cadence: 4 } },
    'non-numeric cadence on a new entry becomes 0': { body: { sprintName: 'Sprint 3', eid: 'liza.m.navarro', cadence: 'four' } },
    'non-numeric cadence on an existing entry becomes 0': { body: { sprintName: 'Sprint 2', eid: 'liza.m.navarro', cadence: 'four' } },
    'negative and fractional values are accepted': { body: { sprintName: 'Sprint 3', eid: 'liza.m.navarro', cadence: -2, admin: 0.5 } },
    'eid is not normalised, so a differently-cased eid creates a second entry': {
      body: { sprintName: 'Sprint 2', eid: 'Rafael.T.Mendoza', cadence: 1 },
    },
    'no body': {},
    'malformed JSON body': MALFORMED_JSON,
  },
  notFound: {
    'sprint that does not exist is accepted': { body: { sprintName: 'Sprint 99', eid: 'rafael.t.mendoza', cadence: 4 } },
    'eid that is not on the roster is accepted': { body: { sprintName: 'Sprint 3', eid: 'nobody.here', cadence: 4 } },
    'capacity-entries collection missing': { setup: dropCollection('capacity-entries'), body: { sprintName: 'Sprint 3', eid: 'rafael.t.mendoza', cadence: 4 } },
  },
});
