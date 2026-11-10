#!/usr/bin/env node
// npm run db:migrate [-- --force | --if-missing]
//
// Builds the SQLite database (DATA_DIR/dashboard.sqlite) from the JSON files in
// DATA_DIR: db.json and custom-onboarding.json, the committed seed
// (docs/sqlite-migration-plan.md, Phase 6). It prints the rows per table, the
// rows it dropped and the keys it skipped.
//
//   (no flag)      build it; refuse if it already exists
//   --force        rebuild it, discarding every change made in it since it was
//                  built. The new database is built first, so JSON the import
//                  refuses leaves the old one untouched. Stop the server first:
//                  a database another process has open is never deleted
//   --if-missing   build it only if it doesn't exist; `npm run api` and
//                  `npm run dev` run this before they start
//
// Exit codes: 0 built (or, with --if-missing, already there), 1 failed
// (nothing was changed), 2 bad arguments.
//
// Like every script here, it reaches the files and the database only through
// server/persistence/ (docs/sqlite-migration-plan.md, layer rules).
const { DATA_DIR, sqlitePath } = require('../config');
const { buildDatabase, databaseExists, formatReport } = require('../persistence/sqlite/import');

const USAGE = 'usage: npm run db:migrate [-- --force | --if-missing]';

/** { force, ifMissing } from the command line, or { error } / { help }. */
function parseArgs(args) {
  const options = { force: false, ifMissing: false };
  for (const arg of args) {
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg === '--force') options.force = true;
    else if (arg === '--if-missing') options.ifMissing = true;
    else return { error: `unknown argument: ${arg}` };
  }
  if (options.force && options.ifMissing) return { error: "--force and --if-missing can't be used together" };
  return options;
}

function main(args) {
  const parsed = parseArgs(args);
  if (parsed.help) {
    console.log(USAGE);
    return 0;
  }
  if (parsed.error) {
    console.error(`db:migrate: ${parsed.error}\n${USAGE}`);
    return 2;
  }
  if (parsed.ifMissing && databaseExists(sqlitePath)) {
    console.log(`db:migrate: ${sqlitePath} already exists; nothing to do (--if-missing)`);
    return 0;
  }
  try {
    const report = buildDatabase({ dataDir: DATA_DIR, dbPath: sqlitePath, force: parsed.force });
    console.log(`${report.replaced ? 'Rebuilt' : 'Built'} ${sqlitePath} from the JSON files in ${DATA_DIR}`);
    console.log(formatReport(report).join('\n'));
    return 0;
  } catch (error) {
    console.error(`db:migrate failed: ${error.message}`);
    return 1;
  }
}

process.exitCode = main(process.argv.slice(2));
