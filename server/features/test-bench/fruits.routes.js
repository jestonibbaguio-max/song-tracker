const express = require('express');
const controller = require('./fruits.controller');

// Full paths, mounted without a prefix, so req.url is never rewritten.
const router = express.Router();

router.get('/api/fruits', controller.listFruits);
router.get('/api/fruits/:id', controller.getFruit);
router.post('/api/fruits', controller.createFruit);
router.patch('/api/fruits/:id', controller.updateFruit);
router.delete('/api/fruits/:id', controller.deleteFruit);

module.exports = router;
