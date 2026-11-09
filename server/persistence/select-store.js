// Picks the store implementation for a feature from config.PERSISTENCE
// (docs/sqlite-migration-plan.md). The choice is made on every call, not when
// this module loads, so loading the app never opens a backend, and a backend a
// feature doesn't implement yet fails only when a request reaches it.
const config = require('../config');

/**
 * @param {string} name            the feature, for the error message
 * @param {string[]} methods       the store's methods, all forwarded as is
 * @param {Record<string, () => object>} implementations
 *   one loader per backend, e.g. { json: () => require('./json/sprints.store') }
 */
function selectStore(name, methods, implementations) {
  function current() {
    const load = implementations[config.PERSISTENCE];
    if (!load) {
      throw new Error(
        `The ${name} store has no "${config.PERSISTENCE}" implementation yet (docs/sqlite-migration-plan.md)`,
      );
    }
    return load();
  }

  const store = {};
  for (const method of methods) {
    store[method] = (...args) => current()[method](...args);
  }
  return store;
}

module.exports = { selectStore };
