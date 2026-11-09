const service = require('./capacity.service');

function listEntries(req, res) {
  res.json(service.listEntries(req.query.sprintName));
}

function upsertEntry(req, res) {
  // Destructured here, from req.body itself: with no JSON body this must keep
  // throwing "Cannot destructure property 'sprintName' of 'req.body'..." (bug M1).
  const { sprintName, eid, cadence, admin, holiday } = req.body;
  const result = service.upsertEntry({ sprintName, eid, cadence, admin, holiday });
  if (result.error) return res.status(400).json({ error: result.error });
  if (!result.created) return res.json(result.entry);
  res.status(201).json(result.entry);
}

module.exports = { listEntries, upsertEntry };
