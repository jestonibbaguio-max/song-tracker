// Guardrail 5 (docs/server-restructure-plan.md, step 0): characterization cases for
// the onboarding branches onboarding.test.js doesn't reach, so step 11 (moving
// onboarding-store.js, now server/persistence/json/roster-file.repository.js, and the
// normalize/validate/format code) is covered:
//   - the rollInDate format check
//   - the 500 catch paths in POST and PATCH (and where the try/catch ends)
//   - seeding from custom.csv with quoted fields and names that contain spaces
//   - repair of roster ids that are zero, negative or fractional
// These pin down current behaviour, bugs included. See docs/found-bugs.md.
const { describe, test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runCase, snapshot, CREDENTIALS, removeFile, writeFile, steps } = require('../../helpers/characterize');

const ROSTER = 'custom-onboarding.json';

/** Edit custom-onboarding.json in the temp DATA_DIR, writing it the way the server does. */
const editRoster = (fn) => (dataDir) => {
  const file = path.join(dataDir, ROSTER);
  const records = JSON.parse(fs.readFileSync(file, 'utf8'));
  fn(records);
  fs.writeFileSync(file, JSON.stringify(records, null, 2) + '\n', 'utf8');
};
const setId = (from, to) => editRoster((records) => { records.find((r) => r.id === from).id = to; });

/** Make the roster read-only, so it can still be read but saving it throws (EPERM/EACCES). */
const readOnlyRoster = (dataDir) => fs.chmodSync(path.join(dataDir, ROSTER), 0o444);

// Root on POSIX ignores read-only permissions, so the save would succeed and the
// catch path would not run. Probe once and skip those cases if so.
const READ_ONLY_WORKS = (() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'song-tracker-ro-probe-'));
  const file = path.join(dir, 'probe.json');
  try {
    fs.writeFileSync(file, '[]');
    fs.chmodSync(file, 0o444);
    try { fs.writeFileSync(file, '[1]'); return false; } catch { return true; }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  }
})();
const needsReadOnly = { skip: !READ_ONLY_WORKS && 'read-only files are writable here (running as root?)' };

// Same shape as the Resources page's OnboardingForm (see onboarding.test.js).
const newJoiner = {
  name: 'Bea Santos', eid: 'bea.l.santos', hireDate: '11/02/2026', rollInDate: '11/09/2026',
  projectDeployed: 'No', deploymentDate: '', projectName: '', poc: 'andrea.s.bautista', dn: 'No',
  rollOffDate: '', fromProject: '', clLevel: '11', groupNumber: '1', primarySkill: 'React',
  primaryYears: '1', secondarySkill: '', secondaryYears: '', anotherSkills: ['TypeScript'], officeLocation: 'Cebu',
};
// Teresa (id 5) as the edit form sends her back.
const teresaEdited = {
  name: 'Teresa Villanueva', eid: 'teresa.villanueva', hireDate: '05/09/2022', rollInDate: '09/14/2026',
  projectDeployed: 'No', deploymentDate: '', projectName: 'Song Bench', poc: 'rafael.t.mendoza', dn: 'Yes',
  rollOffDate: '09/11/2026', fromProject: 'Retail Loyalty Platform', clLevel: '9', groupNumber: '5',
  primarySkill: 'AEM', primaryYears: '5', secondarySkill: 'Java', secondaryYears: '3',
  anotherSkills: ['Sling', 'HTL', 'Dispatcher'], officeLocation: 'Cebu',
};

/** One snapshotted request with the group POC's credentials, like the other characterization files. */
function caseTest(name, method, routePath, kase, options = {}) {
  test(name, options, async (t) => {
    snapshot(t, await runCase(method, routePath, kase, CREDENTIALS.poc));
  });
}

// ── rollInDate format check ──────────────────────────────────────────────────

describe('onboarding branches › rollInDate format check', () => {
  caseTest('POST: YYYY/MM/DD is rejected', 'POST', '/api/onboarding-resources',
    { body: { ...newJoiner, rollInDate: '2026/11/09' } });
  caseTest('POST: free text is rejected', 'POST', '/api/onboarding-resources',
    { body: { ...newJoiner, rollInDate: 'next monday' } });
  caseTest('POST: two-digit year is rejected', 'POST', '/api/onboarding-resources',
    { body: { ...newJoiner, rollInDate: '11/9/26' } });
  caseTest('POST: unpadded ISO date is not converted and is rejected', 'POST', '/api/onboarding-resources',
    { body: { ...newJoiner, rollInDate: '2026-11-9' } });
  caseTest('POST: hireDate is checked first when both are bad', 'POST', '/api/onboarding-resources',
    { body: { ...newJoiner, hireDate: 'soon', rollInDate: 'later' } });
  caseTest('PATCH: rollInDate is optional but still format-checked', 'PATCH', '/api/onboarding-resources/5',
    { body: { ...teresaEdited, rollInDate: '9/14/26' } });
});

// ── 500 catch paths ──────────────────────────────────────────────────────────
// POST wraps load + save in try/catch. PATCH loads once before its try (so a
// broken roster there is an uncaught Express 500), then wraps load + save.

describe('onboarding branches › 500 catch paths', () => {
  caseTest('POST: save fails when creating a new joiner', 'POST', '/api/onboarding-resources',
    { setup: readOnlyRoster, body: newJoiner }, needsReadOnly);
  caseTest('POST: save fails when upserting an existing eid', 'POST', '/api/onboarding-resources',
    { setup: readOnlyRoster, body: teresaEdited }, needsReadOnly);
  caseTest('POST: roster is not valid JSON (caught inside the try)', 'POST', '/api/onboarding-resources',
    { setup: writeFile(ROSTER, '[{"id": 1,'), body: newJoiner });
  caseTest('POST: roster and custom.csv both missing (caught inside the try)', 'POST', '/api/onboarding-resources',
    { setup: steps(removeFile(ROSTER), removeFile('custom.csv')), body: newJoiner });

  caseTest('PATCH: save fails when updating', 'PATCH', '/api/onboarding-resources/5',
    { setup: readOnlyRoster, body: teresaEdited }, needsReadOnly);
  caseTest('PATCH: save fails when an eid change appends a new record', 'PATCH', '/api/onboarding-resources/5',
    { setup: readOnlyRoster, body: { ...teresaEdited, eid: 'teresa.m.villanueva' } }, needsReadOnly);
  caseTest('PATCH: roster is not valid JSON (thrown before the try: uncaught 500)', 'PATCH', '/api/onboarding-resources/5',
    { setup: writeFile(ROSTER, '[{"id": 1,'), body: teresaEdited });
  // DELETE (no try/catch) isn't pinned here: its uncaught error page shows the
  // OS error code (EPERM on Windows, EACCES on POSIX), so the snapshot wouldn't be portable.
});

// ── Seeding from custom.csv ──────────────────────────────────────────────────

const QUOTED_CSV = [
  'EID,GROUP,Primary Skill',
  '"Dela Cruz, Juan",3,"React, Angular"',
  'Maria Clara Santos,2,AEM',
  '"Ana ""Bing"" Reyes",4,Java',
  '"carlo.p.lim",1," Vue "',
  '',
].join('\n');

const MESSY_CSV = [
  'EID , GROUP , Primary Skill',
  '',
  'Anna.B.Reyes@accenture.com,,Angular',
  '   Spaced   Out  Name   ,x,',
  'short.row',
  '   ',
  'o"neil.k,6,Node.js',
  '',
].join('\r\n');

const seedFrom = (csv) => steps(removeFile(ROSTER), writeFile('custom.csv', csv));

describe('onboarding branches › seeding from custom.csv', () => {
  caseTest('quoted fields, embedded commas, escaped quotes and names with spaces', 'GET', '/api/onboarding-resources',
    { setup: seedFrom(QUOTED_CSV) });
  caseTest('a quoted skill containing a comma stays one skill option', 'GET', '/api/skill-options',
    { setup: seedFrom(QUOTED_CSV) });
  caseTest('CRLF, blank lines, padded headers, missing and non-numeric groups, a short row', 'GET', '/api/onboarding-resources',
    { setup: seedFrom(MESSY_CSV) });
});

// ── Id repair on read ────────────────────────────────────────────────────────
// Fixture ids are 1–9, so the next id is 10.

describe('onboarding branches › id repair', () => {
  caseTest('id 0 is replaced with max+1', 'GET', '/api/onboarding-resources', { setup: setId(5, 0) });
  caseTest('negative id is replaced with max+1', 'GET', '/api/onboarding-resources', { setup: setId(4, -3) });
  caseTest('fractional id below the max is replaced with max+1', 'GET', '/api/onboarding-resources', { setup: setId(3, 2.5) });
  caseTest('non-numeric and empty-string ids are replaced', 'GET', '/api/onboarding-resources',
    { setup: steps(setId(6, 'abc'), setId(2, '')) });
  caseTest('several bad ids are renumbered in file order', 'GET', '/api/onboarding-resources',
    { setup: steps(setId(5, 0), setId(4, -3), setId(3, 2.5)) });
  caseTest('fractional id that is the max stays fractional (bug M15)', 'GET', '/api/onboarding-resources',
    { setup: setId(9, 9.5) });
  caseTest('fractional max id is renumbered again on every read (bug M15)', 'GET', '/api/onboarding-resources',
    { setup: setId(9, 9.5), before: [{ method: 'GET', path: '/api/onboarding-resources' }] });
  caseTest('POST with a fractional max id stores a fractional id (bug M15)', 'POST', '/api/onboarding-resources',
    { setup: setId(9, 9.5), body: newJoiner });
});
