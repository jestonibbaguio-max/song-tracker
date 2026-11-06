const express = require('express');
const controller = require('./onboarding.controller');

// Full paths, mounted without a prefix, so req.url is never rewritten.
// Registered in the same order as the inline handlers they replace.
const router = express.Router();

router.get('/api/onboarding-resources', controller.listResources);
router.get('/api/skill-options', controller.listSkillOptions);
router.post('/api/onboarding-resources', controller.createResource);
router.patch('/api/onboarding-resources/:id', controller.updateResource);
router.delete('/api/onboarding-resources/:id', controller.deleteResource);

module.exports = router;
