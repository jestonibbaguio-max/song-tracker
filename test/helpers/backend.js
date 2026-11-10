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
// Every backend has its stores since Phase 4, so a sqlite run skips only the
// json-only tests.
const BACKENDS = ['json', 'sqlite'];
const BACKEND = process.env.PERSISTENCE || 'json';
if (!BACKENDS.includes(BACKEND)) {
  throw new Error(`PERSISTENCE must be one of ${BACKENDS.join(', ')}; got "${BACKEND}"`);
}

/**
 * npm run test:api:exported (Phase 5): the run's data comes from fixtures that
 * went through SQLite and back (test/helpers/exported-fixtures.js). The
 * json-only tests pin the committed fixture files byte for byte (string ids,
 * snake_case roster records, BOMs and so on), so they're skipped; every
 * shared test must pass unchanged.
 */
const EXPORTED_FIXTURES = Boolean(process.env.TEST_FIXTURES_DIR);

/** Backends that have stores the tests can run against: every backend since Phase 4. */
const BACKENDS_WITH_STORES = ['json', 'sqlite'];

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
  if (onlyOn === 'json' && EXPORTED_FIXTURES) return `json-only${reason ? ` (${reason})` : ''}: pins the committed fixture files, not exported ones`;
  return false;
}

/** Shorthand for the `skip` option of a json-only test. */
const jsonOnly = (reason) => backendSkip('json', reason);

function isStoreFile(relativePath) {
  return (STORE_FILES[BACKEND] || []).includes(relativePath);
}

module.exports = { BACKEND, BACKENDS, EXPORTED_FIXTURES, backendSkip, jsonOnly, isStoreFile, isSqliteFile, STORE_FILES };
