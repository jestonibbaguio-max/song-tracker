// Valid request bodies for every API route, against the fixture data in
// test/fixtures/data/. Used by the sqlite-trace guardrail and the round-trip
// tests. Each body is in the shape the Angular app sends (copied from the
// characterization files that pin each route).

const sprint = { name: 'Sprint 4', start: '2026-11-24', end: '2026-12-05' };
const retro = { sprintId: 2, groupNumber: 5, category: 'went-well', text: 'Daily pairing on AEM components kept everyone unblocked' };
const capacityEntry = { sprintName: 'Sprint 3', eid: 'rafael.t.mendoza', cadence: 4, admin: 1, holiday: 0 };
const attendanceCell = { eid: 'liza.m.navarro', year: 2026, month: 11, day: 5, status: 'Present' };
const bucket = { boardId: 1, name: 'Sprint 1', order: 0 };
const plannerTask = {
  boardId: 1, bucketId: 4, title: 'Build a React form with validation', status: 'Not started', priority: 'Medium',
  startDate: '2026-10-28', dueDate: '2026-11-06', labels: [2, 4], assignee: 'miguel.a.torres',
  checklist: [{ id: 1, text: 'Pick a form library', done: false }], description: '<p>Practice controlled inputs</p>',
  acceptanceCriteria: '<ul><li>All fields validated</li></ul>', comments: [], completed: false,
  createdAt: '2026-10-28T01:00:00.000Z', updatedAt: '2026-10-28T01:00:00.000Z',
};
const deletionLog = {
  type: 'task-deletion', taskId: 5, taskTitle: 'Accessibility audit of the onboarding form',
  deletedBy: 'Rafael Mendoza', deletedByEid: 'rafael.t.mendoza',
};
const reachout = {
  eid: 'jomar.c.pascual', projectName: 'Harborline Insurance Portal', techRole: 'AEM Developer',
  pocEid: 'rafael.t.mendoza', status: 'CV Requested', details: 'Junior slot, AEM components', groupNumber: 5,
};
const newJoiner = {
  name: 'Bea Santos', eid: 'bea.l.santos', hireDate: '11/02/2026', rollInDate: '11/09/2026',
  projectDeployed: 'No', deploymentDate: '', projectName: '', poc: 'andrea.s.bautista', dn: 'No',
  rollOffDate: '', fromProject: '', clLevel: '11', groupNumber: '1', primarySkill: 'React',
  primaryYears: '1', secondarySkill: '', secondaryYears: '', anotherSkills: ['TypeScript'], officeLocation: 'Cebu',
};

// Teresa (id 5) as the edit form sends her back.
const teresaEdited = {
  name: 'Teresa Villanueva', eid: 'teresa.villanueva', hireDate: '05/09/2022', rollInDate: '09/14/2026',
  projectDeployed: 'No', deploymentDate: '', projectName: 'Song Bench', poc: 'rafael.t.mendoza', dn: 'Yes',
  rollOffDate: '09/11/2026', fromProject: 'Retail Loyalty Platform', clLevel: '9', groupNumber: '5',
  primarySkill: 'AEM', primaryYears: '5', secondarySkill: 'Java', secondaryYears: '3',
  anotherSkills: ['Sling', 'HTL', 'Dispatcher'], officeLocation: 'Cebu',
};

/**
 * Every route of the dashboard stores (the collections that came from db.json)
 * with a request that reaches its handler's main path, and the collection it
 * reads first.
 */
const DB_ROUTES = [
  { collection: 'sprints', method: 'GET', path: '/api/sprints' },
  { collection: 'sprints', method: 'POST', path: '/api/sprints', body: sprint },
  { collection: 'sprints', method: 'PATCH', path: '/api/sprints/1', body: { name: 'Sprint 1 (renamed)' } },
  { collection: 'sprints', method: 'DELETE', path: '/api/sprints/3' },
  { collection: 'sprint-retros', method: 'GET', path: '/api/sprint-retros' },
  { collection: 'sprints', method: 'POST', path: '/api/sprint-retros', body: retro },
  { collection: 'sprint-retros', method: 'PATCH', path: '/api/sprint-retros/2', body: { text: 'Author instance setup took three days' } },
  { collection: 'sprint-retros', method: 'DELETE', path: '/api/sprint-retros/1' },
  { collection: 'capacity-entries', method: 'GET', path: '/api/capacity-entries' },
  { collection: 'capacity-entries', method: 'POST', path: '/api/capacity-entries', body: capacityEntry },
  { collection: 'attendance', method: 'GET', path: '/api/attendance' },
  { collection: 'attendance', method: 'POST', path: '/api/attendance', body: attendanceCell },
  { collection: 'attendance', method: 'PATCH', path: '/api/attendance/6', body: { status: 'Absent' } },
  { collection: 'attendance', method: 'DELETE', path: '/api/attendance/6' },
  { collection: 'attendance-options', method: 'GET', path: '/api/attendance-options' },
  { collection: 'office-locations', method: 'GET', path: '/api/office-locations' },
  { collection: 'planner-labels', method: 'GET', path: '/api/planner-labels' },
  { collection: 'planner-boards', method: 'GET', path: '/api/planner-boards' },
  { collection: 'planner-buckets', method: 'GET', path: '/api/planner-buckets' },
  { collection: 'planner-buckets', method: 'POST', path: '/api/planner-buckets', body: bucket },
  { collection: 'planner-tasks', method: 'GET', path: '/api/planner-tasks' },
  { collection: 'planner-tasks', method: 'POST', path: '/api/planner-tasks', body: plannerTask },
  { collection: 'planner-tasks', method: 'PATCH', path: '/api/planner-tasks/2', body: { status: 'Completed', completed: true } },
  { collection: 'planner-tasks', method: 'DELETE', path: '/api/planner-tasks/5' },
  { collection: 'deletion-logs', method: 'GET', path: '/api/deletion-logs' },
  { collection: 'deletion-logs', method: 'POST', path: '/api/deletion-logs', body: deletionLog },
  { collection: 'project-reachouts', method: 'GET', path: '/api/project-reachouts' },
  { collection: 'project-reachouts', method: 'POST', path: '/api/project-reachouts', body: reachout },
  { collection: 'project-reachouts', method: 'PATCH', path: '/api/project-reachouts/2', body: { status: 'Interview Scheduled' } },
  { collection: 'project-reachouts', method: 'DELETE', path: '/api/project-reachouts/4' },
  { collection: 'competency-records', method: 'GET', path: '/api/competency-records?group=5' },
  { collection: 'competency-records', method: 'PATCH', path: '/api/competency-records/liza.m.navarro', body: { primaryProficiency: 'P3' } },
];

module.exports = { DB_ROUTES, newJoiner, teresaEdited };
