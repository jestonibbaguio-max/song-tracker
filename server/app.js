// Composition only: creates the single Express app and wires middleware,
// feature routers and static serving together. No routes or logic live here.
// server.js calls listen(); the API tests require this module and start their own server.
const express = require('express');
const cors = require('cors');
const healthRoutes = require('./features/health/health.routes');
const legacyTasksRoutes = require('./features/legacy-tasks/legacy-tasks.routes');
const onboardingRoutes = require('./features/onboarding/onboarding.routes');
const dashboardRoutes = require('./features/dashboard/dashboard.routes');
const sprintsRoutes = require('./features/sprints/sprints.routes');
const capacityRoutes = require('./features/capacity/capacity.routes');
const lookupsRoutes = require('./features/lookups/lookups.routes');
const attendanceRoutes = require('./features/attendance/attendance.routes');
const plannerRoutes = require('./features/planner/planner.routes');
const reachoutsRoutes = require('./features/reachouts/reachouts.routes');
const fruitsRoutes = require('./features/test-bench/fruits.routes');
const competencyRoutes = require('./features/competency/competency.routes');
const registerStaticFiles = require('./middleware/static');

const app = express();

// The order is part of the API's behaviour (see "Middleware order" in
// docs/server-restructure-plan.md):
// 1. cors() before the JSON parser, so error responses for malformed bodies
//    still carry the CORS header;
// 2. express.json() on the app, so a malformed body is a 400 on every path;
// 3. the API routers (full paths, no prefix; none of their paths overlap);
// 4. static files and the GET index.html fallback, after every router.
app.use(cors());
app.use(express.json());

app.use(healthRoutes);
app.use(legacyTasksRoutes);
app.use(onboardingRoutes);
app.use(dashboardRoutes);
app.use(sprintsRoutes);
app.use(capacityRoutes);
app.use(lookupsRoutes);
app.use(attendanceRoutes);
app.use(plannerRoutes);
app.use(reachoutsRoutes);
app.use(fruitsRoutes);
app.use(competencyRoutes);

registerStaticFiles(app);

module.exports = app;
