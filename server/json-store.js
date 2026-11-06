const fs = require('fs');
const onboardingStore = require('./onboarding-store');
const { DATA_DIR, tasksPath } = require('./config');

const dataDir = DATA_DIR;

function ensureDataDirectory() {
  fs.mkdirSync(dataDir, { recursive: true });
}

function readJson(filePath, defaultValue) {
  ensureDataDirectory();

  if (!fs.existsSync(filePath)) {
    writeJson(filePath, defaultValue);
    return defaultValue;
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    writeJson(filePath, defaultValue);
    return defaultValue;
  }
}

function writeJson(filePath, data) {
  ensureDataDirectory();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function getTasks() {
  return readJson(tasksPath, [
    {
      id: 1,
      title: 'Prepare onboarding report',
      status: 'open',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ]);
}

function nextTaskId(tasks) {
  return tasks.reduce((max, task) => Math.max(max, Number(task.id) || 0), 0) + 1;
}

function addTask(payload) {
  const tasks = getTasks();
  const task = {
    id: nextTaskId(tasks),
    title: payload.title,
    status: payload.status,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  tasks.unshift(task);
  writeJson(tasksPath, tasks);
  return task;
}

function updateTask(id, payload) {
  const tasks = getTasks();
  const task = tasks.find((item) => Number(item.id) === id);
  if (!task) {
    return null;
  }
  task.title = payload.title === null ? task.title : payload.title;
  task.status = payload.status === null ? task.status : payload.status;
  task.updated_at = new Date().toISOString();
  writeJson(tasksPath, tasks);
  return task;
}

function deleteTask(id) {
  const tasks = getTasks();
  const remaining = tasks.filter((item) => Number(item.id) !== id);
  writeJson(tasksPath, remaining);
  return remaining.length !== tasks.length;
}

function getSkillOptions() {
  const records = onboardingStore.loadOnboardingRecords();
  const skills = new Set();

  records.forEach((record) => {
    if (record.primary_skill) {
      skills.add(record.primary_skill);
    }
    if (record.secondary_skill) {
      skills.add(record.secondary_skill);
    }
    if (Array.isArray(record.another_skills)) {
      record.another_skills.forEach((skill) => {
        if (skill) {
          skills.add(skill);
        }
      });
    }
  });

  return [...skills].sort((a, b) => a.localeCompare(b));
}

module.exports = {
  getTasks,
  addTask,
  updateTask,
  deleteTask,
  getSkillOptions
};
