const express = require('express');
const controller = require('./sprints.controller');

// Full paths, mounted without a prefix, so req.url is never rewritten.
// Registered in the same order as the inline handlers they replace.
const router = express.Router();

router.get('/api/sprints', controller.listSprints);
router.post('/api/sprints', controller.createSprint);
router.patch('/api/sprints/:id', controller.updateSprint);
router.delete('/api/sprints/:id', controller.deleteSprint);

router.get('/api/sprint-retros', controller.listRetros);
router.post('/api/sprint-retros', controller.createRetro);
router.patch('/api/sprint-retros/:id', controller.updateRetro);
router.delete('/api/sprint-retros/:id', controller.deleteRetro);

module.exports = router;
