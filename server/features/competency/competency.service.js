// myCompetency records: saved competency rows joined with group membership
// from the roster. This is the only cross-feature call: competency ->
// onboarding's repository, one direction only (onboarding must never require
// competency). Bugs M4, M8, M9 and M11 in docs/found-bugs.md are kept.
const repository = require('./competency.repository');
const onboardingRepository = require('../onboarding/onboarding.repository');
const { pickWritable } = require('../../utils/fields');

/**
 * One row per roster member of the group (default 5), using the saved
 * competency row or an empty default. Reads db.json FIRST (read() loads it
 * before calling back), then the roster, as before (the roster read can itself
 * write: id back-fill, CSV seeding). group is the raw query value. Members are
 * matched on groupNumber only (M4).
 */
function listRecords(group) {
  return repository.read((store) => {
    const groupNumber = group ? Number(group) : 5;
    const groupMembers = onboardingRepository.list().filter(m => Number(m.groupNumber) === groupNumber);
    const records = store.listRecords();
    return groupMembers.map(m => {
      const saved = records.find(r => r.eid === m.eid);
      const base = saved || {
        eid: m.eid,
        primarySkill: '',
        primaryProficiency: 'N/A',
        recentRetakeDate: '',
        nextRetakeDate: '',
        secondarySkill: '',
        secondaryProficiency: 'N/A',
        retakeDate: ''
      };
      return { name: m.name || m.eid, clLevel: m.clLevel || m.cl_level || '', ...base };
    });
  });
}

/**
 * Merges the body's competency fields into the row for eid (exactly as given,
 * not normalised: M9), or appends { eid, ...fields }; other fields are dropped
 * (M12, storage part). Returns the row found by eid after saving, which is
 * undefined when the body renamed it (M8: the response is then an empty 200).
 */
function upsertRecord(eid, body) {
  return repository.write((store) => store.upsertRecord(eid, pickWritable('competency-records', body)));
}

module.exports = { listRecords, upsertRecord };
