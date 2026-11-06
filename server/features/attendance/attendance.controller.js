const service = require('./attendance.service');

function listRecords(req, res) {
  const { year, month } = req.query;
  res.json(service.listRecords({ year, month }));
}

function createRecord(req, res) {
  res.status(201).json(service.createRecord(req.body));
}

function updateRecord(req, res) {
  const record = service.updateRecord(Number(req.params.id), req.body);
  if (!record) return res.status(404).json({ error: 'record not found' });
  res.json(record);
}

function deleteRecord(req, res) {
  if (!service.deleteRecord(Number(req.params.id))) return res.status(404).json({ error: 'record not found' });
  res.json({ deleted: true });
}

module.exports = { listRecords, createRecord, updateRecord, deleteRecord };
