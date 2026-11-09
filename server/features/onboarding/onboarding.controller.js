const service = require('./onboarding.service');

function listResources(req, res) {
  res.json(service.listResources());
}

function listSkillOptions(req, res) {
  res.json(service.getSkillOptions());
}

/** Maps a create/update result from the service to the response. */
function sendResult(res, result) {
  if (result.notFound) {
    return res.status(404).json({ error: 'resource not found' });
  }
  if (result.invalid) {
    return res.status(400).json({ error: result.invalid });
  }
  if (result.conflict) {
    return res.status(409).json({ error: result.conflict });
  }
  if (result.failed) {
    return res.status(500).json({ error: result.failed });
  }
  if (result.created) {
    return res.status(201).json(result.resource);
  }
  return res.json(result.resource);
}

function createResource(req, res) {
  return sendResult(res, service.createResource(req.body));
}

function updateResource(req, res) {
  return sendResult(res, service.updateResource(Number(req.params.id), req.body));
}

function deleteResource(req, res) {
  const id = Number(req.params.id);
  if (!service.deleteResource(id)) {
    return res.status(404).json({ error: 'resource not found' });
  }
  return res.status(200).json({ deleted: id });
}

module.exports = { listResources, listSkillOptions, createResource, updateResource, deleteResource };
