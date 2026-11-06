const express = require('express');
const cors = require('cors');
const {
  testBenchDir,
  browserDir,
  browserIndexPath
} = require('./config');
const {
  loadOnboardingRecords
} = require('./persistence/roster-file.repository');
const healthRoutes = require('./features/health/health.routes');
const dashboardRoutes = require('./features/dashboard/dashboard.routes');
const fruitsRoutes = require('./features/test-bench/fruits.routes');
const lookupsRoutes = require('./features/lookups/lookups.routes');
const legacyTasksRoutes = require('./features/legacy-tasks/legacy-tasks.routes');
const sprintsRoutes = require('./features/sprints/sprints.routes');
const capacityRoutes = require('./features/capacity/capacity.routes');
const attendanceRoutes = require('./features/attendance/attendance.routes');
const plannerRoutes = require('./features/planner/planner.routes');
const reachoutsRoutes = require('./features/reachouts/reachouts.routes');
const onboardingRoutes = require('./features/onboarding/onboarding.routes');
const { loadDb, saveDb } = require('./persistence/db-file.repository');
const { nextId } = require('./utils/ids');

const app = express();

app.use(cors());
app.use(express.json());

app.use(healthRoutes);

app.use(legacyTasksRoutes);

app.use(onboardingRoutes);

function learnSkillOptions(payload) {
  // Skill option persistence is now handled in json-store.js via onboarding records.
  return;
}

app.use(dashboardRoutes);

// ── Sprints and sprint retrospectives ──────────────────────────────────────────
app.use(sprintsRoutes);

// ── Capacity entries ──────────────────────────────────────────────────────────
app.use(capacityRoutes);

// ── Lookups: attendance options, office locations, planner labels ─────────────
app.use(lookupsRoutes);

// ── Attendance ────────────────────────────────────────────────────────────────
app.use(attendanceRoutes);

// ── Planner: boards, buckets, tasks, deletion logs ─────────────────────────────
app.use(plannerRoutes);

// ── Project reachouts ─────────────────────────────────────────────────────────
app.use(reachoutsRoutes);
// ─────────────────────────────────────────────────────────────────────────────

// ── Test Bench: Fruits CRUD ───────────────────────────────────────────────────
app.use(fruitsRoutes);

// Competency Records
app.get('/api/competency-records', (req, res) => {
  const db = loadDb();
  const group = req.query.group ? Number(req.query.group) : 5;
  const groupMembers = loadOnboardingRecords().filter(m => Number(m.groupNumber) === group);
  const records = db['competency-records'] || [];
  const result = groupMembers.map(m => {
    const saved = records.find(r => r.eid === m.eid);
    const base = saved || {
      eid: m.eid,
      primarySkill: '',
      primaryProficiency: 'N/A',
      recentRetakeDate: '',
      nextRetakeDate: '',
      secondarySkill: '',
      secondaryProficiency: 'N/A',
      retakeDate: ''
    };
    return { name: m.name || m.eid, clLevel: m.clLevel || m.cl_level || '', ...base };
  });
  res.json(result);
});

app.patch('/api/competency-records/:eid', (req, res) => {
  const db = loadDb();
  const records = db['competency-records'] || [];
  const idx = records.findIndex(r => r.eid === req.params.eid);
  if (idx === -1) {
    records.push({ eid: req.params.eid, ...req.body });
  } else {
    records[idx] = { ...records[idx], ...req.body };
  }
  db['competency-records'] = records;
  saveDb(db);
  res.json(records.find(r => r.eid === req.params.eid));
});

// Serve test_bwd static files at /test/
app.use('/test', express.static(testBenchDir));
// ─────────────────────────────────────────────────────────────────────────────

app.use(express.static(browserDir));

app.get(/.*/, (req, res) => {
  res.sendFile(browserIndexPath);
});

module.exports = app;
