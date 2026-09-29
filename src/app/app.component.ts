import { Component, ViewEncapsulation } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { SharedDataService } from './services/shared-data.service';
import { NavGroup, NavItem, DashboardData } from './models/types';
import { DashboardComponent } from './views/dashboard/dashboard.component';
import { OnboardingComponent } from './views/onboarding/onboarding.component';
import { AttendanceComponent } from './views/attendance/attendance.component';
import { PlannerComponent } from './views/planner/planner.component';
import { MyCompetencyComponent } from './views/mycompetency/mycompetency.component';
import { MockAssessmentComponent, MockAssessmentSummary } from './views/mockAssessmentSummary/mock-assessment.data';
import { MOCK_ASSESSMENT_PAGE_SIZE, MOCK_ASSESSMENT_TABS, MockAssessmentTab } from './views/mockAssessmentSummary/mock-assessment-tabs.const';
import { TrainingComponent } from './views/training/training.component';
import { PocHowToComponent } from './views/pochowto/pochowto.component';
import { TrainingsComponent } from './views/trainings/trainings.component';
import { SprintRetrosComponent } from './views/sprint-retros/sprint-retros.component';

export interface StubView {
  heading: string;
  subtitle: string;
  icon: string;
  label: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    FormsModule,
    DashboardComponent,
    OnboardingComponent,
    AttendanceComponent,
    PlannerComponent,
    MyCompetencyComponent,
    MockAssessmentComponent,
    TrainingComponent,
    PocHowToComponent,
    TrainingsComponent,
    SprintRetrosComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
  encapsulation: ViewEncapsulation.None
})
export class AppComponent {
  readonly mockTabs = MOCK_ASSESSMENT_TABS;
  activeView: 'dashboard' | 'onboarding' | 'attendance' | 'planner' | 'sprintretros' | 'training' | 'mycompetency' | 'trainings' | 'mockinterview' | 'reachout' | 'pochowto' | 'initiatives' | 'reports' | 'resourcetracking' | 'announcements' | 'settings' = 'dashboard';
  private readonly validViews = ['dashboard', 'onboarding', 'attendance', 'planner', 'sprintretros', 'training', 'mycompetency', 'trainings', 'mockinterview', 'reachout', 'pochowto', 'initiatives', 'reports', 'resourcetracking', 'announcements', 'settings'] as const;
  plannerMenuExpanded = false;
  activeMockTab: MockAssessmentTab = MOCK_ASSESSMENT_TABS.SUMMARY.id;
  feedbackFilterTerm = '';
  headCountFilterTerm = '';
  filterDropdownOpen = false;

  get showMockResourceFilter(): boolean {
    return this.activeView === 'mockinterview' &&
      this.activeMockTab !== MOCK_ASSESSMENT_TABS.SUMMARY.id &&
      this.resourcesBadgeCount > MOCK_ASSESSMENT_PAGE_SIZE;
  }

  get mockFilterTerm(): string {
    return this.activeMockTab === MOCK_ASSESSMENT_TABS.FEEDBACK.id ? this.feedbackFilterTerm : this.headCountFilterTerm;
  }

  set mockFilterTerm(term: string) {
    if (this.activeMockTab === MOCK_ASSESSMENT_TABS.FEEDBACK.id) this.feedbackFilterTerm = term;
    if (this.activeMockTab === MOCK_ASSESSMENT_TABS.HEAD_COUNT.id) this.headCountFilterTerm = term;
  }

  get mockFilterOptions() {
    const term = this.mockFilterTerm.trim().toLowerCase();
    return this.sharedData.onboardingResources.filter(resource =>
      (!this.sharedData.attendanceGroup || String(resource.groupNumber) === this.sharedData.attendanceGroup) &&
      (!term || resource.name?.toLowerCase().includes(term) || resource.eid?.toLowerCase().includes(term))
    ).slice(0, 8);
  }

  onGroupChange(group: string): void {
    this.sharedData.setAttendanceGroup(group);
    if (this.activeView === 'mockinterview') {
      this.feedbackFilterTerm = '';
      this.headCountFilterTerm = '';
      this.filterDropdownOpen = false;
    }
  }

  navGroups: NavGroup[] = [];
  loading = true;

  readonly stubViews: Record<string, StubView> = {
    reachout: { heading: 'Projects and Reachouts', subtitle: 'Connect and reach out to team members', icon: 'bi-send', label: 'Reachout' },
    initiatives: { heading: 'Initiatives', subtitle: 'Track team initiatives and improvement drives', icon: 'bi-kanban', label: 'Initiatives' },
    reports: { heading: 'Reports', subtitle: 'Generate and review POC reports', icon: 'bi-file-earmark-bar-graph', label: 'Reports' },
    resourcetracking: { heading: 'Resource tracking', subtitle: 'Monitor resource allocation and utilisation', icon: 'bi-people', label: 'Resource tracking' },
    announcements: { heading: 'Announcements', subtitle: 'Team announcements and updates', icon: 'bi-megaphone', label: 'Announcements' },
    settings: { heading: 'Settings', subtitle: 'Manage dashboard preferences', icon: 'bi-gear', label: 'Settings' },
  };

  mockSummary: MockAssessmentSummary = {
    title: 'MOCK ASSESSMENT SUMMARY',
    rows: [
      {
        stream: 'Step 1: Communication',
        totalResources: 17,
        scheduled: '-',
        totalConducted: 13,
        totalPassed: 13,
        totalFailed: '-',
        passRate: '100%',
        failRate: '0'
      },
      {
        stream: 'Step 2: Technical',
        totalResources: 17,
        scheduled: '-',
        totalConducted: 13,
        totalPassed: 13,
        totalFailed: '-',
        passRate: '100%',
        failRate: '0'
      },
      {
        stream: 'Step 3: Client Interviews',
        totalResources: 17,
        scheduled: '-',
        totalConducted: 13,
        totalPassed: 13,
        totalFailed: '-',
        passRate: '100%',
        failRate: '0'
      }
    ],
    highlights: ['4 newly onboarded resources in sprint 11'],
    tabMenusItems: [
      {
        title: MOCK_ASSESSMENT_TABS.SUMMARY.title,
        targetId: MOCK_ASSESSMENT_TABS.SUMMARY.targetId
      },
      {
        title: MOCK_ASSESSMENT_TABS.FEEDBACK.title,
        targetId: MOCK_ASSESSMENT_TABS.FEEDBACK.targetId
      },
      {
        title: MOCK_ASSESSMENT_TABS.HEAD_COUNT.title,
        targetId: MOCK_ASSESSMENT_TABS.HEAD_COUNT.targetId
      }

    ]
  };
  constructor(private http: HttpClient, public sharedData: SharedDataService) {
    const saved = localStorage.getItem('active-view') as typeof this.activeView;
    if (this.validViews.includes(saved)) this.activeView = saved;
    this.plannerMenuExpanded = false;

    this.loadDashboard();
    this.sharedData.loadOnboardingResources();
    this.sharedData.loadOfficeLocations();
  }

  get resourcesBadgeCount(): number {
    const group = this.sharedData.attendanceGroup;
    return group
      ? this.sharedData.onboardingResources.filter(r => String(r.groupNumber) === String(group)).length
      : this.sharedData.onboardingResources.length;
  }

  get stubView(): StubView | null {
    return this.stubViews[this.activeView] ?? null;
  }

  selectNav(item: NavItem): void {
    const viewMap: Record<string, typeof this.activeView> = {
      'Resources': 'onboarding',
      'Attendance Tracker': 'attendance',
      'Planner': 'planner',
      'Group Trainings': 'training',
      'myCompetency': 'mycompetency',
      'Bench Trainings': 'trainings',
      'Mock Interview': 'mockinterview',
      'Project Reachouts': 'reachout',
      'POC how-to': 'pochowto',
      'Initiatives': 'initiatives',
      'Reports': 'reports',
      'Resource tracking': 'resourcetracking',
      'Announcements': 'announcements',
      'Settings': 'settings',
    };
    const nextView = viewMap[item.label] ?? 'dashboard';
    if (nextView === 'mockinterview' && this.activeView !== 'mockinterview') {
      this.activeMockTab = MOCK_ASSESSMENT_TABS.SUMMARY.id;
      this.filterDropdownOpen = false;
    }
    this.activeView = nextView;
    if (item.label === 'Planner') {
      this.plannerMenuExpanded = !this.plannerMenuExpanded;
    }
    localStorage.setItem('active-view', this.activeView);
  }

  selectPlannerGroup(): void {
    this.activeView = 'planner';
    this.plannerMenuExpanded = true;
    localStorage.setItem('active-view', this.activeView);
  }

  selectSprintRetros(): void {
    this.activeView = 'sprintretros';
    this.plannerMenuExpanded = true;
    localStorage.setItem('active-view', this.activeView);
  }

  isNavActive(item: NavItem): boolean {
    const viewMap: Record<string, typeof this.activeView> = {
      'Dashboard': 'dashboard',
      'Resources': 'onboarding',
      'Attendance Tracker': 'attendance',
      'Planner': 'planner',
      'Group Trainings': 'training',
      'myCompetency': 'mycompetency',
      'Bench Trainings': 'trainings',
      'Mock Interview': 'mockinterview',
      'Project Reachouts': 'reachout',
      'POC how-to': 'pochowto',
      'Initiatives': 'initiatives',
      'Reports': 'reports',
      'Resource tracking': 'resourcetracking',
      'Announcements': 'announcements',
      'Settings': 'settings',
    };
    return this.activeView === (viewMap[item.label] ?? '');
  }

  private loadDashboard(): void {
    this.loading = true;
    this.http.get<DashboardData>(this.sharedData.apiUrl('/api/dashboard')).subscribe({
      next: (data) => {
        this.navGroups = data.navGroups.map(group => ({
          ...group,
          items: group.items.map(item =>
            (item.label === 'Onboarding' || item.label === 'Resources')
              ? { ...item, label: 'Resources', badge: null }
              : item
          )
        }));
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }
}
