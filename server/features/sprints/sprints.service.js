// Sprints and sprint retrospectives (db.json). Each call loads db once and saves
// it at most once; a retro POST checks the sprint and appends the retro on the
// same db object. Bugs L2, L3, L4, L6, M1 and M13 in docs/found-bugs.md are kept.
const repository = require('./sprints.repository');
const { nextId } = require('../../utils/ids');

const sprintRetroCategories = new Set(['improve', 'didnt-go-well', 'went-well']);

// ── Sprints ──────────────────────────────────────────────────────────────────

function listSprints() {
  const db = repository.load();
  return repository.sprintsOf(db).map(s => ({ ...s, id: Number(s.id) }));
}

/** { error } when a field is missing (nothing read or written), otherwise { sprint }. */
function createSprint({ name, start, end }) {
  if (!name || !start || !end) return { error: 'name, start and end are required' };
  const db = repository.load();
  const sprints = repository.sprintsOf(db);
  const id = nextId(sprints);
  const sprint = { id, name: String(name).trim(), start: String(start), end: String(end) };
  sprints.push(sprint);
  repository.setSprints(db, sprints);
  repository.save(db);
  return { sprint };
}

/**
 * null when the id is unknown. readChanges() is only called once the sprint is
 * found, so an unknown id answers 404 even when reading the changes would throw.
 */
function updateSprint(id, readChanges) {
  const db = repository.load();
  const sprints = repository.sprintsOf(db);
  const idx = sprints.findIndex(s => Number(s.id) === id);
  if (idx === -1) return null;
  const { name, start, end } = readChanges();
  if (name !== undefined) sprints[idx].name = String(name).trim();
  if (start !== undefined) sprints[idx].start = String(start);
  if (end !== undefined) sprints[idx].end = String(end);
  repository.setSprints(db, sprints);
  repository.save(db);
  return { ...sprints[idx], id: Number(sprints[idx].id) };
}

/** false when the id is unknown (nothing written). Retros, buckets and capacity rows stay (bug M13). */
function deleteSprint(id) {
  const db = repository.load();
  const sprints = repository.sprintsOf(db);
  const idx = sprints.findIndex(s => Number(s.id) === id);
  if (idx === -1) return false;
  sprints.splice(idx, 1);
  repository.setSprints(db, sprints);
  repository.save(db);
  return true;
}

// ── Sprint retrospectives ────────────────────────────────────────────────────

/** sprintId and groupNumber are the raw query values (undefined when absent). */
function listRetros({ sprintId, groupNumber }) {
  const db = repository.load();
  let items = repository.retrosOf(db).map(item => ({
    ...item,
    id: Number(item.id),
    sprintId: Number(item.sprintId),
    groupNumber: Number(item.groupNumber)
  }));
  if (sprintId !== undefined) {
    items = items.filter(item => item.sprintId === Number(sprintId));
  }
  if (groupNumber !== undefined) {
    items = items.filter(item => item.groupNumber === Number(groupNumber));
  }
  return items;
}

/** body is req.body as parsed. { error } when invalid (read, nothing written), otherwise { item }. */
function createRetro(body) {
  const sprintId = Number(body?.sprintId);
  const groupNumber = Number(body?.groupNumber);
  const category = String(body?.category || '');
  const text = String(body?.text || '').trim();
  const db = repository.load();
  const sprintExists = repository.sprintsOf(db).some(sprint => Number(sprint.id) === sprintId);

  if (!Number.isInteger(sprintId) || !sprintExists) {
    return { error: 'a valid sprint number is required' };
  }
  if (!Number.isInteger(groupNumber) || groupNumber < 1) {
    return { error: 'a valid group number is required' };
  }
  if (!sprintRetroCategories.has(category)) {
    return { error: 'a valid category is required' };
  }
  if (!text || text.length > 500) {
    return { error: 'text is required and must not exceed 500 characters' };
  }

  const items = repository.retrosOf(db);
  const item = {
    id: nextId(items),
    sprintId,
    groupNumber,
    category,
    text,
    createdAt: new Date().toISOString()
  };
  items.push(item);
  repository.setRetros(db, items);
  repository.save(db);
  return { item };
}

/** { notFound } for an unknown id, { error } for bad text (checked after the lookup), otherwise { item }. */
function updateRetro(id, body) {
  const db = repository.load();
  const items = repository.retrosOf(db);
  const index = items.findIndex(item => Number(item.id) === id);
  if (index === -1) return { notFound: true };

  const text = String(body?.text ?? '').trim();
  if (!text || text.length > 500) {
    return { error: 'text is required and must not exceed 500 characters' };
  }

  items[index] = { ...items[index], text };
  repository.setRetros(db, items);
  repository.save(db);
  return {
    item: {
      ...items[index],
      id: Number(items[index].id),
      sprintId: Number(items[index].sprintId),
      groupNumber: Number(items[index].groupNumber)
    }
  };
}

/** false when the id is unknown (nothing written). */
function deleteRetro(id) {
  const db = repository.load();
  const items = repository.retrosOf(db);
  const index = items.findIndex(item => Number(item.id) === id);
  if (index === -1) return false;

  items.splice(index, 1);
  repository.setRetros(db, items);
  repository.save(db);
  return true;
}

module.exports = {
  listSprints,
  createSprint,
  updateSprint,
  deleteSprint,
  listRetros,
  createRetro,
  updateRetro,
  deleteRetro
};
