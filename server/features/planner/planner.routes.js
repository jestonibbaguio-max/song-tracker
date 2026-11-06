const express = require('express');
const controller = require('./planner.controller');

// Full paths, mounted without a prefix, so req.url is never rewritten.
// Registered in the same order as the inline handlers they replace.
const router = express.Router();

router.get('/api/planner-boards', controller.listBoards);

router.get('/api/planner-buckets', controller.listBuckets);
router.post('/api/planner-buckets', controller.createBucket);

router.get('/api/planner-tasks', controller.listTasks);
router.post('/api/planner-tasks', controller.createTask);
router.patch('/api/planner-tasks/:id', controller.updateTask);
router.delete('/api/planner-tasks/:id', controller.deleteTask);

router.get('/api/deletion-logs', controller.listDeletionLogs);
router.post('/api/deletion-logs', controller.createDeletionLog);

module.exports = router;
