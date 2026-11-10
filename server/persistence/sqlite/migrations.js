// Schema upgrades, tracked in PRAGMA user_version (docs/sqlite-migration-plan.md).
// MIGRATIONS[n] takes a database from version n to n + 1. Version 1 is the
// full schema in schema.sql. A later change appends a migration; it never
// edits one that has shipped.
const fs = require('fs');
const path = require('path');

const MIGRATIONS = [
  (db) => db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')),
];

const SCHEMA_VERSION = MIGRATIONS.length;

/**
 * Brings the database up to SCHEMA_VERSION, each step in its own transaction.
 * A database newer than this code is refused rather than used.
 */
function migrate(db) {
  const current = db.pragma('user_version', { simple: true });
  if (current > SCHEMA_VERSION) {
    throw new Error(`the database is at schema version ${current}, but this server only knows up to ${SCHEMA_VERSION}`);
  }
  for (let version = current; version < SCHEMA_VERSION; version += 1) {
    db.transaction(() => {
      MIGRATIONS[version](db);
      db.pragma(`user_version = ${version + 1}`);
    })();
  }
}

module.exports = { migrate, SCHEMA_VERSION };
