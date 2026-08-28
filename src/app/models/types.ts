export interface NavItem {
  icon: string;
  label: string;
  badge?: string | null;
  active?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export interface DashboardStat {
  label: string;
  value: string;
  detail: string;
}

export interface ChecklistItem {
  label: string;
  status: string;
  done?: boolean;
  warning?: boolean;
}

export interface Initiative {
  title: string;
  group: string;
  meta: string;
  tags: string[];
  status: string;
}

export interface Announcement {
  title: string;
  meta: string;
}

export interface PocPerson {
  initials: string;
  name: string;
  role: string;
  pending: string;
}

export interface QuickTool {
  icon: string;
  label: string;
}

export interface OnboardingResource {
  id: number;
  name: string;
  eid: string;
  hireDate: string;
  rollInDate: string;
  projectDeployed: 'Yes' | 'No';
  deploymentDate: string;
  projectName: string;
  poc: string;
  dn: 'Yes' | 'No';
  rollOffDate: string;
  fromProject: string;
  clLevel: string;
  groupNumber: number | null;
  primarySkill: string;
  primaryYears: string;
  secondarySkill: string;
  secondaryYears: string;
  anotherSkills: string[];
  officeLocation: string;
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceEntry {
  id?: number | string;
  eid: string;
  year: number;
  month: number;
  day: number;
  status: string;
  location?: string;
}

export interface CompetencyRecord {
  eid: string;
  name?: string;
  clLevel?: string;
  primarySkill: string;
  primaryProficiency: string;
  recentRetakeDate: string;
  nextRetakeDate: string;
  secondarySkill: string;
  secondaryProficiency: string;
  retakeDate: string;
}

export interface PlannerLabel {
  id: number;
  name: string;
  color: string;
}

export interface PlannerBoard {
  id: number;
  groupNumber: number;
  name: string;
  description?: string;
}

export interface PlannerBucket {
  id: number;
  boardId: number;
  name: string;
  order: number;
}

export interface PlannerChecklistItem {
  id: number;
  text: string;
  done: boolean;
}

export interface PlannerComment {
  id: number;
  author: string;
  text: string;
  createdAt: string;
}

export interface DeletionLog {
  type: 'comment-deletion' | 'task-deletion';
  taskId: number | string | undefined;
  taskTitle: string;
  deletedBy: string;
  deletedByEid: string;
  commentAuthor?: string;
  commentText?: string;
  commentCreatedAt?: string;
}

export interface PlannerTask {
  id?: number | string;
  boardId: number;
  bucketId: number;
  title: string;
  status: string;
  priority: string;
  startDate: string;
  dueDate: string;
  labels: number[];
  assignee: string;
  checklist: PlannerChecklistItem[];
  description: string;
  acceptanceCriteria: string;
  comments: PlannerComment[];
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BurndownRow {
  day: number;
  goalPerDay: number;
  complete: number;
  target: number;
  actuals: number | null;
  targetRate: number;
  actualRate: number | null;
}

export interface BurndownChartConfig {
  total: number;
  bars: { x: number; y: number; w: number; h: number; val: number; dayLabel: number }[];
  actualLine: string;
  actualPts: { x: number; y: number; val: number; day: number }[];
  yTicks: { y: number; label: number }[];
  xLabels: { x: number; label: number }[];
  chartX: number;
  baseY: number;
}

export interface OnboardingForm {
  name: string;
  eid: string;
  hireDate: string;
  rollInDate: string;
  projectDeployed: 'Yes' | 'No';
  deploymentDate: string;
  projectName: string;
  poc: string;
  dn: 'Yes' | 'No';
  rollOffDate: string;
  fromProject: string;
  clLevel: string;
  groupNumber: string;
  primarySkill: string;
  primaryYears: string;
  secondarySkill: string;
  secondaryYears: string;
  anotherSkills: string[];
  officeLocation: string;
}

export interface DashboardData {
  notice: {
    title: string;
    detail: string;
    badge: string;
  };
  header: {
    welcomeName: string;
    detail: string;
  };
  checklistProgress: {
    completed: number;
    total: number;
    percent: number;
  };
  navGroups: NavGroup[];
  stats: DashboardStat[];
  checklist: ChecklistItem[];
  initiatives: Initiative[];
  announcements: Announcement[];
  poc: PocPerson[];
  quickTools: QuickTool[];
}
