// Guardrail 4 (docs/server-restructure-plan.md, step 0): only persistence code requires fs.
//
// The target layout allows fs in exactly two places:
//   - server/persistence/**     (one repository per physical data file)
//   - server/middleware/static.js, the documented exception: express.static and
//     res.sendFile read from disk ("The one fs exception" in the plan)
//
// LEGACY_ALLOWLIST holds the files that require fs today, before the refactor.
// It may only shrink: when a migration step moves the last fs call out of one of
// these files, the "still needs it" test fails until the entry is deleted here.
// Never add to it.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { SERVER_DIR } = require('../../helpers/test-server');

const LEGACY_ALLOWLIST = [
  'server/onboarding-store.js', // moves unchanged into persistence/ in step 11
];
const DOCUMENTED_EXCEPTIONS = ['server/middleware/static.js'];
const ALLOWED_DIRS = ['server/persistence/'];

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
  return ALLOWED_DIRS.some((dir) => repoPath.startsWith(dir))
    || DOCUMENTED_EXCEPTIONS.includes(repoPath)
    || LEGACY_ALLOWLIST.includes(repoPath);
}

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

  test('no file outside persistence/ (and the documented exception) requires fs', () => {
    const scripts = serverScripts();
    assert.ok(scripts.length > 0, 'found no scripts under server/');
    const offenders = scripts.map(toRepoPath).filter((p) => requiresFs(path.join(REPO_ROOT, p)) && !isAllowed(p));
    assert.deepEqual(offenders, [], 'these files require fs but are not repositories in server/persistence/');
  });

  test('every legacy allowlist entry still exists and still needs fs (the list only shrinks)', () => {
    for (const entry of LEGACY_ALLOWLIST) {
      const abs = path.join(REPO_ROOT, entry);
      assert.ok(fs.existsSync(abs), `${entry} no longer exists: delete it from LEGACY_ALLOWLIST`);
      assert.ok(requiresFs(abs), `${entry} no longer requires fs: delete it from LEGACY_ALLOWLIST`);
    }
  });
});
