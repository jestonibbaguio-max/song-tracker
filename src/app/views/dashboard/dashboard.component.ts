import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  DashboardData,
  DashboardStat,
  ChecklistItem,
  Initiative,
  Announcement,
  PocPerson,
  QuickTool,
} from '../../models/types';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit {
  notice: DashboardData['notice'] = { title: '', detail: '', badge: '' };
  header: DashboardData['header'] = { welcomeName: '', detail: '' };
  checklistProgress: DashboardData['checklistProgress'] = { completed: 0, total: 0, percent: 0 };
  stats: DashboardStat[] = [];
  checklist: ChecklistItem[] = [];
  initiatives: Initiative[] = [];
  announcements: Announcement[] = [];
  poc: PocPerson[] = [];
  quickTools: QuickTool[] = [];
  loading = true;
  loadError = '';

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadDashboard();
  }

  private loadDashboard(): void {
    this.http.get<DashboardData>(this.apiUrl('/api/dashboard')).subscribe({
      next: (data) => {
        this.notice = data.notice;
        this.header = data.header;
        this.checklistProgress = data.checklistProgress;
        this.stats = data.stats;
        this.checklist = data.checklist;
        this.initiatives = data.initiatives;
        this.announcements = data.announcements;
        this.poc = data.poc;
        this.quickTools = data.quickTools;
        this.loading = false;
      },
      error: () => {
        this.loadError = 'Dashboard data is unavailable.';
        this.loading = false;
      }
    });
  }

  private apiUrl(path: string): string {
    const port = window.location.port;
    if (port === '4200' || port === '4201') return `http://127.0.0.1:3000${path}`;
    return path;
  }
}
