// Hard-coded dashboard content, including the sidebar nav groups. Nothing is
// read from disk: the dashboard key in db.json is ignored.
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
          { icon: 'bi-journals', label: 'Bench Trainings', badge: null, active: false },
          { icon: 'bi-person-video3', label: 'Mock Interview', badge: null, active: false },
          { icon: 'bi-send', label: 'Project Reachouts', badge: null, active: false },
          { icon: 'bi-mortarboard', label: 'Group Trainings', badge: null, active: false },
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

module.exports = { getDashboardPayload };
