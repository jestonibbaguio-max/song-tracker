const express = require('express');
const controller = require('./legacy-tasks.controller');

// Full paths, mounted without a prefix, so req.url is never rewritten.
// No other route matches /api/tasks or /api/tasks/:id, so mounting all four
// where GET /api/tasks used to be registered doesn't change which handler
// any request reaches.
const router = express.Router();

router.get('/api/tasks', controller.listTasks);
router.post('/api/tasks', controller.createTask);
router.patch('/api/tasks/:id', controller.updateTask);
router.delete('/api/tasks/:id', controller.deleteTask);

module.exports = router;
