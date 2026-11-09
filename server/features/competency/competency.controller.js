const service = require('./competency.service');

function listRecords(req, res) {
  res.json(service.listRecords(req.query.group));
}

function upsertRecord(req, res) {
  res.json(service.upsertRecord(req.params.eid, req.body));
}

module.exports = { listRecords, upsertRecord };
