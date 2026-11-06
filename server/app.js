const express = require('express');
const cors = require('cors');
const {
  testBenchDir,
  browserDir,
  browserIndexPath
} = require('./config');
const {
  loadOnboardingRecords,
  saveOnboardingRecords,
  appendOnboardingRecord,
  updateOnboardingRecord
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
const { loadDb, saveDb } = require('./persistence/db-file.repository');
const { nextId } = require('./utils/ids');
const {
  normalizeOnboardingPayload,
  mapPayloadToStorage,
  validateOnboardingPayload,
  formatOnboardingResource,
  getSkillOptions
} = require('./features/onboarding/onboarding.service');

const app = express();

app.use(cors());
app.use(express.json());

app.use(healthRoutes);

app.use(legacyTasksRoutes);

app.get('/api/onboarding-resources', (req, res) => {
  const resources = loadOnboardingRecords()
    .slice()
    .sort((a, b) => {
      const aTime = new Date(a.created_at).getTime();
      const bTime = new Date(b.created_at).getTime();

      if (aTime !== bTime) {
        return bTime - aTime;
      }

      return (b.id || 0) - (a.id || 0);
    })
    .map(formatOnboardingResource);

  res.json(resources);
});

app.get('/api/skill-options', (req, res) => {
  res.json(getSkillOptions());
});

function learnSkillOptions(payload) {
  // Skill option persistence is now handled in json-store.js via onboarding records.
  return;
}

app.post('/api/onboarding-resources', (req, res) => {
  const payload = normalizeOnboardingPayload(req.body);
  const validationError = validateOnboardingPayload(payload);

  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  try {
    const records = loadOnboardingRecords();
    const storagePayload = mapPayloadToStorage(payload);
    const existing = records.find((record) => record.eid === payload.eid);

    if (existing) {
      const resource = updateOnboardingRecord(existing.id, storagePayload);
      return res.json(formatOnboardingResource(resource));
    }

    const resource = appendOnboardingRecord(storagePayload);
    return res.status(201).json(formatOnboardingResource(resource));
  } catch (error) {
    return res.status(500).json({ error: 'failed to save onboarding resource' });
  }
});

app.patch('/api/onboarding-resources/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = loadOnboardingRecords().find((record) => record.id === id);

  if (!existing) {
    return res.status(404).json({ error: 'resource not found' });
  }

  const payload = normalizeOnboardingPayload(req.body);
  const validationError = validateOnboardingPayload(payload, false);

  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  try {
    const records = loadOnboardingRecords();
    if (records.some((record) => Number(record.id) !== id && record.eid === payload.eid)) {
      return res.status(409).json({ error: 'eid already exists' });
    }
    const storagePayload = mapPayloadToStorage(payload);

    if (payload.eid !== existing.eid) {
      const resource = appendOnboardingRecord(storagePayload);
      return res.status(201).json(formatOnboardingResource(resource));
    }

    const resource = updateOnboardingRecord(id, storagePayload);
    return res.json(formatOnboardingResource(resource));
  } catch (error) {
    return res.status(500).json({ error: 'failed to update onboarding resource' });
  }
});

app.delete('/api/onboarding-resources/:id', (req, res) => {
  const id = Number(req.params.id);
  const records = loadOnboardingRecords();
  const existing = records.find((record) => Number(record.id) === id);
  if (!existing) {
    return res.status(404).json({ error: 'resource not found' });
  }
  const remaining = records.filter((record) => Number(record.id) !== id);
  saveOnboardingRecords(remaining);
  return res.status(200).json({ deleted: id });
});

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
