import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { SlicePipe } from '@angular/common';
import { SharedDataService } from '../../services/shared-data.service';
import { OnboardingResource, OnboardingForm } from '../../models/types';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [FormsModule, SlicePipe],
  templateUrl: './onboarding.component.html',
  styleUrl: './onboarding.component.css'
})
export class OnboardingComponent implements OnInit {
  onboardingLoading = false;
  onboardingSaving = false;
  onboardingError = '';
  onboardingSuccess = '';
  editingOnboardingId: number | null = null;
  onboardingSearchQuery = '';
  onboardingPage = 1;
  readonly onboardingPageSize = 10;
  sortColumn = 'name';
  sortDirection: 'asc' | 'desc' = 'asc';
  skillOptions: string[] = [];
  anotherSkillInput = '';
  skillPendingRemoval = '';
  onboardingForm: OnboardingForm = this.emptyOnboardingForm();

  deleteOnboardingDialog: {
    open: boolean;
    resource: OnboardingResource | null;
    typeInput: string;
  } = { open: false, resource: null, typeInput: '' };

  constructor(private http: HttpClient, public sharedData: SharedDataService) {}

  ngOnInit(): void {
    if (this.sharedData.onboardingResources.length > 0) {
      this.buildSkillOptions(true);
    } else {
      this.onboardingLoading = true;
      this.sharedData.loadOnboardingResources(() => {
        this.buildSkillOptions(true);
        this.onboardingLoading = false;
      });
    }
  }

  refreshResources(): void {
    this.onboardingLoading = true;
    this.onboardingError = '';
    this.sharedData.loadOnboardingResources(() => {
      this.buildSkillOptions(true);
      this.onboardingLoading = false;
    });
  }

  saveOnboardingResource(): void {
    this.onboardingError = '';
    this.onboardingSuccess = '';
    this.applyProjectDeployedRule();

    const eid = this.normalizeEid(this.onboardingForm.eid);

    const payload: OnboardingForm = {
      name: this.onboardingForm.name.trim(),
      eid,
      hireDate: this.normalizeDateToUs(this.onboardingForm.hireDate),
      rollInDate: this.normalizeDateToUs(this.onboardingForm.rollInDate),
      projectDeployed: this.onboardingForm.projectDeployed,
      deploymentDate: this.normalizeDateToUs(this.onboardingForm.deploymentDate),
      projectName: this.onboardingForm.projectName.trim(),
      poc: this.onboardingForm.poc.trim(),
      dn: this.onboardingForm.dn,
      rollOffDate: this.normalizeDateToUs(this.onboardingForm.rollOffDate),
      fromProject: this.onboardingForm.fromProject.trim(),
      clLevel: this.onboardingForm.clLevel,
      groupNumber: this.onboardingForm.groupNumber,
      primarySkill: this.onboardingForm.primarySkill.trim(),
      primaryYears: this.onboardingForm.primaryYears.trim(),
      secondarySkill: this.onboardingForm.secondarySkill.trim(),
      secondaryYears: this.onboardingForm.secondaryYears.trim(),
      anotherSkills: this.pendingAnotherSkills(),
      officeLocation: this.onboardingForm.officeLocation
    };

    const isNew = !this.editingOnboardingId;

    if (!payload.name || !payload.eid) {
      this.onboardingError = 'Name and EID are required.';
      return;
    }

    if (isNew && (!payload.hireDate || !payload.rollInDate)) {
      this.onboardingError = 'Hire date and Roll-in date are required for new records.';
      return;
    }

    if (!/^[a-z0-9._-]+$/i.test(payload.eid)) {
      this.onboardingError = 'EID contains invalid characters.';
      return;
    }

    if (payload.hireDate && !this.isUsDate(payload.hireDate)) {
      this.onboardingError = 'Use MM/DD/YYYY for Hire date.';
      return;
    }

    if (payload.rollInDate && !this.isUsDate(payload.rollInDate)) {
      this.onboardingError = 'Use MM/DD/YYYY for Roll-in date.';
      return;
    }

    if ((payload.deploymentDate && !this.isUsDate(payload.deploymentDate)) || (payload.rollOffDate && !this.isUsDate(payload.rollOffDate))) {
      this.onboardingError = 'Use MM/DD/YYYY for optional dates.';
      return;
    }

    this.onboardingSaving = true;
    const request = this.editingOnboardingId
      ? this.http.patch<OnboardingResource>(this.sharedData.apiUrl(`/api/onboarding-resources/${this.editingOnboardingId}`), payload)
      : this.http.post<OnboardingResource>(this.sharedData.apiUrl('/api/onboarding-resources'), payload);

    request.subscribe({
      next: (resource) => {
        if (this.editingOnboardingId) {
          if (resource.id === this.editingOnboardingId) {
            this.sharedData.onboardingResources = this.sharedData.onboardingResources.map((item) => item.id === resource.id ? resource : item);
          } else {
            this.sharedData.onboardingResources = [resource, ...this.sharedData.onboardingResources];
          }
          this.onboardingSuccess = 'Resource updated.';
        } else {
          this.sharedData.onboardingResources = [resource, ...this.sharedData.onboardingResources];
          this.onboardingSuccess = 'Resource saved.';
          this.resetOnboardingForm();
        }

        this.buildSkillOptions(true);
        this.onboardingSaving = false;
      },
      error: (error) => {
        this.onboardingError = error.status === 409 ? 'EID already exists.' : 'Unable to save resource.';
        this.onboardingSaving = false;
      }
    });
  }

  editOnboardingResource(resource: OnboardingResource): void {
    this.editingOnboardingId = resource.id;
    this.onboardingError = '';
    this.onboardingSuccess = '';
    this.onboardingForm = {
      name: resource.name,
      eid: resource.eid,
      hireDate: this.formatUsDate(resource.hireDate),
      rollInDate: this.formatUsDate(resource.rollInDate),
      projectDeployed: resource.projectDeployed || 'No',
      deploymentDate: this.formatUsDate(resource.deploymentDate),
      projectName: resource.projectName || '',
      poc: resource.poc || '',
      dn: resource.dn || 'No',
      rollOffDate: this.formatUsDate(resource.rollOffDate),
      fromProject: resource.fromProject || '',
      clLevel: resource.clLevel || '',
      groupNumber: resource.groupNumber ? String(resource.groupNumber) : '',
      primarySkill: resource.primarySkill || '',
      primaryYears: resource.primaryYears || '',
      secondarySkill: resource.secondarySkill || '',
      secondaryYears: resource.secondaryYears || '',
      anotherSkills: [...(resource.anotherSkills || [])],
      officeLocation: resource.officeLocation || ''
    };
  }

  cancelOnboardingEdit(): void {
    this.resetOnboardingForm();
    this.onboardingError = '';
    this.onboardingSuccess = '';
  }

  sortBy(column: string): void {
    this.onboardingPage = 1;
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }
  }

  onProjectDeployedChange(): void {
    this.applyProjectDeployedRule();
  }

  openDatePicker(inputId: string, currentValue: string): void {
    const input = document.getElementById(inputId) as HTMLInputElement | null;
    if (!input) return;
    input.value = this.toDateInputValue(currentValue);
    const picker = input as HTMLInputElement & { showPicker?: () => void };
    if (typeof picker.showPicker === 'function') {
      picker.showPicker();
      return;
    }
    picker.click();
  }

  setDateFromPicker(field: 'hireDate' | 'rollInDate' | 'deploymentDate' | 'rollOffDate', event: Event): void {
    const input = event.target as HTMLInputElement;
    this.onboardingForm[field] = this.formatUsDate(input.value);
  }

  addAnotherSkill(): void {
    const skill = this.anotherSkillInput.trim();
    if (!skill || this.onboardingForm.anotherSkills.includes(skill)) {
      this.anotherSkillInput = '';
      return;
    }
    this.onboardingForm.anotherSkills = [...this.onboardingForm.anotherSkills, skill];
    this.anotherSkillInput = '';
  }

  requestAnotherSkillRemoval(skill: string): void {
    this.skillPendingRemoval = skill;
  }

  confirmAnotherSkillRemoval(): void {
    if (!this.skillPendingRemoval) return;
    this.removeAnotherSkill(this.skillPendingRemoval);
    this.skillPendingRemoval = '';
  }

  cancelAnotherSkillRemoval(): void {
    this.skillPendingRemoval = '';
  }

  private removeAnotherSkill(skill: string): void {
    this.onboardingForm.anotherSkills = this.onboardingForm.anotherSkills.filter((item) => item !== skill);
  }

  formatUsDate(value: string): string {
    if (!value) return '';
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return value;
    const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) return `${isoMatch[2]}/${isoMatch[3]}/${isoMatch[1]}`;
    return value;
  }

  get filteredOnboardingResources(): OnboardingResource[] {
    const query = this.onboardingSearchQuery.trim().toLowerCase();

    const byGroup = this.sharedData.attendanceGroup
      ? this.sharedData.onboardingResources.filter(r => String(r.groupNumber) === String(this.sharedData.attendanceGroup))
      : [...this.sharedData.onboardingResources];

    let results = query
      ? byGroup.filter((resource) => {
          const fields = [
            resource.name,
            resource.eid,
            resource.projectName,
            resource.fromProject,
            resource.poc,
            resource.clLevel,
            resource.groupNumber != null ? `group ${resource.groupNumber}` : '',
            resource.primarySkill,
            resource.secondarySkill,
            ...(resource.anotherSkills || [])
          ];
          return fields.some((value) => String(value || '').toLowerCase().includes(query));
        })
      : byGroup;

    if (this.sortColumn) {
      const col = this.sortColumn as keyof OnboardingResource;
      const dir = this.sortDirection === 'asc' ? 1 : -1;
      results = results.sort((a, b) => {
        if (col === 'hireDate' || col === 'rollInDate') {
          return dir * this.sortableDate(String(a[col] ?? '')).localeCompare(this.sortableDate(String(b[col] ?? '')));
        }
        if (col === 'groupNumber') {
          return dir * ((Number(a[col]) || 0) - (Number(b[col]) || 0));
        }
        return dir * String(a[col] ?? '').localeCompare(String(b[col] ?? ''));
      });
    }

    return results;
  }

  get pagedOnboardingResources(): OnboardingResource[] {
    const start = (this.onboardingPage - 1) * this.onboardingPageSize;
    return this.filteredOnboardingResources.slice(start, start + this.onboardingPageSize);
  }

  get onboardingTotalPages(): number {
    return Math.max(1, Math.ceil(this.filteredOnboardingResources.length / this.onboardingPageSize));
  }

  get onboardingPageNumbers(): (number | '...')[] {
    const total = this.onboardingTotalPages;
    const cur = this.onboardingPage;
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages: (number | '...')[] = [1];
    if (cur > 3) pages.push('...');
    for (let i = Math.max(2, cur - 1); i <= Math.min(total - 1, cur + 1); i++) pages.push(i);
    if (cur < total - 2) pages.push('...');
    pages.push(total);
    return pages;
  }

  get onboardingPageEnd(): number {
    return Math.min(this.onboardingPage * this.onboardingPageSize, this.filteredOnboardingResources.length);
  }

  goToOnboardingPage(page: number | '...'): void {
    if (page === '...') return;
    this.onboardingPage = Math.max(1, Math.min(page, this.onboardingTotalPages));
  }

  openDeleteOnboardingDialog(resource: OnboardingResource): void {
    this.deleteOnboardingDialog = { open: true, resource, typeInput: '' };
  }

  closeDeleteOnboardingDialog(): void {
    this.deleteOnboardingDialog = { open: false, resource: null, typeInput: '' };
  }

  confirmDeleteOnboarding(): void {
    const { resource } = this.deleteOnboardingDialog;
    if (!resource || this.deleteOnboardingDialog.typeInput !== 'DELETE') return;
    this.http.delete(this.sharedData.apiUrl(`/api/onboarding-resources/${resource.id}`)).subscribe({
      next: () => {
        this.sharedData.onboardingResources = this.sharedData.onboardingResources.filter(r => r.id !== resource.id);
        this.closeDeleteOnboardingDialog();
      },
      error: () => {
        this.closeDeleteOnboardingDialog();
      }
    });
  }

  private buildSkillOptions(force = false): void {
    if (this.skillOptions.length && !force) return;
    const skills = new Set<string>();
    for (const r of this.sharedData.onboardingResources) {
      if (r.primarySkill) skills.add(r.primarySkill);
      if (r.secondarySkill) skills.add(r.secondarySkill);
      for (const s of (r.anotherSkills || [])) {
        if (s) skills.add(s);
      }
    }
    this.skillOptions = [...skills].sort((a, b) => a.localeCompare(b));
  }

  private normalizeEid(value: string): string {
    return value.trim().split('@')[0].toLowerCase();
  }

  private resetOnboardingForm(): void {
    this.editingOnboardingId = null;
    this.onboardingForm = this.emptyOnboardingForm();
    this.anotherSkillInput = '';
    this.skillPendingRemoval = '';
  }

  private applyProjectDeployedRule(): void {
    if (this.onboardingForm.projectDeployed === 'No') {
      this.onboardingForm.projectName = 'Song Bench';
    }
    if (this.onboardingForm.projectName === 'Song Bench' && !this.onboardingForm.poc.trim()) {
      this.onboardingForm.poc = 'hannahdel.l.orellosa';
    }
  }

  private pendingAnotherSkills(): string[] {
    const skills = [...this.onboardingForm.anotherSkills];
    const pendingSkill = this.anotherSkillInput.trim();
    if (pendingSkill && !skills.includes(pendingSkill)) {
      skills.push(pendingSkill);
    }
    return skills;
  }

  private emptyOnboardingForm(): OnboardingForm {
    return {
      name: '',
      eid: '',
      hireDate: '',
      rollInDate: '',
      projectDeployed: 'No',
      deploymentDate: '',
      projectName: 'Song Bench',
      poc: '',
      dn: 'No',
      rollOffDate: '',
      fromProject: '',
      clLevel: '',
      groupNumber: '',
      primarySkill: '',
      primaryYears: '',
      secondarySkill: '',
      secondaryYears: '',
      anotherSkills: [],
      officeLocation: ''
    };
  }

  private normalizeDateToUs(value: string): string {
    const raw = value.trim();
    const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashMatch) {
      let first = Number(slashMatch[1]);
      let second = Number(slashMatch[2]);
      const year = Number(slashMatch[3]);
      if (first > 12 && second <= 12) {
        [first, second] = [second, first];
      }
      return `${String(first).padStart(2, '0')}/${String(second).padStart(2, '0')}/${year}`;
    }
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) return `${match[2]}/${match[3]}/${match[1]}`;
    return raw;
  }

  private toDateInputValue(value: string): string {
    const usMatch = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (usMatch) return `${usMatch[3]}-${usMatch[1]}-${usMatch[2]}`;
    return value;
  }

  private isUsDate(value: string): boolean {
    const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return false;
    const month = Number(match[1]);
    const day = Number(match[2]);
    const year = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900) return false;
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  }

  private sortableDate(value: string): string {
    const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? `${m[3]}${m[1]}${m[2]}` : value;
  }
}
