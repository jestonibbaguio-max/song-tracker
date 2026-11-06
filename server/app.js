const express = require('express');
const cors = require('cors');
const {
  testBenchDir,
  browserDir,
  browserIndexPath
} = require('./config');
const {
  getSkillOptions
} = require('./json-store');
const {
  loadOnboardingRecords,
  saveOnboardingRecords,
  appendOnboardingRecord,
  updateOnboardingRecord
} = require('./onboarding-store');
const healthRoutes = require('./features/health/health.routes');
const dashboardRoutes = require('./features/dashboard/dashboard.routes');
const fruitsRoutes = require('./features/test-bench/fruits.routes');
const lookupsRoutes = require('./features/lookups/lookups.routes');
const legacyTasksRoutes = require('./features/legacy-tasks/legacy-tasks.routes');
const sprintsRoutes = require('./features/sprints/sprints.routes');
const capacityRoutes = require('./features/capacity/capacity.routes');
const { loadDb, saveDb } = require('./persistence/db-file.repository');
const { nextId } = require('./utils/ids');

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

function normalizeOnboardingPayload(body) {
  const projectDeployed = normalizeYesNo(body?.projectDeployed || body?.project_deployed || 'No');
  const projectName = projectDeployed === 'No' ? 'Song Bench' : String(body?.projectName || body?.project_name || '').trim();
  const pocRaw = String(body?.poc || '').trim();
  const poc = projectName === 'Song Bench' && !pocRaw ? 'hannahdel.l.orellosa' : pocRaw;

  return {
    name: String(body?.name || '').trim(),
    eid: String(body?.eid || '').trim().split('@')[0].toLowerCase(),
    hireDate: normalizeDateToUs(body?.hireDate || body?.hire_date || ''),
    rollInDate: normalizeDateToUs(body?.rollInDate || body?.roll_in_date || ''),
    projectDeployed,
    deploymentDate: normalizeDateToUs(body?.deploymentDate || body?.deployment_date || ''),
    projectName,
    poc,
    dn: normalizeYesNo(body?.dn || 'No'),
    rollOffDate: normalizeDateToUs(body?.rollOffDate || body?.roll_off_date || ''),
    fromProject: String(body?.fromProject || body?.from_project || '').trim(),
    clLevel: String(body?.clLevel || body?.cl_level || '').trim(),
    groupNumber: normalizeGroupNumber(body?.groupNumber || body?.group_number || ''),
    primarySkill: String(body?.primarySkill || body?.primary_skill || '').trim(),
    primaryYears: normalizeYears(body?.primaryYears || body?.primary_years || ''),
    secondarySkill: String(body?.secondarySkill || body?.secondary_skill || '').trim(),
    secondaryYears: normalizeYears(body?.secondaryYears || body?.secondary_years || ''),
    anotherSkills: normalizeSkillTags(body?.anotherSkills || body?.another_skills || []),
    officeLocation: String(body?.officeLocation || body?.office_location || '').trim()
  };
}

function normalizeDateToUs(value) {
  const raw = String(value || '').trim();
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (isoMatch) {
    return `${isoMatch[2]}/${isoMatch[3]}/${isoMatch[1]}`;
  }

  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (!slashMatch) {
    return raw;
  }

  let first = Number(slashMatch[1]);
  let second = Number(slashMatch[2]);
  const year = Number(slashMatch[3]);

  if (first > 12 && second <= 12) {
    [first, second] = [second, first];
  }

  return `${String(first).padStart(2, '0')}/${String(second).padStart(2, '0')}/${year}`;
}

function normalizeYesNo(value) {
  return String(value || '').trim().toLowerCase() === 'yes' ? 'Yes' : 'No';
}

function normalizeGroupNumber(value) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 6) {
    return null;
  }

  return parsed;
}

function normalizeYears(value) {
  const raw = String(value || '').trim();

  if (!raw) {
    return '';
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? String(parsed) : raw;
}

function normalizeSkillTags(value) {
  const tags = Array.isArray(value) ? value : String(value || '').split(',');
  const unique = new Set();

  for (const tag of tags) {
    const normalized = String(tag || '').trim();

    if (normalized) {
      unique.add(normalized);
    }
  }

  return [...unique];
}

function mapPayloadToStorage(payload) {
  const groupNum = payload.groupNumber !== undefined && payload.groupNumber !== null
    ? Number(payload.groupNumber)
    : (payload.group_number != null ? Number(payload.group_number) : null);
  const skills = Array.isArray(payload.anotherSkills) ? payload.anotherSkills : (payload.another_skills || []);
  return {
    name: payload.name,
    eid: payload.eid,
    hireDate: payload.hireDate || payload.hire_date || '',
    rollInDate: payload.rollInDate || payload.roll_in_date || '',
    projectDeployed: payload.projectDeployed || payload.project_deployed || 'No',
    deploymentDate: payload.deploymentDate || payload.deployment_date || '',
    projectName: payload.projectName || payload.project_name || (payload.project_deployed === 'No' ? 'Song Bench' : ''),
    poc: payload.poc || '',
    dn: payload.dn || 'No',
    rollOffDate: payload.rollOffDate || payload.roll_off_date || '',
    fromProject: payload.fromProject || payload.from_project || '',
    clLevel: payload.clLevel || payload.cl_level || '',
    groupNumber: groupNum,
    primarySkill: payload.primarySkill || payload.primary_skill || '',
    primaryYears: payload.primaryYears || payload.primary_years || '',
    secondarySkill: payload.secondarySkill || payload.secondary_skill || '',
    secondaryYears: payload.secondaryYears || payload.secondary_years || '',
    anotherSkills: skills,
    officeLocation: payload.officeLocation || payload.office_location || ''
  };
}

function learnSkillOptions(payload) {
  // Skill option persistence is now handled in json-store.js via onboarding records.
  return;
}

function validateOnboardingPayload(payload, requireDates = true) {
  if (!payload.name || !payload.eid) {
    return 'name and eid are required';
  }

  if (requireDates && (!payload.hireDate || !payload.rollInDate)) {
    return 'hireDate and rollInDate are required';
  }

  if (!/^[a-z0-9._-]+$/i.test(payload.eid)) {
    return 'eid can only contain letters, numbers, dot, underscore, or dash';
  }

  if (payload.hireDate && !/^\d{2}\/\d{2}\/\d{4}$/.test(payload.hireDate)) {
    return 'hireDate must use MM/DD/YYYY format';
  }

  if (payload.rollInDate && !/^\d{2}\/\d{2}\/\d{4}$/.test(payload.rollInDate)) {
    return 'rollInDate must use MM/DD/YYYY format';
  }

  for (const dateValue of [payload.deploymentDate, payload.rollOffDate]) {
    if (dateValue && !/^\d{2}\/\d{2}\/\d{4}$/.test(dateValue)) {
      return 'optional dates must use MM/DD/YYYY format';
    }
  }

  if (payload.groupNumber !== null && (payload.groupNumber < 1 || payload.groupNumber > 6)) {
    return 'group must be between 1 and 6';
  }

  return '';
}

function formatOnboardingResource(resource) {
  return {
    id: resource.id,
    name: resource.name || '',
    eid: resource.eid || '',
    hireDate: resource.hireDate || resource.hire_date || '',
    rollInDate: resource.rollInDate || resource.roll_in_date || '',
    projectDeployed: resource.projectDeployed || resource.project_deployed || 'No',
    deploymentDate: resource.deploymentDate || resource.deployment_date || '',
    projectName: resource.projectName || resource.project_name || '',
    poc: resource.poc || '',
    dn: resource.dn || 'No',
    rollOffDate: resource.rollOffDate || resource.roll_off_date || '',
    fromProject: resource.fromProject || resource.from_project || '',
    clLevel: resource.clLevel || resource.cl_level || '',
    groupNumber: resource.groupNumber != null ? Number(resource.groupNumber) : (resource.group_number != null ? Number(resource.group_number) : null),
    primarySkill: resource.primarySkill || resource.primary_skill || '',
    primaryYears: resource.primaryYears || resource.primary_years || '',
    secondarySkill: resource.secondarySkill || resource.secondary_skill || '',
    secondaryYears: resource.secondaryYears || resource.secondary_years || '',
    anotherSkills: parseSkillTags(resource.anotherSkills || resource.another_skills),
    officeLocation: resource.officeLocation || resource.office_location || '',
    createdAt: resource.createdAt || resource.created_at || '',
    updatedAt: resource.updatedAt || resource.updated_at || ''
  };
}

function parseSkillTags(value) {
  if (Array.isArray(value)) {
    return value;
  }

  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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
app.get('/api/attendance', (req, res) => {
  const db = loadDb();
  let records = db['attendance'] || [];
  const { year, month } = req.query;
  if (year) records = records.filter(r => Number(r.year) === Number(year));
  if (month) records = records.filter(r => Number(r.month) === Number(month));
  res.json(records);
});

app.post('/api/attendance', (req, res) => {
  const db = loadDb();
  const records = db['attendance'] || [];
  const id = nextId(records);
  const record = { ...req.body, id };
  records.push(record);
  db['attendance'] = records;
  saveDb(db);
  res.status(201).json(record);
});

app.patch('/api/attendance/:id', (req, res) => {
  const db = loadDb();
  const records = db['attendance'] || [];
  const id = Number(req.params.id);
  const idx = records.findIndex(r => Number(r.id) === id);
  if (idx === -1) return res.status(404).json({ error: 'record not found' });
  records[idx] = { ...records[idx], ...req.body, id };
  db['attendance'] = records;
  saveDb(db);
  res.json(records[idx]);
});

app.delete('/api/attendance/:id', (req, res) => {
  const db = loadDb();
  const records = db['attendance'] || [];
  const id = Number(req.params.id);
  const idx = records.findIndex(r => Number(r.id) === id);
  if (idx === -1) return res.status(404).json({ error: 'record not found' });
  records.splice(idx, 1);
  db['attendance'] = records;
  saveDb(db);
  res.json({ deleted: true });
});

// ── Planner boards ────────────────────────────────────────────────────────────
app.get('/api/planner-boards', (req, res) => {
  const db = loadDb();
  let boards = (db['planner-boards'] || []).map(b => ({ ...b, id: Number(b.id), groupNumber: Number(b.groupNumber) }));
  if (req.query.groupNumber !== undefined) {
    const gn = Number(req.query.groupNumber);
    boards = boards.filter(b => b.groupNumber === gn);
  }
  res.json(boards);
});

// ── Planner buckets ───────────────────────────────────────────────────────────
app.get('/api/planner-buckets', (req, res) => {
  const db = loadDb();
  let buckets = (db['planner-buckets'] || []).map(b => ({ ...b, id: Number(b.id), boardId: Number(b.boardId) }));
  if (req.query.boardId !== undefined) {
    const bid = Number(req.query.boardId);
    buckets = buckets.filter(b => b.boardId === bid);
  }
  res.json(buckets);
});

app.post('/api/planner-buckets', (req, res) => {
  const { boardId, name, order } = req.body;
  if (!boardId || !name) return res.status(400).json({ error: 'boardId and name are required' });
  const db = loadDb();
  const buckets = db['planner-buckets'] || [];
  const id = nextId(buckets);
  const bucket = { id, boardId: Number(boardId), name: String(name).trim(), order: Number(order) || 0 };
  buckets.push(bucket);
  db['planner-buckets'] = buckets;
  saveDb(db);
  res.status(201).json(bucket);
});

// ── Planner tasks ─────────────────────────────────────────────────────────────
app.get('/api/planner-tasks', (req, res) => {
  const db = loadDb();
  let tasks = (db['planner-tasks'] || []).map(t => ({
    ...t,
    id: Number(t.id),
    boardId: Number(t.boardId),
    bucketId: Number(t.bucketId),
  }));
  if (req.query.boardId !== undefined) {
    const bid = Number(req.query.boardId);
    tasks = tasks.filter(t => t.boardId === bid);
  }
  res.json(tasks);
});

app.post('/api/planner-tasks', (req, res) => {
  const db = loadDb();
  const tasks = db['planner-tasks'] || [];
  const now = new Date().toISOString();
  const id = nextId(tasks);
  const task = { ...req.body, id, boardId: Number(req.body.boardId), bucketId: Number(req.body.bucketId), createdAt: now, updatedAt: now };
  tasks.push(task);
  db['planner-tasks'] = tasks;
  saveDb(db);
  res.status(201).json(task);
});

app.patch('/api/planner-tasks/:id', (req, res) => {
  const db = loadDb();
  const tasks = db['planner-tasks'] || [];
  const id = Number(req.params.id);
  const idx = tasks.findIndex(t => Number(t.id) === id);
  if (idx === -1) return res.status(404).json({ error: 'task not found' });
  const body = { ...req.body };
  if (body.boardId !== undefined) body.boardId = Number(body.boardId);
  if (body.bucketId !== undefined) body.bucketId = Number(body.bucketId);
  tasks[idx] = { ...tasks[idx], ...body, id, updatedAt: new Date().toISOString() };
  db['planner-tasks'] = tasks;
  saveDb(db);
  res.json(tasks[idx]);
});

app.delete('/api/planner-tasks/:id', (req, res) => {
  const db = loadDb();
  const tasks = db['planner-tasks'] || [];
  const id = Number(req.params.id);
  const idx = tasks.findIndex(t => Number(t.id) === id);
  if (idx === -1) return res.status(404).json({ error: 'task not found' });
  tasks.splice(idx, 1);
  db['planner-tasks'] = tasks;
  saveDb(db);
  res.json({ deleted: true });
});
// ── Deletion logs ─────────────────────────────────────────────────────────────
app.get('/api/deletion-logs', (req, res) => {
  const db = loadDb();
  let logs = db['deletion-logs'] || [];
  if (req.query.eid) logs = logs.filter(l => l.deletedByEid === req.query.eid);
  res.json(logs);
});

app.post('/api/deletion-logs', (req, res) => {
  const db = loadDb();
  const logs = db['deletion-logs'] || [];
  const id = nextId(logs);
  const log = { ...req.body, id, deletedAt: new Date().toISOString() };
  logs.push(log);
  db['deletion-logs'] = logs;
  saveDb(db);
  res.status(201).json(log);
});
// ─────────────────────────────────────────────────────────────────────────────

// ── Project reachouts ─────────────────────────────────────────────────────────
const REACHOUT_DEFAULT_STATUS = 'CV Requested';
const REACHOUT_REQUIRED_FIELDS = ['eid', 'projectName', 'techRole', 'pocEid'];

function normalizeEid(value) {
  return String(value || '').trim().split('@')[0].toLowerCase();
}

function normalizeReachoutGroup(value) {
  const group = Number(value);
  return Number.isInteger(group) && group >= 1 && group <= 6 ? group : null;
}

function normalizeReachoutPayload(body) {
  return {
    eid: normalizeEid(body?.eid),
    projectName: String(body?.projectName || '').trim(),
    techRole: String(body?.techRole || '').trim(),
    pocEid: normalizeEid(body?.pocEid),
    status: String(body?.status || '').trim() || REACHOUT_DEFAULT_STATUS,
    details: String(body?.details || '').trim(),
    groupNumber: normalizeReachoutGroup(body?.groupNumber),
  };
}

app.get('/api/project-reachouts', (req, res) => {
  const db = loadDb();
  let rows = db['project-reachouts'] || [];
  if (req.query.group) rows = rows.filter(r => String(r.groupNumber) === String(req.query.group));
  res.json(rows.map(r => ({ ...r, id: Number(r.id) })));
});

app.post('/api/project-reachouts', (req, res) => {
  const payload = normalizeReachoutPayload(req.body);
  const missing = REACHOUT_REQUIRED_FIELDS.filter(field => !payload[field]);
  if (missing.length) return res.status(400).json({ error: `${missing.join(', ')} required` });

  const db = loadDb();
  const rows = db['project-reachouts'] || [];
  const row = { id: nextId(rows), ...payload, createdAt: new Date().toISOString() };
  rows.push(row);
  db['project-reachouts'] = rows;
  saveDb(db);
  res.status(201).json(row);
});

app.patch('/api/project-reachouts/:id', (req, res) => {
  const id = Number(req.params.id);
  const db = loadDb();
  const rows = db['project-reachouts'] || [];
  const idx = rows.findIndex(r => Number(r.id) === id);
  if (idx === -1) return res.status(404).json({ error: 'reachout not found' });

  const body = req.body || {};
  if (body.eid !== undefined) rows[idx].eid = normalizeEid(body.eid);
  if (body.projectName !== undefined) rows[idx].projectName = String(body.projectName).trim();
  if (body.techRole !== undefined) rows[idx].techRole = String(body.techRole).trim();
  if (body.pocEid !== undefined) rows[idx].pocEid = normalizeEid(body.pocEid);
  if (body.status !== undefined) rows[idx].status = String(body.status).trim() || REACHOUT_DEFAULT_STATUS;
  if (body.details !== undefined) rows[idx].details = String(body.details).trim();
  if (body.groupNumber !== undefined) rows[idx].groupNumber = normalizeReachoutGroup(body.groupNumber);

  const missing = REACHOUT_REQUIRED_FIELDS.filter(field => !rows[idx][field]);
  if (missing.length) return res.status(400).json({ error: `${missing.join(', ')} required` });

  rows[idx].updatedAt = new Date().toISOString();
  db['project-reachouts'] = rows;
  saveDb(db);
  res.json({ ...rows[idx], id: Number(rows[idx].id) });
});

app.delete('/api/project-reachouts/:id', (req, res) => {
  const id = Number(req.params.id);
  const db = loadDb();
  const rows = db['project-reachouts'] || [];
  const idx = rows.findIndex(r => Number(r.id) === id);
  if (idx === -1) return res.status(404).json({ error: 'reachout not found' });
  rows.splice(idx, 1);
  db['project-reachouts'] = rows;
  saveDb(db);
  res.json({ deleted: true });
});
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
