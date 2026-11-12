// myCompetency records: saved competency rows joined with group membership
// from the roster. The competency store does the join in one query
// (listGroupRecords) since Phase 8 of docs/sqlite-migration-plan.md; before,
// this service read onboarding's repository, the only cross-feature call.
// Bugs M9, M11 and L17 in docs/found-bugs.md are kept.
const repository = require('./competency.repository');
const { pickWritable, inColumnOrder } = require('../../utils/fields');

/**
 * One row per roster member of the group (default 5), using the saved
 * competency row or an empty default, in roster order (newest created_at
 * first, then highest id). group is the raw query value; the store matches
 * it as Number(groupNumber) === Number(group) did, so a member with no group
 * is in group 0 (L17).
 */
function listRecords(group) {
  return repository.read((store) => {
    const groupNumber = group ? Number(group) : 5;
    return store.listGroupRecords(groupNumber).map(({ member: m, saved }) => {
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
      return { name: m.name || m.eid, clLevel: m.clLevel, ...inColumnOrder('competency-records', base) };
    });
  });
}

/**
 * Merges the body's competency fields into the row for eid (exactly as given,
 * not normalised: M9), or appends { eid, ...fields }; other fields are dropped
 * (M12, storage part). eid, name and clLevel aren't competency fields, so a
 * body can't rename the row or hide the roster's values (M8). Returns the row
 * for eid after saving.
 */
function upsertRecord(eid, body) {
  return repository.write((store) => inColumnOrder('competency-records', store.upsertRecord(eid, pickWritable('competency-records', body))));
}

module.exports = { listRecords, upsertRecord };
