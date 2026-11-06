const service = require('./sprints.service');

// ── Sprints ──────────────────────────────────────────────────────────────────

function listSprints(req, res) {
  res.json(service.listSprints());
}

function createSprint(req, res) {
  // Destructured here, from req.body itself: with no JSON body this must keep
  // throwing "Cannot destructure property 'name' of 'req.body'..." (bug M1).
  const { name, start, end } = req.body;
  const result = service.createSprint({ name, start, end });
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(201).json(result.sprint);
}

function updateSprint(req, res) {
  const id = Number(req.params.id);
  // req.body is destructured here (same M1 message) but only when the service
  // calls this, after the sprint is found: an unknown id still answers 404.
  const sprint = service.updateSprint(id, () => {
    const { name, start, end } = req.body;
    return { name, start, end };
  });
  if (!sprint) return res.status(404).json({ error: 'sprint not found' });
  res.json(sprint);
}

function deleteSprint(req, res) {
  if (!service.deleteSprint(Number(req.params.id))) return res.status(404).json({ error: 'sprint not found' });
  res.json({ deleted: true });
}

// ── Sprint retrospectives ────────────────────────────────────────────────────

function listRetros(req, res) {
  res.json(service.listRetros({ sprintId: req.query.sprintId, groupNumber: req.query.groupNumber }));
}

function createRetro(req, res) {
  const result = service.createRetro(req.body);
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }
  res.status(201).json(result.item);
}

function updateRetro(req, res) {
  const result = service.updateRetro(Number(req.params.id), req.body);
  if (result.notFound) return res.status(404).json({ error: 'retrospective item not found' });
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }
  res.json(result.item);
}

function deleteRetro(req, res) {
  if (!service.deleteRetro(Number(req.params.id))) return res.status(404).json({ error: 'retrospective item not found' });
  res.json({ deleted: true });
}

module.exports = {
  listSprints,
  createSprint,
  updateSprint,
  deleteSprint,
  listRetros,
  createRetro,
  updateRetro,
  deleteRetro
};
