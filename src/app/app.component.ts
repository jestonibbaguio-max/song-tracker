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
import { TrainingComponent } from './views/training/training.component';
import { PocHowToComponent } from './views/pochowto/pochowto.component';
import { TrainingsComponent } from './views/trainings/trainings.component';

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
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
  encapsulation: ViewEncapsulation.None
})
export class AppComponent {
  activeView: 'dashboard' | 'onboarding' | 'attendance' | 'planner' | 'training' | 'mycompetency' | 'trainings' | 'mockinterview' | 'reachout' | 'pochowto' = 'dashboard';
  private readonly validViews = ['dashboard', 'onboarding', 'attendance', 'planner', 'training', 'mycompetency', 'trainings', 'mockinterview', 'reachout', 'pochowto'] as const;

  navGroups: NavGroup[] = [];
  loading = true;

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
    highlights: ['4 newly onboarded resources in sprint 11']
  };
  constructor(private http: HttpClient, public sharedData: SharedDataService) {
    const saved = localStorage.getItem('active-view') as typeof this.activeView;
    if (this.validViews.includes(saved)) this.activeView = saved;

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

  selectNav(item: NavItem): void {
    const viewMap: Record<string, typeof this.activeView> = {
      'Resources': 'onboarding',
      'Attendance Tracker': 'attendance',
      'Planner': 'planner',
      'Training': 'training',
      'myCompetency': 'mycompetency',
      'Trainings': 'trainings',
      'Mock Interview': 'mockinterview',
      'Projects and Reachouts': 'reachout',
      'POC how-to': 'pochowto',
    };
    this.activeView = viewMap[item.label] ?? 'dashboard';
    localStorage.setItem('active-view', this.activeView);
  }

  isNavActive(item: NavItem): boolean {
    const viewMap: Record<string, typeof this.activeView> = {
      'Dashboard': 'dashboard',
      'Resources': 'onboarding',
      'Attendance Tracker': 'attendance',
      'Planner': 'planner',
      'Training': 'training',
      'myCompetency': 'mycompetency',
      'Trainings': 'trainings',
      'Mock Interview': 'mockinterview',
      'Projects and Reachouts': 'reachout',
      'POC how-to': 'pochowto',
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
