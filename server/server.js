const path = require('path');
const express = require('express');
const cors = require('cors');
const {
  getDashboardPayload,
  getTasks,
  addTask,
  updateTask,
  deleteTask,
  getSkillOptions
} = require('./json-store');
const {
  loadOnboardingRecords,
  saveOnboardingRecords,
  appendOnboardingRecord,
  updateOnboardingRecord
} = require('./onboarding-store');

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/tasks', (req, res) => {
  res.json(getTasks());
});

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

app.get('/api/dashboard', (req, res) => {
  res.json(getDashboardPayload());
});

app.post('/api/tasks', (req, res) => {
  const title = String(req.body?.title || '').trim();
  const status = String(req.body?.status || 'open').trim() || 'open';

  if (!title) {
    return res.status(400).json({ error: 'title is required' });
  }

  const task = addTask({ title, status });
  return res.status(201).json(task);
});

app.patch('/api/tasks/:id', (req, res) => {
  const id = Number(req.params.id);
  const title = req.body?.title === undefined ? null : String(req.body.title).trim();
  const status = req.body?.status === undefined ? null : String(req.body.status).trim();

  if (title === '' || status === '') {
    return res.status(400).json({ error: 'title and status cannot be empty' });
  }

  const task = updateTask(id, { title, status });

  if (!task) {
    return res.status(404).json({ error: 'task not found' });
  }

  return res.json(task);
});

app.delete('/api/tasks/:id', (req, res) => {
  const deleted = deleteTask(Number(req.params.id));
  res.json({ deleted });
});

// ── db.json helpers ───────────────────────────────────────────────────────────
const fs = require('fs');
const dbPath = path.join(__dirname, 'data', 'db.json');

function loadDb() {
  try { return JSON.parse(fs.readFileSync(dbPath, 'utf8')); }
  catch { return {}; }
}

function saveDb(db) {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
}

function nextId(arr) {
  return (arr.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0)) + 1;
}

// ── Sprints ───────────────────────────────────────────────────────────────────
app.get('/api/sprints', (req, res) => {
  const db = loadDb();
  res.json((db['sprints'] || []).map(s => ({ ...s, id: Number(s.id) })));
});

app.post('/api/sprints', (req, res) => {
  const { name, start, end } = req.body;
  if (!name || !start || !end) return res.status(400).json({ error: 'name, start and end are required' });
  const db = loadDb();
  const sprints = db['sprints'] || [];
  const id = nextId(sprints);
  const sprint = { id, name: String(name).trim(), start: String(start), end: String(end) };
  sprints.push(sprint);
  db['sprints'] = sprints;
  saveDb(db);
  res.status(201).json(sprint);
});

app.patch('/api/sprints/:id', (req, res) => {
  const id = Number(req.params.id);
  const db = loadDb();
  const sprints = db['sprints'] || [];
  const idx = sprints.findIndex(s => Number(s.id) === id);
  if (idx === -1) return res.status(404).json({ error: 'sprint not found' });
  const { name, start, end } = req.body;
  if (name !== undefined) sprints[idx].name = String(name).trim();
  if (start !== undefined) sprints[idx].start = String(start);
  if (end !== undefined) sprints[idx].end = String(end);
  db['sprints'] = sprints;
  saveDb(db);
  res.json({ ...sprints[idx], id: Number(sprints[idx].id) });
});

app.delete('/api/sprints/:id', (req, res) => {
  const id = Number(req.params.id);
  const db = loadDb();
  const sprints = db['sprints'] || [];
  const idx = sprints.findIndex(s => Number(s.id) === id);
  if (idx === -1) return res.status(404).json({ error: 'sprint not found' });
  sprints.splice(idx, 1);
  db['sprints'] = sprints;
  saveDb(db);
  res.json({ deleted: true });
});

// ── Capacity entries ──────────────────────────────────────────────────────────
app.get('/api/capacity-entries', (req, res) => {
  const db = loadDb();
  let entries = db['capacity-entries'] || [];
  if (req.query.sprintName) entries = entries.filter(e => e.sprintName === req.query.sprintName);
  res.json(entries);
});

app.post('/api/capacity-entries', (req, res) => {
  const { sprintName, eid, cadence, admin, holiday } = req.body;
  if (!sprintName || !eid) return res.status(400).json({ error: 'sprintName and eid are required' });
  const db = loadDb();
  const entries = db['capacity-entries'] || [];
  const existing = entries.find(e => e.sprintName === sprintName && e.eid === eid);
  if (existing) {
    if (cadence !== undefined) existing.cadence = Number(cadence);
    if (admin !== undefined) existing.admin = Number(admin);
    if (holiday !== undefined) existing.holiday = Number(holiday);
    db['capacity-entries'] = entries;
    saveDb(db);
    return res.json(existing);
  }
  const id = nextId(entries);
  const entry = { id, sprintName, eid, cadence: Number(cadence) || 0, admin: Number(admin) || 0, holiday: Number(holiday) || 0 };
  entries.push(entry);
  db['capacity-entries'] = entries;
  saveDb(db);
  res.status(201).json(entry);
});

// ── Attendance ────────────────────────────────────────────────────────────────
app.get('/api/attendance-options', (req, res) => {
  const db = loadDb();
  res.json(db['attendance-options'] || []);
});

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

// ── Office locations ──────────────────────────────────────────────────────────
app.get('/api/office-locations', (req, res) => {
  const db = loadDb();
  res.json(db['office-locations'] || []);
});

// ── Planner labels ────────────────────────────────────────────────────────────
app.get('/api/planner-labels', (req, res) => {
  const db = loadDb();
  res.json(db['planner-labels'] || []);
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

// ── Test Bench: Fruits CRUD ───────────────────────────────────────────────────
const fruitsDbPath = path.join(__dirname, 'data', 'test_bwd', 'db.json');

function loadFruitsDb() {
  try { return JSON.parse(fs.readFileSync(fruitsDbPath, 'utf8')); }
  catch { return { fruits: [] }; }
}
function saveFruitsDb(db) {
  fs.writeFileSync(fruitsDbPath, JSON.stringify(db, null, 2), 'utf8');
}
function fruitsNextId(arr) {
  return arr.length ? Math.max(...arr.map(f => Number(f.id))) + 1 : 1;
}

app.get('/api/fruits', (req, res) => {
  const db = loadFruitsDb();
  let list = db.fruits || [];
  if (req.query.category) list = list.filter(f => f.category === req.query.category);
  if (req.query.q) {
    const q = req.query.q.toLowerCase();
    list = list.filter(f => f.name.toLowerCase().includes(q) || f.category.toLowerCase().includes(q));
  }
  res.json(list);
});

app.get('/api/fruits/:id', (req, res) => {
  const db = loadFruitsDb();
  const fruit = (db.fruits || []).find(f => Number(f.id) === Number(req.params.id));
  if (!fruit) return res.status(404).json({ error: 'not found' });
  res.json(fruit);
});

app.post('/api/fruits', (req, res) => {
  const db = loadFruitsDb();
  const fruits = db.fruits || [];
  const { name, emoji, category, price, stock } = req.body;
  if (!name || !category) return res.status(400).json({ error: 'name and category are required' });
  const fruit = { id: fruitsNextId(fruits), name, emoji: emoji || '🍎', category, price: Number(price) || 0, stock: Number(stock) || 0 };
  fruits.push(fruit);
  db.fruits = fruits;
  saveFruitsDb(db);
  res.status(201).json(fruit);
});

app.patch('/api/fruits/:id', (req, res) => {
  const db = loadFruitsDb();
  const fruits = db.fruits || [];
  const id = Number(req.params.id);
  const idx = fruits.findIndex(f => Number(f.id) === id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  fruits[idx] = { ...fruits[idx], ...req.body, id };
  db.fruits = fruits;
  saveFruitsDb(db);
  res.json(fruits[idx]);
});

app.delete('/api/fruits/:id', (req, res) => {
  const db = loadFruitsDb();
  const id = Number(req.params.id);
  const before = (db.fruits || []).length;
  db.fruits = (db.fruits || []).filter(f => Number(f.id) !== id);
  if (db.fruits.length === before) return res.status(404).json({ error: 'not found' });
  saveFruitsDb(db);
  res.json({ deleted: true });
});

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
app.use('/test', express.static(path.join(__dirname, 'data', 'test_bwd')));
// ─────────────────────────────────────────────────────────────────────────────

const browserDir = path.join(__dirname, '..', 'dist', 'atcp-song-dashboard', 'browser');
app.use(express.static(browserDir));

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(browserDir, 'index.html'));
});

app.listen(port, () => {
  console.log(`API running on http://127.0.0.1:${port}`);
});
