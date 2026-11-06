const express = require('express');
const cors = require('cors');
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
const competencyRoutes = require('./features/competency/competency.routes');
const registerStaticFiles = require('./middleware/static');

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

// ── Competency records ────────────────────────────────────────────────────────
app.use(competencyRoutes);

registerStaticFiles(app);

module.exports = app;
