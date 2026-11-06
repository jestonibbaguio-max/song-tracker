const express = require('express');
const controller = require('./capacity.controller');

// Full paths, mounted without a prefix, so req.url is never rewritten.
const router = express.Router();

router.get('/api/capacity-entries', controller.listEntries);
router.post('/api/capacity-entries', controller.upsertEntry);

module.exports = router;
