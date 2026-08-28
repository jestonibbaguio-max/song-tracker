import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { NgClass } from '@angular/common';
import { SharedDataService } from '../../services/shared-data.service';
import { AttendanceEntry, OnboardingResource } from '../../models/types';

@Component({
  selector: 'app-attendance',
  standalone: true,
  imports: [FormsModule, NgClass],
  templateUrl: './attendance.component.html',
  styleUrl: './attendance.component.css'
})
export class AttendanceComponent implements OnInit {
  attendanceMonthStr = localStorage.getItem('attendance-month') ?? '2026-07';
  attendanceOptions: string[] = [];
  attendanceEntries: Record<string, Record<number, AttendanceEntry>> = {};
  rtoModal = { open: false, eid: '', day: 0, year: 0, month: 0 };
  rtoLocationInput = '';
  rtoSummaryDay: number = this.initRtoSummaryDay();

  private readonly ALL_ATT_STATUSES = ['Present', 'RTO', 'Absent', 'SL', 'VL', 'PL', 'ML', 'EH', 'BL', 'Deployed', 'NITC', 'Transferred'];

  constructor(private http: HttpClient, public sharedData: SharedDataService) {}

  ngOnInit(): void {
    this.loadAttendance();
  }

  loadAttendance(): void {
    if (this.attendanceOptions.length === 0) {
      this.http.get<{ id: number; label: string }[]>(this.sharedData.apiUrl('/api/attendance-options')).subscribe({
        next: opts => { this.attendanceOptions = opts.map(o => o.label); }
      });
    }
    this.sharedData.loadOfficeLocations();
    this.loadAttendanceMonth();
  }

  loadAttendanceMonth(): void {
    this.attendanceEntries = {};
    const [year, month] = this.attendanceMonthStr.split('-').map(Number);
    const today = new Date();
    this.rtoSummaryDay = (today.getFullYear() === year && today.getMonth() + 1 === month)
      ? today.getDate() : 1;
    this.http.get<AttendanceEntry[]>(this.sharedData.apiUrl('/api/attendance')).subscribe({
      next: all => {
        this.attendanceEntries = {};
        for (const e of all.filter(r => r.year === year && r.month === month)) {
          if (!this.attendanceEntries[e.eid]) this.attendanceEntries[e.eid] = {};
          this.attendanceEntries[e.eid][e.day] = e;
        }
      }
    });
  }

  attendanceDays(): number[] {
    const [year, month] = this.attendanceMonthStr.split('-').map(Number);
    const count = new Date(year, month, 0).getDate();
    return Array.from({ length: count }, (_, i) => i + 1);
  }

  isWeekend(day: number): boolean {
    const [year, month] = this.attendanceMonthStr.split('-').map(Number);
    const dow = new Date(year, month - 1, day).getDay();
    return dow === 0 || dow === 6;
  }

  dayLabel(day: number): string {
    const [year, month] = this.attendanceMonthStr.split('-').map(Number);
    return ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][new Date(year, month - 1, day).getDay()];
  }

  get uniqueGroups(): string[] {
    const groups = this.sharedData.onboardingResources
      .map(r => String(r.groupNumber ?? ''))
      .filter(g => g !== '' && g !== 'null');
    return [...new Set(groups)].sort((a, b) => Number(a) - Number(b));
  }

  get filteredAttendanceResources(): OnboardingResource[] {
    if (!this.sharedData.attendanceGroup) return this.sharedData.onboardingResources;
    return this.sharedData.onboardingResources.filter(r => Number(r.groupNumber) === Number(this.sharedData.attendanceGroup));
  }

  getAttendanceStatus(eid: string, day: number): string {
    return this.attendanceEntries[eid]?.[day]?.status ?? '';
  }

  getAttendanceCellClass(eid: string, day: number): string {
    const map: Record<string, string> = {
      'Present':     'att-c-present',
      'Absent':      'att-c-absent',
      'VL':          'att-c-vl',
      'SL':          'att-c-sl',
      'EL':          'att-c-el',
      'EH':          'att-c-el',
      'Deployed':    'att-c-deployed',
      'RTO':         'att-c-rto',
      'PL':          'att-c-pl',
      'ML':          'att-c-ml',
      'BL':          'att-c-bl',
      'NITC':        'att-c-nitc',
      'Transferred': 'att-c-transferred',
    };
    return map[this.getAttendanceStatus(eid, day)] ?? '';
  }

  onAttendanceCellChange(eid: string, day: number, status: string): void {
    const [year, month] = this.attendanceMonthStr.split('-').map(Number);
    if (status === 'RTO') {
      this.rtoLocationInput = this.attendanceEntries[eid]?.[day]?.location ?? '';
      this.rtoModal = { open: true, eid, day, year, month };
      return;
    }
    this.persistAttendanceEntry(eid, day, year, month, status);
  }

  confirmRtoLocation(): void {
    const { eid, day, year, month } = this.rtoModal;
    this.rtoModal = { ...this.rtoModal, open: false };
    this.persistAttendanceEntry(eid, day, year, month, 'RTO', this.rtoLocationInput);
  }

  cancelRtoModal(): void {
    this.rtoModal = { ...this.rtoModal, open: false };
    this.attendanceEntries = { ...this.attendanceEntries };
  }

  getActiveStatuses(): string[] {
    const found = new Set<string>();
    this.filteredAttendanceResources.forEach(r => {
      this.attendanceDays().forEach(day => {
        const s = this.attendanceEntries[r.eid]?.[day]?.status;
        if (s) found.add(s);
      });
    });
    return this.ALL_ATT_STATUSES.filter(s => found.has(s));
  }

  getStatusCountForDay(day: number, status: string): number {
    if (this.isWeekend(day)) return 0;
    return this.filteredAttendanceResources.filter(r =>
      this.attendanceEntries[r.eid]?.[day]?.status === status
    ).length;
  }

  getTotalPresentForDay(day: number): number {
    return this.getStatusCountForDay(day, 'Present') + this.getStatusCountForDay(day, 'RTO');
  }

  rtoSummaryDayLabel(day: number): string {
    const [year, month] = this.attendanceMonthStr.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  getRtoLocationSummary(): { location: string; count: number }[] {
    const counts: Record<string, number> = {};
    this.filteredAttendanceResources.forEach(r => {
      this.attendanceDays().forEach(day => {
        const entry = this.attendanceEntries[r.eid]?.[day];
        if (entry?.status === 'RTO' && entry.location) {
          counts[entry.location] = (counts[entry.location] || 0) + 1;
        }
      });
    });
    return Object.entries(counts)
      .map(([location, count]) => ({ location, count }))
      .sort((a, b) => b.count - a.count);
  }

  getRtoLocationSummaryForDay(day: number): { location: string; count: number }[] {
    const counts: Record<string, number> = {};
    this.filteredAttendanceResources.forEach(r => {
      const entry = this.attendanceEntries[r.eid]?.[day];
      if (entry?.status === 'RTO' && entry.location) {
        counts[entry.location] = (counts[entry.location] || 0) + 1;
      }
    });
    return Object.entries(counts)
      .map(([location, count]) => ({ location, count }))
      .sort((a, b) => b.count - a.count);
  }

  getAttendanceCellTitle(eid: string, day: number): string {
    const entry = this.attendanceEntries[eid]?.[day];
    if (entry?.status === 'RTO' && entry.location) return `Office: ${entry.location}`;
    return '';
  }

  saveAttendanceMonth(month: string): void {
    localStorage.setItem('attendance-month', month);
  }

  attendanceMonthLabel(): string {
    const [year, month] = this.attendanceMonthStr.split('-').map(Number);
    return new Date(year, month - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
  }

  private persistAttendanceEntry(eid: string, day: number, year: number, month: number, status: string, location = ''): void {
    const existing = this.attendanceEntries[eid]?.[day];
    if (!this.attendanceEntries[eid]) this.attendanceEntries[eid] = {};

    if (!status) {
      if (existing?.id) {
        this.http.delete(this.sharedData.apiUrl(`/api/attendance/${existing.id}`)).subscribe();
        delete this.attendanceEntries[eid][day];
      }
      return;
    }

    const payload: Partial<AttendanceEntry> = { status };
    if (status === 'RTO') payload.location = location || undefined;

    if (existing?.id) {
      this.attendanceEntries[eid][day] = { ...existing, status, location: status === 'RTO' ? location : undefined };
      this.http.patch<AttendanceEntry>(this.sharedData.apiUrl(`/api/attendance/${existing.id}`), payload).subscribe({
        next: saved => { this.attendanceEntries[eid][day] = saved; }
      });
    } else {
      const newEntry: AttendanceEntry = { eid, year, month, day, status, ...(status === 'RTO' && location ? { location } : {}) };
      this.http.post<AttendanceEntry>(this.sharedData.apiUrl('/api/attendance'), newEntry).subscribe({
        next: saved => {
          if (!this.attendanceEntries[eid]) this.attendanceEntries[eid] = {};
          this.attendanceEntries[eid][day] = saved;
        }
      });
    }
  }

  private initRtoSummaryDay(): number {
    const today = new Date();
    const [y, m] = this.attendanceMonthStr.split('-').map(Number);
    if (today.getFullYear() === y && today.getMonth() + 1 === m) return today.getDate();
    return 1;
  }
}
