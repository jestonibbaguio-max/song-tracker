const { getDashboardPayload } = require('./dashboard.service');

function getDashboard(req, res) {
  res.json(getDashboardPayload());
}

module.exports = { getDashboard };
