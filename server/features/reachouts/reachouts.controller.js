const service = require('./reachouts.service');

function listReachouts(req, res) {
  res.json(service.listReachouts(req.query.group));
}

function createReachout(req, res) {
  const result = service.createReachout(req.body);
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(201).json(result.row);
}

function updateReachout(req, res) {
  const result = service.updateReachout(Number(req.params.id), req.body);
  if (result.notFound) return res.status(404).json({ error: 'reachout not found' });
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result.row);
}

function deleteReachout(req, res) {
  if (!service.deleteReachout(Number(req.params.id))) return res.status(404).json({ error: 'reachout not found' });
  res.json({ deleted: true });
}

module.exports = { listReachouts, createReachout, updateReachout, deleteReachout };
