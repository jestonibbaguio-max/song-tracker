// The onboarding_resources table (the SQLite counterpart of
// persistence/json/onboarding.store.js): list(), append(record),
// update(id, payload) and remove(id), each one a fresh query.
//
// Records come back in the shape the API writes them to the roster file:
// camelCase fields plus created_at/updated_at, so the service's sort and
// formatOnboardingResource read them unchanged. list() orders them the way
// GET /api/onboarding-resources does (newest created_at first, then highest
// id), which also puts a new record first, where the roster file unshifts it
// (docs/sqlite-migration-plan.md, Risks, "Roster order").
const { createSqliteStore, selectAll, selectOne, insertRow, updateRow, deleteRow } = require('./sqlite-store');

/** Each operation is its own unit of work; none needs more than one write. */
const store = createSqliteStore(() => ({}));

/** Every stored record. */
function list() {
  return store.read(() => selectAll('onboarding-resources', 'created_at DESC, id DESC'));
}

/** Appends the record with the next id and fresh created_at/updated_at; returns it. */
function append(record) {
  return store.write(() => {
    record.created_at = new Date().toISOString();
    record.updated_at = record.created_at;
    record.id = insertRow('onboarding-resources', record);
    return record;
  });
}

/** Assigns payload onto the record with that id (and a fresh updated_at); null when the id is unknown. */
function update(id, payload) {
  return store.write(() => {
    const existing = selectOne('onboarding-resources', 'id', Number(id));
    if (!existing) return null;
    Object.assign(existing, payload, { updated_at: new Date().toISOString() });
    updateRow('onboarding-resources', existing);
    return existing;
  });
}

/** Removes the record with that id. false when the id is unknown. */
function remove(id) {
  return store.write(() => deleteRow('onboarding-resources', 'id', id));
}

module.exports = { list, append, update, remove };
