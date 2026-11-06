const express = require('express');
const controller = require('./competency.controller');

// Full paths, mounted without a prefix, so req.url and req.params are unchanged.
const router = express.Router();

router.get('/api/competency-records', controller.listRecords);
router.patch('/api/competency-records/:eid', controller.upsertRecord);

module.exports = router;
