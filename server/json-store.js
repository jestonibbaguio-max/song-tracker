const fs = require('fs');
const path = require('path');
const onboardingStore = require('./onboarding-store');

const dataDir = path.join(__dirname, 'data');
const tasksPath = path.join(dataDir, 'tasks.json');

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

function getDashboardPayload() {
  return {
    notice: {
      title: 'RTO policy update effective Aug 1',
      detail: '3 days onsite required for bench resources.',
      badge: 'New'
    },
    header: {
      welcomeName: 'Aldhen Dignaran test 01',
      detail: 'Song Bench - Week 3 on bench - New joiner track'
    },
    checklistProgress: {
      completed: 8,
      total: 12,
      percent: 67
    },
    navGroups: [
      {
        label: 'MAIN',
        items: [
          { icon: 'bi-grid-1x2', label: 'Dashboard', badge: null, active: true },
          { icon: 'bi-person-check', label: 'Resources', badge: null, active: false },
          { icon: 'bi-calendar-check', label: 'Attendance Tracker', badge: null, active: false },
          { icon: 'bi-calendar3', label: 'Planner', badge: null, active: false },
          { icon: 'bi-patch-check', label: 'myCompetency', badge: null, active: false },
          { icon: 'bi-journals', label: 'Trainings', badge: null, active: false },
          { icon: 'bi-person-video3', label: 'Mock Interview', badge: null, active: false },
          { icon: 'bi-send', label: 'Projects and Reachouts', badge: null, active: false },
          { icon: 'bi-mortarboard', label: 'Training', badge: null, active: false },
          { icon: 'bi-kanban', label: 'Initiatives', badge: null, active: false }
        ]
      },
      {
        label: 'POC TOOLS',
        items: [
          { icon: 'bi-file-earmark-bar-graph', label: 'Reports', badge: null, active: false },
          { icon: 'bi-people', label: 'Resource tracking', badge: null, active: false },
          { icon: 'bi-journal-text', label: 'POC how-to', badge: null, active: false }
        ]
      },
      {
        label: 'GENERAL',
        items: [
          { icon: 'bi-megaphone', label: 'Announcements', badge: null, active: false },
          { icon: 'bi-gear', label: 'Settings', badge: null, active: false }
        ]
      }
    ],
    stats: [
      { label: 'Onboarding progress', value: '67%', detail: '8 of 12 tasks complete' },
      { label: 'Pending tasks', value: '4', detail: '2 overdue' },
      { label: 'Active initiatives', value: '23', detail: 'Across 5 Song groups' },
      { label: 'Resources on bench', value: '47', detail: '6 not started onboarding' }
    ],
    checklist: [
      { label: 'Complete HR verification', status: 'Done Jul 10', done: true, warning: false },
      { label: 'Attend bench orientation', status: 'Done Jul 12', done: true, warning: false },
      { label: 'Submit BIR documents', status: 'Overdue', done: false, warning: true }
    ],
    initiatives: [
      { id: 1, title: 'Song Bench rollout', group: 'Group A', meta: 'Release plan active', status: 'On track' },
      { id: 2, title: 'Mobile lift initiative', group: 'Group B', meta: 'Scope review pending', status: 'Planning' }
    ],
    announcements: [
      { title: 'New bench orientation date', meta: 'Aug 5 at 10am' },
      { title: 'Process update', meta: 'Submit onboarding in Song Bench portal' }
    ],
    poc: [
      { initials: 'AD', name: 'Aldhen Dignaran', role: 'Bench coordinator', pending: '3 actions' },
      { initials: 'JG', name: 'Jannrey Tolop', role: 'Project lead', pending: '1 action' }
    ],
    quickTools: [
      { icon: 'bi-file-earmark-bar-graph', label: 'Reports' },
      { icon: 'bi-people', label: 'Resource tracking' },
      { icon: 'bi-journal-text', label: 'POC how-to' }
    ]
  };
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
  getDashboardPayload,
  getTasks,
  addTask,
  updateTask,
  deleteTask,
  getSkillOptions
};
