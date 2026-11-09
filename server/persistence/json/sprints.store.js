// The sprints and sprint-retros collections in db.json.
//
// The code below is the code the sprints service ran on the loaded db object
// before the store interface existed, with the same variable names and
// expressions: when a collection isn't an array, the TypeError text names them
// (pinned in data-shape-edges.test.js), e.g. "sprints.findIndex is not a
// function" or "(db.sprints || []).map is not a function". A missing collection
// reads as a new [] and, on insert, is added at the end of db.json.
const { createDbStore } = require('./db-store');
const { nextId } = require('../../utils/ids');

module.exports = createDbStore((db, changed) => {
  const sprintsOf = () => db['sprints'] || [];
  const retrosOf = () => db['sprint-retros'] || [];

  return {
    // ── Sprints ──────────────────────────────────────────────────────────────

    /** Every sprint, ids as numbers. */
    listSprints() {
      return (db['sprints'] || []).map(s => ({ ...s, id: Number(s.id) }));
    },

    sprintExists(sprintId) {
      return (db['sprints'] || []).some(sprint => Number(sprint.id) === sprintId);
    },

    /** A copy of the sprint, or null. */
    findSprint(id) {
      const sprints = sprintsOf();
      const idx = sprints.findIndex(s => Number(s.id) === id);
      return idx === -1 ? null : { ...sprints[idx] };
    },

    /** Stores { id, ...fields } with the next id and returns it. */
    insertSprint(fields) {
      const sprints = sprintsOf();
      const id = nextId(sprints);
      const sprint = { id, ...fields };
      sprints.push(sprint);
      db['sprints'] = sprints;
      changed();
      return sprint;
    },

    /** Applies changes to the stored sprint; null when the id is unknown. Saves even when changes is empty. */
    updateSprint(id, changes) {
      const sprints = sprintsOf();
      const idx = sprints.findIndex(s => Number(s.id) === id);
      if (idx === -1) return null;
      Object.assign(sprints[idx], changes);
      db['sprints'] = sprints;
      changed();
      return { ...sprints[idx], id: Number(sprints[idx].id) };
    },

    /** false when the id is unknown. */
    removeSprint(id) {
      const sprints = sprintsOf();
      const idx = sprints.findIndex(s => Number(s.id) === id);
      if (idx === -1) return false;
      sprints.splice(idx, 1);
      db['sprints'] = sprints;
      changed();
      return true;
    },

    // ── Sprint retrospectives ────────────────────────────────────────────────

    /** Every retro, with id, sprintId and groupNumber as numbers. */
    listRetros() {
      return (db['sprint-retros'] || []).map(item => ({
        ...item,
        id: Number(item.id),
        sprintId: Number(item.sprintId),
        groupNumber: Number(item.groupNumber)
      }));
    },

    /** A copy of the retro, or null. */
    findRetro(id) {
      const items = retrosOf();
      const index = items.findIndex(item => Number(item.id) === id);
      return index === -1 ? null : { ...items[index] };
    },

    /** Stores { id, ...fields } with the next id and returns it. */
    insertRetro(fields) {
      const items = retrosOf();
      const item = { id: nextId(items), ...fields };
      items.push(item);
      db['sprint-retros'] = items;
      changed();
      return item;
    },

    /** Replaces the stored retro with { ...stored, ...changes }; null when the id is unknown. */
    updateRetro(id, changes) {
      const items = retrosOf();
      const index = items.findIndex(item => Number(item.id) === id);
      if (index === -1) return null;
      items[index] = { ...items[index], ...changes };
      db['sprint-retros'] = items;
      changed();
      return {
        ...items[index],
        id: Number(items[index].id),
        sprintId: Number(items[index].sprintId),
        groupNumber: Number(items[index].groupNumber)
      };
    },

    /** false when the id is unknown. */
    removeRetro(id) {
      const items = retrosOf();
      const index = items.findIndex(item => Number(item.id) === id);
      if (index === -1) return false;
      items.splice(index, 1);
      db['sprint-retros'] = items;
      changed();
      return true;
    },
  };
});
