const service = require('./lookups.service');

function getAttendanceOptions(req, res) {
  res.json(service.listAttendanceOptions());
}

function getOfficeLocations(req, res) {
  res.json(service.listOfficeLocations());
}

function getPlannerLabels(req, res) {
  res.json(service.listPlannerLabels());
}

module.exports = { getAttendanceOptions, getOfficeLocations, getPlannerLabels };
