const express = require('express');
const { getHealth } = require('./health.controller');

// Full paths, mounted without a prefix, so req.url is never rewritten.
const router = express.Router();

router.get('/api/health', getHealth);

module.exports = router;
