// Which storage backend the API tests run against (docs/sqlite-migration-plan.md, Phase 2).
//
//   npm run test:api          PERSISTENCE unset, so json (the default)
//   npm run test:api:sqlite   PERSISTENCE=sqlite
//
// The server reads PERSISTENCE when the app loads (server/config/index.js), and
// startTestServer() loads a fresh app per test, so the whole run uses one backend.
//
// Tests are tagged by the backend they make sense on:
//   - most run on every backend: they snapshot responses and logical diffs of
//     the stores (test/helpers/store-dump.js), never the files behind them;
//   - json-only tests pin things only the JSON files have: BOMs, corrupt or
//     missing files, CSV seeding, id repair, non-array collections, raw file
//     formatting, and the exact fs calls per request. They keep pinning the
//     JSON backend until it's removed in Phase 8.
//
// Tests that don't touch stored data (config, the fs boundary, the fixtures,
// legacy tasks, the fruits test bench, the harness helpers) run on every
// backend without a tag.
//
// The SQLite stores arrive in Phase 4, one feature per commit. Until the last
// one lands, a sqlite run skips every test that needs the stores:
// backendSkip() returns a skip reason for all of them (see BACKENDS_WITH_STORES).
const BACKENDS = ['json', 'sqlite'];
const BACKEND = process.env.PERSISTENCE || 'json';
if (!BACKENDS.includes(BACKEND)) {
  throw new Error(`PERSISTENCE must be one of ${BACKENDS.join(', ')}; got "${BACKEND}"`);
}

/**
 * Backends that have stores the tests can run against. Phase 4 adds 'sqlite'
 * once every feature has its SQLite store. Until then SQLITE_STORES_PREVIEW=1
 * runs the store tests on sqlite anyway, to check one feature's store at a
 * time (PERSISTENCE=sqlite SQLITE_STORES_PREVIEW=1 node --test <its files>).
 * Temporary: removed when the last store lands.
 */
const BACKENDS_WITH_STORES = ['json', ...(process.env.SQLITE_STORES_PREVIEW === '1' ? ['sqlite'] : [])];

/**
 * Data files that hold a backend's stores. The characterization snapshots show
 * changes to them as logical diffs. The SQLite files are left out of the data
 * directory snapshots altogether (characterize.js readTree).
 */
const STORE_FILES = {
  json: ['db.json', 'custom-onboarding.json'],
  sqlite: ['dashboard.sqlite', 'dashboard.sqlite-wal', 'dashboard.sqlite-shm'],
};

/** A SQLite database file (or its -wal/-shm/-journal file). */
const isSqliteFile = (relativePath) => /\.sqlite(?:-wal|-shm|-journal)?$/.test(relativePath);

/**
 * The node:test `skip` option for a test that starts the app.
 * @param {string} [onlyOn]  the one backend this test makes sense on (e.g. 'json')
 * @param {string} [reason]  why, for the skip message
 * @returns {false | string}
 */
function backendSkip(onlyOn, reason) {
  if (!BACKENDS_WITH_STORES.includes(BACKEND)) return `the ${BACKEND} stores don't exist yet (docs/sqlite-migration-plan.md, Phase 4)`;
  if (onlyOn && onlyOn !== BACKEND) return `${onlyOn}-only${reason ? `: ${reason}` : ''}`;
  return false;
}

/** Shorthand for the `skip` option of a json-only test. */
const jsonOnly = (reason) => backendSkip('json', reason);

function isStoreFile(relativePath) {
  return (STORE_FILES[BACKEND] || []).includes(relativePath);
}

module.exports = { BACKEND, BACKENDS, backendSkip, jsonOnly, isStoreFile, isSqliteFile, STORE_FILES };
