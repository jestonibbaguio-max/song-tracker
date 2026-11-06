const express = require('express');
const controller = require('./lookups.controller');

// Full paths, mounted without a prefix, so req.url is never rewritten.
// None of these paths overlaps another route, so mounting all three where
// /api/attendance-options used to be registered doesn't change which handler
// any request reaches.
const router = express.Router();

router.get('/api/attendance-options', controller.getAttendanceOptions);
router.get('/api/office-locations', controller.getOfficeLocations);
router.get('/api/planner-labels', controller.getPlannerLabels);

module.exports = router;
