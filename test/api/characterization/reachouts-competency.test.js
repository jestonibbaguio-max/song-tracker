// Characterization tests: /api/project-reachouts and /api/competency-records.
// These pin down current behaviour, bugs included. See docs/found-bugs.md.
const {
  describeEndpoint, MALFORMED_JSON, editDb,
} = require('../../helpers/characterize');

const dropCollection = (name) => editDb((db) => { delete db[name]; });

/** Edit the roster seed (custom-onboarding.json) before the database is built from it. */
const editRoster = (fn) => (dataDir) => {
  const fs = require('node:fs');
  const file = require('node:path').join(dataDir, 'custom-onboarding.json');
  const records = JSON.parse(fs.readFileSync(file, 'utf8'));
  fn(records);
  fs.writeFileSync(file, `${JSON.stringify(records, null, 2)}
`, 'utf8');
};

// ── Project reachouts ────────────────────────────────────────────────────────

// What the reachouts dialog sends when creating one.
const newReachout = {
  eid: 'jomar.c.pascual',
  projectName: 'Harborline Insurance Portal',
  techRole: 'AEM Developer',
  pocEid: 'rafael.t.mendoza',
  status: 'CV Requested',
  details: 'Junior slot, AEM components',
  groupNumber: 5,
};

describeEndpoint('GET /api/project-reachouts', {
  happy: {
    'lists every reachout (as the reachouts page sends it)': {},
    'filters by group': { path: '/api/project-reachouts?group=5' },
  },
  invalid: {
    // Added in Phase 8 before the list filters moved into SQL WHERE clauses.
    'group matches as text: 05 matches nothing': { path: '/api/project-reachouts?group=05' },
    'repeated group matches nothing': { path: '/api/project-reachouts?group=5&group=1' },
    'non-numeric group matches nothing': { path: '/api/project-reachouts?group=abc' },
    'group=null matches the reachout stored with a null group': { path: '/api/project-reachouts?group=null' },
    'malformed JSON body': MALFORMED_JSON,
  },
  notFound: {
    'group with no reachouts': { path: '/api/project-reachouts?group=3' },
    'project-reachouts collection missing': { setup: dropCollection('project-reachouts') },
  },
});

describeEndpoint('POST /api/project-reachouts', {
  happy: {
    'creates a reachout (as the reachouts page sends it)': { body: newReachout },
    'normalises eids, defaults status, and nulls an out-of-range group': {
      body: { ...newReachout, eid: '  Jomar.C.Pascual@accenture.com', pocEid: 'RAFAEL.T.MENDOZA', status: '  ', groupNumber: '7' },
    },
  },
  invalid: {
    'missing projectName, techRole and pocEid': { body: { eid: 'jomar.c.pascual' } },
    'eid that is only a domain': { body: { ...newReachout, eid: '@accenture.com' } },
    'unknown status is accepted': { body: { ...newReachout, status: 'Teleported' } },
    'client id and timestamps are ignored': { body: { ...newReachout, id: 1, createdAt: '2020-01-01T00:00:00.000Z', updatedAt: 'x' } },
    'numeric eid and pocEid become text': { body: { ...newReachout, eid: 1234, pocEid: 5678 } },
    'no body': {},
    'malformed JSON body': MALFORMED_JSON,
  },
  notFound: {
    'eid not on the roster is accepted, group taken from the body': { body: { ...newReachout, eid: 'nobody.here', groupNumber: 2 } },
    'groupNumber that disagrees with the roster is accepted': { body: { ...newReachout, groupNumber: 1 } },
    'project-reachouts collection missing': { setup: dropCollection('project-reachouts'), body: newReachout },
  },
});

describeEndpoint('PATCH /api/project-reachouts/:id', {
  happy: {
    'inline status change (as the reachouts page sends it)': { path: '/api/project-reachouts/2', body: { status: 'Interview Scheduled' } },
    'full edit from the dialog': {
      path: '/api/project-reachouts/2',
      body: { ...newReachout, eid: 'liza.m.navarro', techRole: 'Angular Developer', details: 'Moved to the portal team' },
    },
  },
  invalid: {
    'blank techRole is rejected and nothing is saved': { path: '/api/project-reachouts/2', body: { techRole: '   ' } },
    'blank status falls back to the default': { path: '/api/project-reachouts/1', body: { status: '' } },
    'changing eid keeps the old groupNumber': { path: '/api/project-reachouts/2', body: { eid: 'andrea.s.bautista' } },
    'retired status "On hold" is accepted': { path: '/api/project-reachouts/2', body: { status: 'On hold' } },
    'unknown fields are ignored': { path: '/api/project-reachouts/2', body: { id: 99, createdAt: '2020-01-01T00:00:00.000Z', extra: 1 } },
    'no body still bumps updatedAt': { path: '/api/project-reachouts/2' },
    'malformed JSON body': { path: '/api/project-reachouts/2', ...MALFORMED_JSON },
  },
  notFound: {
    'unknown id': { path: '/api/project-reachouts/999', body: { status: 'Interview Scheduled' } },
    'non-numeric id': { path: '/api/project-reachouts/abc', body: { status: 'Interview Scheduled' } },
  },
});

describeEndpoint('DELETE /api/project-reachouts/:id', {
  happy: { 'deletes reachout 4': { path: '/api/project-reachouts/4' } },
  invalid: {
    'non-numeric id': { path: '/api/project-reachouts/abc' },
    'malformed JSON body': { path: '/api/project-reachouts/4', ...MALFORMED_JSON },
  },
  notFound: { 'unknown id': { path: '/api/project-reachouts/999' } },
});

// ── Competency records ───────────────────────────────────────────────────────

describeEndpoint('GET /api/competency-records', {
  happy: {
    'joins group 5 members with saved rows (as myCompetency sends it)': { path: '/api/competency-records?group=5' },
    'no group defaults to 5': {},
    'group 1: a member with no saved row gets a default row': { path: '/api/competency-records?group=1' },
  },
  invalid: {
    'non-numeric group matches nothing': { path: '/api/competency-records?group=abc' },
    'group=0 lists members with no group (bug L17)': { path: '/api/competency-records?group=0' },
    'malformed JSON body': MALFORMED_JSON,
    "name and clLevel sent in a PATCH don't replace the roster values (bug M8)": {
      path: '/api/competency-records?group=5',
      before: [{ method: 'PATCH', path: '/api/competency-records/liza.m.navarro', body: { name: 'Hidden Name', clLevel: '1' } }],
    },
    // Added in Phase 8 before the competency clean-up (one SQL JOIN), to pin
    // how the group value and the join behave.
    'empty group defaults to 5': { path: '/api/competency-records?group=' },
    'fractional group matches nothing': { path: '/api/competency-records?group=5.5' },
    'group past the number range matches nothing': { path: '/api/competency-records?group=1e999' },
    'repeated group matches nothing': { path: '/api/competency-records?group=5&group=1' },
    'a member with an empty name is listed under their eid': {
      setup: editRoster((records) => { records.find((r) => r.eid === 'liza.m.navarro').name = ''; }),
      path: '/api/competency-records?group=5',
    },
    'a saved row with only some fields is listed as saved, without the default fields': {
      path: '/api/competency-records?group=5',
      before: [{ method: 'PATCH', path: '/api/competency-records/kevin.r.lim', body: { primarySkill: 'AEM' } }],
    },
    'a row saved under a differently-cased eid is not joined (bug M9)': {
      path: '/api/competency-records?group=5',
      before: [{ method: 'PATCH', path: '/api/competency-records/Liza.M.Navarro', body: { primaryProficiency: 'P1' } }],
    },
  },
  notFound: {
    'group with no members': { path: '/api/competency-records?group=3' },
    'competency-records collection missing: every member gets a default row': {
      setup: dropCollection('competency-records'),
      path: '/api/competency-records?group=5',
    },
  },
});

describeEndpoint('PATCH /api/competency-records/:eid', {
  happy: {
    'updates one field (as myCompetency sends it)': { path: '/api/competency-records/liza.m.navarro', body: { primaryProficiency: 'P3' } },
    'member with no saved row: a row is created with only the sent field': {
      path: '/api/competency-records/miguel.a.torres',
      body: { primarySkill: 'React' },
    },
  },
  invalid: {
    'any value is accepted; unknown fields dropped': { path: '/api/competency-records/liza.m.navarro', body: { primaryProficiency: 'P99', isAdmin: true } },
    'eid in the body is ignored (bug M8)': {
      path: '/api/competency-records/liza.m.navarro',
      body: { eid: 'someone.else' },
    },
    'name and clLevel in the body are ignored (bug M8)': {
      path: '/api/competency-records/liza.m.navarro',
      body: { name: 'Hidden Name', clLevel: '1' },
    },
    'eid in a different case creates a second row': { path: '/api/competency-records/Liza.M.Navarro', body: { primaryProficiency: 'P1' } },
    'numeric eid in the path is text; numeric values are stored as numbers': {
      path: '/api/competency-records/1234',
      body: { primaryProficiency: 3, retakeDate: 20261201 },
    },
    'no body: the row is rewritten unchanged': { path: '/api/competency-records/liza.m.navarro' },
    'no body for a new eid: a row with only eid is created': { path: '/api/competency-records/kevin.r.lim' },
    'malformed JSON body': { path: '/api/competency-records/liza.m.navarro', ...MALFORMED_JSON },
  },
  notFound: {
    'eid not on the roster: a row is created anyway': { path: '/api/competency-records/nobody.here', body: { primaryProficiency: 'P2' } },
    'competency-records collection missing': {
      setup: dropCollection('competency-records'),
      path: '/api/competency-records/liza.m.navarro',
      body: { primaryProficiency: 'P3' },
    },
  },
});
