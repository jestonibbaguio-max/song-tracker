import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { OnboardingResource } from '../models/types';

@Injectable({ providedIn: 'root' })
export class SharedDataService {
  readonly groupOptions = [
    { value: '1', label: 'Group 1 - React' },
    { value: '2', label: 'Group 2 - SFCC, Hybris, Magento, OpenText, UI/UX' },
    { value: '3', label: 'Group 3 - UI/UX' },
    { value: '4', label: 'Group 4 - Mobile Technologies' },
    { value: '5', label: 'Group 5 - AEM/Angular' },
  ];

  onboardingResources: OnboardingResource[] = [];
  attendanceGroup = localStorage.getItem('attendance-group') ?? '';
  officeLocations: string[] = [];

  constructor(private http: HttpClient) {}

  apiUrl(path: string): string {
    const port = window.location.port;
    if (port === '4200' || port === '4201') return `http://127.0.0.1:3000${path}`;
    return path;
  }

  loadOnboardingResources(onDone?: () => void): void {
    this.http.get<OnboardingResource[]>(this.apiUrl('/api/onboarding-resources')).subscribe({
      next: resources => { this.onboardingResources = resources; onDone?.(); },
    });
  }

  loadOfficeLocations(): void {
    if (this.officeLocations.length > 0) return;
    this.http.get<{ id: number; name: string }[]>(this.apiUrl('/api/office-locations')).subscribe({
      next: locs => { this.officeLocations = locs.map(l => l.name); }
    });
  }

  setAttendanceGroup(group: string): void {
    this.attendanceGroup = group;
    localStorage.setItem('attendance-group', group);
  }

  getGroupLabel(value: string): string {
    return this.groupOptions.find(g => g.value === value)?.label ?? (value ? `Group ${value}` : 'All Groups');
  }
}
