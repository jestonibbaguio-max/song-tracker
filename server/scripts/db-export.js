#!/usr/bin/env node
// npm run db:export [-- --out <dir>]
//
// Writes the SQLite database (DATA_DIR/dashboard.sqlite) out as db.json and
// custom-onboarding.json, for falling back to PERSISTENCE=json
// (docs/sqlite-migration-plan.md, Phase 5; the runbook is in
// docs/running-backend.md). The files go to <dir>, or to DATA_DIR when --out
// is left out; existing files are backed up to <file>.bak-<timestamp> first.
// A relative <dir> resolves against the current directory (the repo root
// under npm run).
//
// Stop the server first. Exit codes: 0 exported, 1 failed (nothing is written
// when the database is missing or empty), 2 bad arguments.
//
// Like every script here, it reaches the files and the database only through
// server/persistence/ (docs/sqlite-migration-plan.md, layer rules).
const path = require('path');
const { DATA_DIR, sqlitePath } = require('../config');
const { exportJson, formatReport } = require('../persistence/sqlite/export');

const USAGE = 'usage: npm run db:export [-- --out <dir>]   (default <dir>: DATA_DIR)';

/** { outDir } from the command line, or { error } / { help }. */
function parseArgs(args) {
  let outDir = DATA_DIR;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg === '--out') {
      const value = args[i + 1];
      if (value === undefined || value === '' || value.startsWith('--')) return { error: '--out needs a directory' };
      outDir = path.resolve(value);
      i += 1;
      continue;
    }
    return { error: `unknown argument: ${arg}` };
  }
  return { outDir };
}

function main(args) {
  const parsed = parseArgs(args);
  if (parsed.help) {
    console.log(USAGE);
    return 0;
  }
  if (parsed.error) {
    console.error(`db:export: ${parsed.error}\n${USAGE}`);
    return 2;
  }
  try {
    const report = exportJson({ dbPath: sqlitePath, outDir: parsed.outDir });
    console.log(formatReport(report).join('\n'));
    return 0;
  } catch (error) {
    console.error(`db:export failed: ${error.message}`);
    return 1;
  }
}

process.exitCode = main(process.argv.slice(2));
