// Characterization tests: /api/onboarding-resources (custom-onboarding.json).
// These pin down current behaviour, bugs included. See docs/found-bugs.md.
const fs = require('node:fs');
const path = require('node:path');
const {
  describeEndpoint, MALFORMED_JSON, removeFile, steps,
} = require('../../helpers/characterize');

/** Edit custom-onboarding.json in the temp DATA_DIR, writing it the way the server does. */
const editRoster = (fn) => (dataDir) => {
  const file = path.join(dataDir, 'custom-onboarding.json');
  const records = JSON.parse(fs.readFileSync(file, 'utf8'));
  fn(records);
  fs.writeFileSync(file, JSON.stringify(records, null, 2) + '\n', 'utf8');
};

// The full OnboardingForm the Resources page sends (groupNumber as a string).
const newJoiner = {
  name: 'Bea Santos',
  eid: 'bea.l.santos',
  hireDate: '11/02/2026',
  rollInDate: '11/09/2026',
  projectDeployed: 'No',
  deploymentDate: '',
  projectName: '',
  poc: 'andrea.s.bautista',
  dn: 'No',
  rollOffDate: '',
  fromProject: '',
  clLevel: '11',
  groupNumber: '1',
  primarySkill: 'React',
  primaryYears: '1',
  secondarySkill: '',
  secondaryYears: '',
  anotherSkills: ['TypeScript'],
  officeLocation: 'Cebu',
};

// Teresa (id 5) as the edit form would send her back, with two edits.
const teresaEdited = {
  name: 'Teresa Villanueva',
  eid: 'teresa.villanueva',
  hireDate: '05/09/2022',
  rollInDate: '09/14/2026',
  projectDeployed: 'No',
  deploymentDate: '',
  projectName: 'Song Bench',
  poc: 'rafael.t.mendoza',
  dn: 'Yes',
  rollOffDate: '09/11/2026',
  fromProject: 'Retail Loyalty Platform',
  clLevel: '9',
  groupNumber: '5',
  primarySkill: 'AEM',
  primaryYears: '5',
  secondarySkill: 'Java',
  secondaryYears: '3',
  anotherSkills: ['Sling', 'HTL', 'Dispatcher'],
  officeLocation: 'Cebu',
};

// Miguel (id 6) is deployed to "Northwind Commerce".
const miguelForm = {
  name: 'Miguel Torres',
  eid: 'miguel.a.torres',
  hireDate: '01/10/2023',
  rollInDate: '09/15/2026',
  projectDeployed: 'Yes',
  deploymentDate: '10/19/2026',
  projectName: 'Northwind Commerce',
  poc: 'andrea.s.bautista',
  dn: 'No',
  rollOffDate: '',
  fromProject: '',
  clLevel: '10',
  groupNumber: '1',
  primarySkill: 'React',
  primaryYears: '4',
  secondarySkill: 'Node.js',
  secondaryYears: '2',
  anotherSkills: [],
  officeLocation: 'Cebu',
};

describeEndpoint('GET /api/onboarding-resources', {
  happy: {
    'lists every resource, newest first, normalised to camelCase': {},
  },
  invalid: {
    'malformed JSON body': MALFORMED_JSON,
    'stored record with a string id is coerced in the response but not rewritten': {
      setup: editRoster((records) => { records[0].id = '9'; }),
      jsonOnly: 'a string id in custom-onboarding.json',
    },
    'stored record without an id is back-filled and the file rewritten': {
      setup: editRoster((records) => { delete records[3].id; }),
      jsonOnly: 'roster id repair',
    },
    'stored anotherSkills as a JSON string is parsed': {
      setup: editRoster((records) => { records[1].anotherSkills = '["HTML","CSS"]'; }),
      jsonOnly: 'anotherSkills stored as a string in custom-onboarding.json',
    },
    'custom-onboarding.json is not valid JSON': {
      setup: (dataDir) => fs.writeFileSync(path.join(dataDir, 'custom-onboarding.json'), '[{"id": 1,', 'utf8'),
      jsonOnly: 'a corrupt custom-onboarding.json',
    },
  },
  notFound: {
    'custom-onboarding.json missing: reseeded from custom.csv': { setup: removeFile('custom-onboarding.json') },
    'custom-onboarding.json and custom.csv both missing': {
      setup: steps(removeFile('custom-onboarding.json'), removeFile('custom.csv')),
    },
  },
});

describeEndpoint('POST /api/onboarding-resources', {
  happy: {
    'creates a new joiner (as the Resources page sends it)': { body: newJoiner },
    'existing eid is upserted and returns 200': { body: teresaEdited },
    'existing legacy snake_case record is upserted (keys end up mixed)': {
      body: { ...newJoiner, name: 'Kevin Lim', eid: 'kevin.r.lim', groupNumber: '5', primarySkill: 'AEM', poc: 'rafael.t.mendoza' },
    },
    'normalises eid, ISO and D/M dates, yes/no, years and a comma-separated skill string': {
      body: {
        ...newJoiner,
        eid: '  Bea.L.Santos@accenture.com ',
        hireDate: '2026-11-02',
        rollInDate: '13/11/2026',
        dn: 'YES',
        primaryYears: '01.50',
        anotherSkills: 'TypeScript, RxJS, TypeScript, ',
      },
    },
    'projectDeployed "No" forces projectName "Song Bench" and fills a default poc': {
      body: { ...newJoiner, projectName: 'Should be ignored', poc: '' },
    },
    'accepts snake_case input keys': {
      body: {
        name: 'Bea Santos', eid: 'bea.l.santos', hire_date: '11/02/2026', roll_in_date: '11/09/2026',
        group_number: 1, primary_skill: 'React', another_skills: ['TypeScript'], office_location: 'Cebu', cl_level: '11',
      },
    },
  },
  invalid: {
    'missing name': { body: { ...newJoiner, name: '' } },
    'missing eid': { body: { ...newJoiner, eid: '   ' } },
    'missing hireDate': { body: { ...newJoiner, hireDate: '' } },
    'eid with illegal characters': { body: { ...newJoiner, eid: 'bea santos!' } },
    'hireDate in an unsupported format': { body: { ...newJoiner, hireDate: '2026/11/02' } },
    'impossible date passes the format check': { body: { ...newJoiner, hireDate: '02/31/2026' } },
    'optional deploymentDate in a bad format': { body: { ...newJoiner, projectDeployed: 'Yes', projectName: 'Northwind Commerce', deploymentDate: 'soon' } },
    'out-of-range group silently becomes null': { body: { ...newJoiner, groupNumber: '9' } },
    'group 0 silently becomes null': { body: { ...newJoiner, groupNumber: 0 } },
    'unknown fields are dropped': { body: { ...newJoiner, id: 1, created_at: '2020-01-01T00:00:00.000Z', isAdmin: true } },
    'no body': {},
    'malformed JSON body': MALFORMED_JSON,
  },
  notFound: {
    'custom-onboarding.json missing: reseeded from custom.csv, then created': {
      setup: removeFile('custom-onboarding.json'),
      body: newJoiner,
    },
  },
});

describeEndpoint('PATCH /api/onboarding-resources/:id', {
  happy: {
    'saves the edit form (full object, as the Resources page sends it)': { path: '/api/onboarding-resources/5', body: teresaEdited },
    'changing the eid appends a new record and leaves the old one (201)': {
      path: '/api/onboarding-resources/5',
      body: { ...teresaEdited, eid: 'teresa.m.villanueva' },
    },
    'editing a legacy snake_case record adds camelCase keys alongside': {
      path: '/api/onboarding-resources/2',
      body: { ...newJoiner, name: 'Nina Castro', eid: 'nina.g.castro', hireDate: '05/18/2026', rollInDate: '06/01/2026', primarySkill: 'React Native' },
    },
  },
  invalid: {
    'partial body without name and eid': { path: '/api/onboarding-resources/5', body: { clLevel: '8' } },
    'partial body with name and eid blanks every other field': {
      path: '/api/onboarding-resources/6',
      body: { name: 'Miguel Torres', eid: 'miguel.a.torres', clLevel: '9' },
    },
    'eid that belongs to another record': { path: '/api/onboarding-resources/5', body: { ...teresaEdited, eid: 'rafael.t.mendoza' } },
    'dates are optional on PATCH: omitting them blanks them': {
      path: '/api/onboarding-resources/6',
      body: { ...miguelForm, hireDate: '', rollInDate: '' },
    },
    'bad rollOffDate format': { path: '/api/onboarding-resources/5', body: { ...teresaEdited, rollOffDate: '9/11/26' } },
    'out-of-range group silently becomes null': { path: '/api/onboarding-resources/5', body: { ...teresaEdited, groupNumber: '7' } },
    'no body': { path: '/api/onboarding-resources/5' },
    'malformed JSON body': { path: '/api/onboarding-resources/5', ...MALFORMED_JSON },
  },
  notFound: {
    'unknown id': { path: '/api/onboarding-resources/999', body: teresaEdited },
    'non-numeric id': { path: '/api/onboarding-resources/abc', body: teresaEdited },
    'unknown id with an invalid body (404 wins over 400)': { path: '/api/onboarding-resources/999', body: {} },
  },
});

describeEndpoint('DELETE /api/onboarding-resources/:id', {
  happy: {
    'deletes jomar (attendance, capacity, competency, tasks and reachouts that reference him stay)': {
      path: '/api/onboarding-resources/7',
    },
    'deletes a legacy snake_case record': { path: '/api/onboarding-resources/1' },
  },
  invalid: {
    'non-numeric id': { path: '/api/onboarding-resources/abc' },
    'malformed JSON body': { path: '/api/onboarding-resources/7', ...MALFORMED_JSON },
  },
  notFound: {
    'unknown id': { path: '/api/onboarding-resources/999' },
  },
});
