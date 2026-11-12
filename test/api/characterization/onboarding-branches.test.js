// Guardrail 5 (docs/server-restructure-plan.md, step 0): characterization cases for
// the onboarding branches onboarding.test.js doesn't reach: the rollInDate
// format check.
//
// The file also pinned the roster file's own branches: the 500 catch paths
// when custom-onboarding.json couldn't be read or saved, seeding from
// custom.csv, and repair of roster ids that were zero, negative or fractional.
// Those pinned the JSON backend and were deleted with it
// (docs/sqlite-migration-plan.md, Phase 8).
// These pin down current behaviour, bugs included. See docs/found-bugs.md.
const { describe, test } = require('node:test');
const { runCase, snapshot, CREDENTIALS } = require('../../helpers/characterize');

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
function caseTest(name, method, routePath, kase) {
  test(name, async (t) => {
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
