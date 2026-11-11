// The competency_records table, keyed by eid. Rows are listed in insertion
// order (the seq column, see schema.sql), as they were appended to db.json.
const { prepare } = require('./connection');
const { fromColumns } = require('./tables');
const { createSqliteStore, selectAll, selectOne, insertRow, updateRow } = require('./sqlite-store');

// The roster members of one group joined with their saved rows, in one query
// (docs/sqlite-migration-plan.md, Phase 8 clean-ups). It reads the roster
// table directly, which is the one place SQL crosses features: the API's rule
// for group membership is the service's old JS filter,
// Number(groupNumber) === group, so a member with no group is in group 0
// (bug L17), and a NaN group (bound as NULL) matches nobody. A row joins by
// the exact eid (BINARY), as === did, so a differently-cased eid (bug M9)
// stays apart. Members come in the resources list's order.
const GROUP_RECORDS_SQL = `SELECT r.eid AS member_eid, r.name AS member_name, r.cl_level AS member_cl_level, c.*
  FROM onboarding_resources r LEFT JOIN competency_records c ON c.eid = r.eid
  WHERE IFNULL(r.group_number, 0) = ?
  ORDER BY r.created_at DESC, r.id DESC`;

module.exports = createSqliteStore((changed) => ({
  /** Every saved row. */
  listRecords() {
    return selectAll('competency-records', 'seq');
  },

  /**
   * The members of a group: [{ member: { eid, name, clLevel }, saved }], with
   * saved the member's row as API fields, or null when none is saved.
   */
  listGroupRecords(groupNumber) {
    return prepare(GROUP_RECORDS_SQL).all(groupNumber).map((row) => ({
      member: { eid: row.member_eid, name: row.member_name, clLevel: row.member_cl_level },
      saved: row.seq === null ? null : fromColumns('competency-records', row),
    }));
  },

  /**
   * Merges body into the row for eid, or appends { eid, ...body }. Returns
   * the row for eid afterwards.
   */
  upsertRecord(eid, body) {
    changed();
    const stored = selectOne('competency-records', 'eid', eid);
    if (!stored) {
      insertRow('competency-records', { eid, ...body });
      return { eid, ...body };
    }
    const record = { ...stored, ...body };
    updateRow('competency-records', record, 'eid');
    return record;
  },
}));
