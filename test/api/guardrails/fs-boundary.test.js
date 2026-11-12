// Guardrail 4 (docs/server-restructure-plan.md, step 0): only persistence code requires fs,
// and (docs/sqlite-migration-plan.md, Phase 4) only persistence code requires better-sqlite3.
//
// Since Phase 8 removed the JSON backend, the allowed files are listed one by one:
//   fs:
//     - the two JSON files that stay (decision 10 of the plan): the legacy
//       tasks.json repository and the fruits test bench's repository;
//     - the SQLite import (reads the JSON seed, builds and replaces the
//       database file) and the schema migrations (read schema.sql);
//     - server/middleware/static.js, the documented exception: express.static
//       and res.sendFile read from disk ("The one fs exception" in the
//       restructure plan).
//   better-sqlite3: the server's connection and the import.
// Every entry must still exist and still need it, so the lists only shrink
// when code stops needing them. Adding a file here is a design decision.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { SERVER_DIR } = require('../../helpers/test-server');

const FS_ALLOWED = [
  'server/persistence/tasks-file.repository.js',
  'server/persistence/fruits-file.repository.js',
  'server/persistence/sqlite/import.js',
  'server/persistence/sqlite/migrations.js',
];
const DOCUMENTED_EXCEPTIONS = ['server/middleware/static.js'];
const SQLITE_ALLOWED = [
  'server/persistence/sqlite/connection.js',
  'server/persistence/sqlite/import.js',
];

const FS_MODULES = ['fs', 'fs/promises', 'fs-extra', 'graceful-fs'];
const FS_MODULE = `['"\`](?:node:)?(?:${FS_MODULES.map((m) => m.replace('/', '\\/')).join('|')})['"\`]`;
const FS_IMPORT = new RegExp(
  [
    `\\brequire\\s*\\(\\s*${FS_MODULE}\\s*\\)`,         // require('fs'), require("node:fs/promises")
    `\\bimport\\s*\\(\\s*${FS_MODULE}\\s*\\)`,          // import('fs')
    `\\bfrom\\s*${FS_MODULE}`,                          // import x from 'fs'
    `\\bimport\\s*${FS_MODULE}`,                        // import 'fs'
    `\\bprocess\\s*\\.\\s*(?:binding|_linkedBinding)\\s*\\(\\s*['"]fs['"]`, // process.binding('fs')
  ].join('|'),
);

const REPO_ROOT = path.resolve(SERVER_DIR, '..');
const toRepoPath = (abs) => path.relative(REPO_ROOT, abs).split(path.sep).join('/');

/** Every script under server/, skipping the data folder's spreadsheets and JSON. */
function serverScripts() {
  const out = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') walk(full);
      } else if (/\.(?:c|m)?js$/.test(entry.name)) {
        out.push(full);
      }
    }
  })(SERVER_DIR);
  return out.sort();
}

function requiresFs(file) {
  return FS_IMPORT.test(fs.readFileSync(file, 'utf8'));
}

function isAllowed(repoPath) {
  return FS_ALLOWED.includes(repoPath) || DOCUMENTED_EXCEPTIONS.includes(repoPath);
}

const requiresSqlite = (repoPath) => SQLITE_IMPORT.test(fs.readFileSync(path.join(REPO_ROOT, repoPath), 'utf8'));

// docs/sqlite-migration-plan.md, Phase 4 step 5: the same rule for the SQLite
// driver, with no documented exception (static.js only needs fs).
const SQLITE_MODULE = `['"\`]better-sqlite3['"\`]`;
const SQLITE_IMPORT = new RegExp(
  [
    `\\brequire\\s*\\(\\s*${SQLITE_MODULE}\\s*\\)`,
    `\\bimport\\s*\\(\\s*${SQLITE_MODULE}\\s*\\)`,
    `\\bfrom\\s*${SQLITE_MODULE}`,
    `\\bimport\\s*${SQLITE_MODULE}`,
  ].join('|'),
);

describe('guardrail: only persistence code requires better-sqlite3', () => {
  test('the detector recognises every way of loading better-sqlite3', () => {
    const hits = [
      "const Database = require('better-sqlite3');",
      'const Database = require("better-sqlite3");',
      'const Database = require( `better-sqlite3` );',
      "import Database from 'better-sqlite3';",
      "const { default: Database } = await import('better-sqlite3');",
    ];
    const misses = [
      "const store = require('./sqlite-store');",
      "const x = require('better-sqlite3-helper');",
      '// opens the database with better-sqlite3 (persistence/ only)',
    ];
    for (const s of hits) assert.ok(SQLITE_IMPORT.test(s), `should detect: ${s}`);
    for (const s of misses) assert.ok(!SQLITE_IMPORT.test(s), `should not detect: ${s}`);
  });

  test('only the listed files require better-sqlite3', () => {
    const offenders = serverScripts().map(toRepoPath).filter(requiresSqlite).filter((p) => !SQLITE_ALLOWED.includes(p));
    assert.deepEqual(offenders, [], 'these files require better-sqlite3 but are not in SQLITE_ALLOWED');
  });

  test('every SQLITE_ALLOWED entry still exists and still requires it (the list only shrinks)', () => {
    for (const entry of SQLITE_ALLOWED) {
      assert.ok(fs.existsSync(path.join(REPO_ROOT, entry)), `${entry} no longer exists: delete it from SQLITE_ALLOWED`);
      assert.ok(requiresSqlite(entry), `${entry} no longer requires better-sqlite3: delete it from SQLITE_ALLOWED`);
    }
  });
});

describe('guardrail: only persistence code requires fs', () => {
  test('the detector recognises every way of loading fs', () => {
    const hits = [
      "const fs = require('fs');",
      'const fs = require("node:fs");',
      "const { readFileSync } = require( 'fs' );",
      "const fsp = require('fs/promises');",
      "const fsp = require('node:fs/promises');",
      'const fs = require(`fs`);',
      "import fs from 'fs';",
      "import { readFile } from 'node:fs/promises';",
      "import 'fs';",
      "const fs = await import('fs');",
      "const fse = require('fs-extra');",
      "const binding = process.binding('fs');",
    ];
    const misses = [
      "const path = require('path');",
      "const store = require('./fs-store');",
      "const x = require('offs');",
      '// reads the file (fs is only used by persistence/)',
      "const isFsError = err.code === 'ENOENT';",
    ];
    for (const s of hits) assert.ok(FS_IMPORT.test(s), `should detect: ${s}`);
    for (const s of misses) assert.ok(!FS_IMPORT.test(s), `should not detect: ${s}`);
  });

  test('only the listed files (and the documented exception) require fs', () => {
    const scripts = serverScripts();
    assert.ok(scripts.length > 0, 'found no scripts under server/');
    const offenders = scripts.map(toRepoPath).filter((p) => requiresFs(path.join(REPO_ROOT, p)) && !isAllowed(p));
    assert.deepEqual(offenders, [], 'these files require fs but are not in FS_ALLOWED');
  });

  test('every FS_ALLOWED entry still exists and still needs fs (the list only shrinks)', () => {
    for (const entry of FS_ALLOWED) {
      const abs = path.join(REPO_ROOT, entry);
      assert.ok(fs.existsSync(abs), `${entry} no longer exists: delete it from FS_ALLOWED`);
      assert.ok(requiresFs(abs), `${entry} no longer requires fs: delete it from FS_ALLOWED`);
    }
    // static.js may read from disk (it doesn't require fs today; Express does the reads).
    for (const entry of DOCUMENTED_EXCEPTIONS) assert.ok(fs.existsSync(path.join(REPO_ROOT, entry)), `${entry} no longer exists`);
  });
});
