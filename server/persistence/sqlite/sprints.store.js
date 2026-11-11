// The sprints and sprint_retros tables. Writes return the row they stored,
// built in JS, as the JSON store did before Phase 8.
const { createSqliteStore, selectAll, selectOne, insertRow, updateRow, deleteRow } = require('./sqlite-store');

module.exports = createSqliteStore((changed) => ({
  // ── Sprints ────────────────────────────────────────────────────────────────

  /** Every sprint, ids as numbers. */
  listSprints() {
    return selectAll('sprints');
  },

  sprintExists(sprintId) {
    return selectOne('sprints', 'id', sprintId) !== null;
  },

  /** A copy of the sprint, or null. */
  findSprint(id) {
    return selectOne('sprints', 'id', id);
  },

  /** Stores { id, ...fields } with the next id and returns it. */
  insertSprint(fields) {
    changed();
    return { id: insertRow('sprints', fields), ...fields };
  },

  /** Applies changes to the stored sprint; null when the id is unknown. Writes even when changes is empty. */
  updateSprint(id, changes) {
    const stored = selectOne('sprints', 'id', id);
    if (!stored) return null;
    changed();
    const sprint = Object.assign(stored, changes);
    updateRow('sprints', sprint);
    return { ...sprint, id: Number(sprint.id) };
  },

  /** false when the id is unknown. */
  removeSprint(id) {
    changed();
    return deleteRow('sprints', 'id', id);
  },

  // ── Sprint retrospectives ──────────────────────────────────────────────────

  /** Every retro, with id, sprintId and groupNumber as numbers. */
  listRetros() {
    return selectAll('sprint-retros');
  },

  /** A copy of the retro, or null. */
  findRetro(id) {
    return selectOne('sprint-retros', 'id', id);
  },

  /** Stores { id, ...fields } with the next id and returns it. */
  insertRetro(fields) {
    changed();
    return { id: insertRow('sprint-retros', fields), ...fields };
  },

  /** Replaces the stored retro with { ...stored, ...changes }; null when the id is unknown. */
  updateRetro(id, changes) {
    const stored = selectOne('sprint-retros', 'id', id);
    if (!stored) return null;
    changed();
    const item = { ...stored, ...changes };
    updateRow('sprint-retros', item);
    return item;
  },

  /** false when the id is unknown. */
  removeRetro(id) {
    changed();
    return deleteRow('sprint-retros', 'id', id);
  },
}));
