const express = require('express');
const controller = require('./reachouts.controller');

// Full paths, mounted without a prefix, so req.url is never rewritten.
const router = express.Router();

router.get('/api/project-reachouts', controller.listReachouts);
router.post('/api/project-reachouts', controller.createReachout);
router.patch('/api/project-reachouts/:id', controller.updateReachout);
router.delete('/api/project-reachouts/:id', controller.deleteReachout);

module.exports = router;
