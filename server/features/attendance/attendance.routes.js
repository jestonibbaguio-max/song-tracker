const express = require('express');
const controller = require('./attendance.controller');

// Full paths, mounted without a prefix, so req.url is never rewritten.
const router = express.Router();

router.get('/api/attendance', controller.listRecords);
router.post('/api/attendance', controller.createRecord);
router.patch('/api/attendance/:id', controller.updateRecord);
router.delete('/api/attendance/:id', controller.deleteRecord);

module.exports = router;
