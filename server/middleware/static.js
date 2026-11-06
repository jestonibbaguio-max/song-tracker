// Static files and the SPA fallback. This is the one documented exception to
// "only persistence/ touches the disk": express.static and res.sendFile read files
// (see "The one fs exception" in docs/server-restructure-plan.md). Nothing here
// requires fs itself.
const express = require('express');
const {
  testBenchDir,
  browserDir,
  browserIndexPath
} = require('../config');

/**
 * Registers, on app itself and in this order: the /test mount for the fruits
 * test bench, the built Angular app, and the GET catch-all that answers with
 * index.html (an unknown /api GET lands here too, bug L1). Call it after every
 * API router: a router mounted later would have its GET routes swallowed.
 */
function registerStaticFiles(app) {
  // Serve test_bwd static files at /test/
  app.use('/test', express.static(testBenchDir));

  app.use(express.static(browserDir));

  app.get(/.*/, (req, res) => {
    res.sendFile(browserIndexPath);
  });
}

module.exports = registerStaticFiles;
