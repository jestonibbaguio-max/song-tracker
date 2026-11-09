// Sprints and sprint retrospectives. Each call runs in one read() or write()
// of the sprints store, so db.json is loaded once and saved at most once; a
// retro POST checks the sprint and appends the retro in the same write().
// Bugs L2, L3, L4, L6, M1 and M13 in docs/found-bugs.md are kept.
const repository = require('./sprints.repository');

const sprintRetroCategories = new Set(['improve', 'didnt-go-well', 'went-well']);

// ── Sprints ──────────────────────────────────────────────────────────────────

function listSprints() {
  return repository.read((store) => store.listSprints());
}

/** { error } when a field is missing (nothing read or written), otherwise { sprint }. */
function createSprint({ name, start, end }) {
  if (!name || !start || !end) return { error: 'name, start and end are required' };
  return repository.write((store) => ({
    sprint: store.insertSprint({ name: String(name).trim(), start: String(start), end: String(end) })
  }));
}

/**
 * null when the id is unknown. readChanges() is only called once the sprint is
 * found, so an unknown id answers 404 even when reading the changes would throw.
 */
function updateSprint(id, readChanges) {
  return repository.write((store) => {
    if (!store.findSprint(id)) return null;
    const { name, start, end } = readChanges();
    const changes = {};
    if (name !== undefined) changes.name = String(name).trim();
    if (start !== undefined) changes.start = String(start);
    if (end !== undefined) changes.end = String(end);
    return store.updateSprint(id, changes);
  });
}

/** false when the id is unknown (nothing written). Retros, buckets and capacity rows stay (bug M13). */
function deleteSprint(id) {
  return repository.write((store) => store.removeSprint(id));
}

// ── Sprint retrospectives ────────────────────────────────────────────────────

/** sprintId and groupNumber are the raw query values (undefined when absent). */
function listRetros({ sprintId, groupNumber }) {
  return repository.read((store) => {
    let items = store.listRetros();
    if (sprintId !== undefined) {
      items = items.filter(item => item.sprintId === Number(sprintId));
    }
    if (groupNumber !== undefined) {
      items = items.filter(item => item.groupNumber === Number(groupNumber));
    }
    return items;
  });
}

/** body is req.body as parsed. { error } when invalid (read, nothing written), otherwise { item }. */
function createRetro(body) {
  const sprintId = Number(body?.sprintId);
  const groupNumber = Number(body?.groupNumber);
  const category = String(body?.category || '');
  const text = String(body?.text || '').trim();

  return repository.write((store) => {
    const sprintExists = store.sprintExists(sprintId);

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

    const item = store.insertRetro({
      sprintId,
      groupNumber,
      category,
      text,
      createdAt: new Date().toISOString()
    });
    return { item };
  });
}

/** { notFound } for an unknown id, { error } for bad text (checked after the lookup), otherwise { item }. */
function updateRetro(id, body) {
  return repository.write((store) => {
    if (!store.findRetro(id)) return { notFound: true };

    const text = String(body?.text ?? '').trim();
    if (!text || text.length > 500) {
      return { error: 'text is required and must not exceed 500 characters' };
    }

    return { item: store.updateRetro(id, { text }) };
  });
}

/** false when the id is unknown (nothing written). */
function deleteRetro(id) {
  return repository.write((store) => store.removeRetro(id));
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
