const express = require('express');
const { getDashboard } = require('./dashboard.controller');

// Full paths, mounted without a prefix, so req.url is never rewritten.
const router = express.Router();

router.get('/api/dashboard', getDashboard);

module.exports = router;
