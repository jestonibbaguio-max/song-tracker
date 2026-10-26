import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { QuillModule } from 'ngx-quill';
import { SharedDataService } from '../../services/shared-data.service';
import { OnboardingResource } from '../../models/types';
import { MOCK_ASSESSMENT_PAGE_SIZE, MOCK_ASSESSMENT_TABS, MockAssessmentTab } from './mock-assessment-tabs.const';

export interface MockAssessmentRow {
  stream: string;
  totalResources: number;
  scheduled: string | number;
  totalConducted: number;
  totalPassed: number;
  totalFailed: string | number;
  passRate: string;  // e.g., "85%" or "85.5%"
  failRate: string | number;  // e.g., "15%" or "14.5%"
}

export interface MockAssessmentSummary {
  id?: number;
  title: string;
  rows: MockAssessmentRow[];
  highlights: string[];
  tabMenusItems: MockAssessmentSummaryTabItem[];
}

export interface MockAssessmentSummaryTabItem {
  title: string;
  description?: string;
  targetId: string;
}

const HEAD_COUNT_CHECKLIST_FIELDS = ['communication', 'technical', 'client'] as const;
type HeadCountChecklistField = typeof HEAD_COUNT_CHECKLIST_FIELDS[number];
type HeadCountStatusField = Exclude<HeadCountChecklistField, 'communication'>;
type HeadCountAssessmentStatus = 'not-taken' | 'pass' | 'fail';

export interface FeedbackSubmission {
  content: string;
  submittedAt: string;
}

@Component({
  selector: 'app-mock-assessment',
  standalone: true,
  imports: [CommonModule, FormsModule, QuillModule],
  templateUrl: './mock-assessment.component.html',
  styleUrls: ['./mock-assessment.component.css']
})
export class MockAssessmentComponent {
  readonly tabs = MOCK_ASSESSMENT_TABS;
  @Input() summary!: MockAssessmentSummary;
  @Input() group = '';
  @Input() filterTerm = '';
  @Input() activeTab: MockAssessmentTab = MOCK_ASSESSMENT_TABS.SUMMARY.id;
  @Input() showResourceFilter = false;
  @Input() filterOptions: OnboardingResource[] = [];
  @Input() filterDropdownOpen = false;
  @Output() activeTabChange = new EventEmitter<MockAssessmentTab>();
  @Output() filterTermChange = new EventEmitter<string>();
  @Output() filterDropdownOpenChange = new EventEmitter<boolean>();
  summaryTableTab!: MockAssessmentSummaryTabItem;
  feedbackTab!: MockAssessmentSummaryTabItem;
  headCountTab!: MockAssessmentSummaryTabItem;

  page: number = 1;
  pageSize: number = MOCK_ASSESSMENT_PAGE_SIZE;
  maxVisiblePages: number = 5;
  onBoardingResourcesPerPage: number = 10

  feedbackPage: number = 1;
  private expandedFeedbackKeys = new Set<string>();
  private initialSummary?: MockAssessmentSummary;

  selectTab(tab: MockAssessmentTab): void {
    this.activeTab = tab;
    this.activeTabChange.emit(tab);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['filterTerm'] || changes['activeTab'] || changes['group']) {
      this.page = 1;
      this.feedbackPage = 1;
    }
    if (changes['group'] && !changes['group'].firstChange && this.initialSummary) {
      this.closeModal();
      this.closeHighlightModal();
      this.loadSummary();
    }
  }

  editingIndex: number | null = null;
  editingRow: MockAssessmentRow | null = null;
  showEditModal = false;

  constructor(public sharedData: SharedDataService) {}

  onEdit(index: number): void {
    this.editingIndex = index;
    this.editingRow = structuredClone(this.summary.rows[index]);
    this.updateEditingRowTotals();
    this.showEditModal = true;
  }

  onDelete(index: number): void {
    if (confirm(`Are you sure you want to delete "${this.summary.rows[index].stream}"?`)) {
      this.summary.rows.splice(index, 1);
      this.saveMockAssessment();
    }
  }

  onUpdate(): void {
    if (this.editingIndex !== null && this.editingRow) {
      this.updateEditingRowTotals();
      this.summary.rows[this.editingIndex] = this.editingRow;
      this.closeModal();
      this.saveMockAssessment();
    }
  }

  closeModal(): void {
    this.showEditModal = false;
    this.editingIndex = null;
    this.editingRow = null;
  }

  onAddRow(): void {
    const newRow: MockAssessmentRow = {
      stream: 'New Step',
      totalResources: 0,
      scheduled: '-',
      totalConducted: 0,
      totalPassed: 0,
      totalFailed: 0,
      passRate: '0%',
      failRate: '0%'
    };
    this.summary.rows.push(newRow);
    this.editingIndex = this.summary.rows.length - 1;
    this.editingRow = JSON.parse(JSON.stringify(newRow));
    this.updateEditingRowTotals();
    this.showEditModal = true;
  }

  // Highlight methods
  editingHighlightIndex: number | null = null;
  editingHighlight: string | null = null;
  showHighlightModal = false;

  onEditHighlight(index: number): void {
    this.editingHighlightIndex = index;
    this.editingHighlight = this.summary.highlights[index];
    this.showHighlightModal = true;
  }

  onDeleteHighlight(index: number): void {
    if (confirm(`Are you sure you want to delete this highlight?`)) {
      this.summary.highlights.splice(index, 1);
      this.saveMockAssessment();
    }
  }

  onAddHighlight(): void {
    this.editingHighlightIndex = this.summary.highlights.length;
    this.editingHighlight = '';
    this.showHighlightModal = true;
  }

  onUpdateHighlight(): void {
    if (this.editingHighlight !== null && this.editingHighlightIndex !== null) {
      if (this.editingHighlightIndex === this.summary.highlights.length) {
        this.summary.highlights.push(this.editingHighlight);
      } else {
        this.summary.highlights[this.editingHighlightIndex] = this.editingHighlight;
      }
      this.closeHighlightModal();
      this.saveMockAssessment();
    }
  }

  closeHighlightModal(): void {
    this.showHighlightModal = false;
    this.editingHighlightIndex = null;
    this.editingHighlight = null;
  }

  ngOnInit(): void {
    this.initialSummary = structuredClone(this.summary);
    this.loadSummary();

    if (this.sharedData.onboardingResources.length === 0) {
      this.sharedData.loadOnboardingResources(() => this.syncSummaryTotals());
    } else {
      this.syncSummaryTotals();
    }

  }

  private get summaryStorageKey(): string {
    return this.group ? `mockAssessment.group.${this.group}` : 'mockAssessment';
  }

  private loadSummary(): void {
    const savedData = localStorage.getItem(this.summaryStorageKey);
    if (savedData) {
      this.summary = JSON.parse(savedData);
    } else {
      this.summary = structuredClone(this.initialSummary!);
      if (this.group) {
        this.summary.rows.forEach(row => {
          row.scheduled = '-';
          row.totalPassed = 0;
          row.totalFailed = '-';
          row.passRate = '0%';
          row.failRate = '0';
        });
        this.summary.highlights = [];
      }
    }
    this.syncSummaryTotals();
  }

  private syncSummaryTotals(): void {
    const totalResources = this.groupResources.length;
    this.summary.rows.forEach((row, index) => {
      row.totalResources = totalResources;
      this.updateRowTotals(row, index);
    });
    this.updateEditingRowTotals();
    this.saveMockAssessment();
  }

  syncSummaryTable(): void {
    this.syncSummaryTotals();
  }

  hasAutomaticResults(rowIndex: number | null): boolean {
    const field = rowIndex === null ? undefined : HEAD_COUNT_CHECKLIST_FIELDS[rowIndex];
    return field === 'technical' || field === 'client';
  }

  updateEditingRowTotals(): void {
    if (this.editingRow && this.editingIndex !== null) {
      this.updateRowTotals(this.editingRow, this.editingIndex);
    }
  }

  private updateRowTotals(row: MockAssessmentRow, rowIndex: number): void {
    row.totalConducted = this.getSummaryTotalConducted(rowIndex);
    const field = HEAD_COUNT_CHECKLIST_FIELDS[rowIndex];

    if (field === 'technical' || field === 'client') {
      const assessedResources = this.groupResources.filter(resource =>
        this.isHeadCountChecklistChecked(resource, field)
      );
      row.totalPassed = assessedResources.filter(resource =>
        this.getHeadCountAssessmentStatus(resource, field) === 'pass'
      ).length;
      row.totalFailed = assessedResources.filter(resource =>
        this.getHeadCountAssessmentStatus(resource, field) === 'fail'
      ).length;
    } else if (row.totalFailed === '-') {
      row.totalFailed = 0;
    }

    row.passRate = this.calculateRate(row.totalPassed, row.totalConducted);
    row.failRate = this.calculateRate(Number(row.totalFailed), row.totalConducted);
  }

  private calculateRate(count: number, totalConducted: number): string {
    return `${totalConducted > 0 ? Number((count / totalConducted * 100).toFixed(2)) : 0}%`;
  }

  get onBoardingResources(): OnboardingResource[] {
    const start = (this.page - 1) * this.pageSize;
    return this.filteredOnboardingResources.slice(start, start + this.pageSize);
  }

  get totalPages(): number {
    return Math.ceil(this.filteredOnboardingResources.length / this.pageSize);
  }

  get paginatedResources(){
    const startIndex = (this.page - 1) * this.pageSize;
    return this.onBoardingResources.slice(startIndex, startIndex + this.pageSize);
  }

  get visiblePages(): number[] {
    let start = Math.max(1, this.page - Math.floor(this.maxVisiblePages / 2));
    let end = Math.min(this.totalPages, start + this.maxVisiblePages - 1);

    start = Math.max(1, end - this.maxVisiblePages + 1);

    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }

  isHeadCountChecklistChecked(resource: OnboardingResource, field: HeadCountChecklistField): boolean {
    return localStorage.getItem(this.getHeadCountChecklistStorageKey(resource, field)) === 'true';
  }

  getHeadCountAssessmentStatus(resource: OnboardingResource, field: HeadCountStatusField): HeadCountAssessmentStatus {
    const status = localStorage.getItem(this.getHeadCountAssessmentStatusStorageKey(resource, field));
    return status === 'pass' || status === 'fail' ? status : 'not-taken';
  }

  cycleHeadCountAssessmentStatus(resource: OnboardingResource, field: HeadCountStatusField): void {
    if (!this.isHeadCountChecklistChecked(resource, field)) {
      this.setHeadCountChecklistChecked(resource, field, true);
      return;
    }

    const currentStatus = this.getHeadCountAssessmentStatus(resource, field);
    if (currentStatus === 'fail') {
      this.setHeadCountChecklistChecked(resource, field, false);
      return;
    }

    const nextStatus: HeadCountAssessmentStatus = currentStatus === 'not-taken' ? 'pass' : 'fail';
    localStorage.setItem(this.getHeadCountAssessmentStatusStorageKey(resource, field), nextStatus);
    this.syncSummaryTotals();
  }

  toggleCommunicationStatus(resource: OnboardingResource): void {
    const isChecked = this.isHeadCountChecklistChecked(resource, 'communication');
    this.setHeadCountChecklistChecked(resource, 'communication', !isChecked);
  }

  getHeadCountAssessmentStatusLabel(status: HeadCountAssessmentStatus): string {
    return status === 'not-taken' ? 'Conducted' : status === 'pass' ? 'Pass' : 'Fail';
  }

  getHeadCountAssessmentStatusDisplay(resource: OnboardingResource, field: HeadCountStatusField): string {
    return this.isHeadCountChecklistChecked(resource, field)
      ? this.getHeadCountAssessmentStatusLabel(this.getHeadCountAssessmentStatus(resource, field))
      : 'Pending';
  }

  getHeadCountChecklistTotal(field: HeadCountChecklistField): number {
    return this.groupResources.filter((resource) =>
      this.isHeadCountChecklistChecked(resource, field)
    ).length;
  }

  getSummaryTotalConducted(rowIndex: number): number {
    const field = HEAD_COUNT_CHECKLIST_FIELDS[rowIndex];

    return field ? this.getHeadCountChecklistTotal(field) : 0;
  }

  headCountFilter: HeadCountChecklistField | null = null;

  toggleHeadCountFilter(field: HeadCountChecklistField): void {
    this.headCountFilter = this.headCountFilter === field ? null : field;
    this.page = 1;
  }

  private get filteredOnboardingResources(): OnboardingResource[] {
    let resources = this.sortedOnboardingResources;

    if (this.headCountFilter) {
      resources = resources.filter((resource) =>
        this.isHeadCountChecklistChecked(resource, this.headCountFilter!)
      );
    }

    return this.filterByNameOrEid(resources, this.activeTab === MOCK_ASSESSMENT_TABS.HEAD_COUNT.id ? this.filterTerm : '');
  }

  onHeadCountChecklistChange(resource: OnboardingResource, field: HeadCountChecklistField, event: Event): void {
    const isChecked = (event.target as HTMLInputElement).checked;
    this.setHeadCountChecklistChecked(resource, field, isChecked);
  }

  private setHeadCountChecklistChecked(resource: OnboardingResource, field: HeadCountChecklistField, isChecked: boolean): void {
    const storageKey = this.getHeadCountChecklistStorageKey(resource, field);

    if (isChecked) {
      localStorage.setItem(storageKey, 'true');
    } else {
      localStorage.removeItem(storageKey);
    }

    if (field === 'technical' || field === 'client') {
      const statusKey = this.getHeadCountAssessmentStatusStorageKey(resource, field);
      if (isChecked) {
        localStorage.setItem(statusKey, 'not-taken');
      } else {
        localStorage.removeItem(statusKey);
      }
    }

    this.syncSummaryTotals();
  }

  private getHeadCountChecklistStorageKey(resource: OnboardingResource, field: HeadCountChecklistField): string {
    return `mockAssessment.headCount.${resource.eid || resource.id}.${field}.checked`;
  }

  private getHeadCountAssessmentStatusStorageKey(resource: OnboardingResource, field: HeadCountStatusField): string {
    return `mockAssessment.headCount.${resource.eid || resource.id}.${field}.status`;
  }

  get feedbackTotalPages(): number {
    return Math.ceil(this.feedbackFilteredResources.length / this.pageSize);
  }

  get feedbackResources(): OnboardingResource[] {
    const start = (this.feedbackPage - 1) * this.pageSize;
    return this.feedbackFilteredResources.slice(start, start + this.pageSize);
  }

  private get feedbackFilteredResources(): OnboardingResource[] {
    return this.filterByNameOrEid(this.sortedOnboardingResources, this.activeTab === MOCK_ASSESSMENT_TABS.FEEDBACK.id ? this.filterTerm : '');
  }

  private filterByNameOrEid(resources: OnboardingResource[], searchTerm: string): OnboardingResource[] {
    const term = searchTerm.trim().toLowerCase();

    if (!term) {
      return resources;
    }

    return resources.filter((resource) =>
      resource.name?.toLowerCase().includes(term) || resource.eid?.toLowerCase().includes(term)
    );
  }

  get feedbackVisiblePages(): number[] {
    let start = Math.max(1, this.feedbackPage - Math.floor(this.maxVisiblePages / 2));
    let end = Math.min(this.feedbackTotalPages, start + this.maxVisiblePages - 1);

    start = Math.max(1, end - this.maxVisiblePages + 1);

    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }

  isFeedbackExpanded(resource: OnboardingResource): boolean {
    return this.expandedFeedbackKeys.has(this.getResourceKey(resource));
  }

  toggleFeedback(resource: OnboardingResource): void {
    const key = this.getResourceKey(resource);

    if (this.expandedFeedbackKeys.has(key)) {
      this.expandedFeedbackKeys.delete(key);
      return;
    }

    this.expandedFeedbackKeys.add(key);
  }

  getFeedbackContent(resource: OnboardingResource): string {
    return localStorage.getItem(this.getFeedbackStorageKey(resource)) || '';
  }

  onFeedbackContentChange(resource: OnboardingResource, content: string): void {
    const storageKey = this.getFeedbackStorageKey(resource);

    if (content) {
      localStorage.setItem(storageKey, content);
      return;
    }

    localStorage.removeItem(storageKey);
  }

  private getFeedbackStorageKey(resource: OnboardingResource): string {
    return `mockAssessment.feedback.${this.getResourceKey(resource)}.content`;
  }

  getFeedbackSubmissions(resource: OnboardingResource): FeedbackSubmission[] {
    const raw = localStorage.getItem(this.getFeedbackSubmissionsStorageKey(resource));
    return raw ? JSON.parse(raw) : [];
  }

  onSubmitFeedback(resource: OnboardingResource): void {
    const content = this.getFeedbackContent(resource);

    if (!content) {
      return;
    }

    const submissions = this.getFeedbackSubmissions(resource);
    submissions.push({ content, submittedAt: new Date().toISOString() });
    localStorage.setItem(this.getFeedbackSubmissionsStorageKey(resource), JSON.stringify(submissions));
  }

  formatSubmittedDate(submittedAt: string): string {
    return new Date(submittedAt).toLocaleString();
  }

  private getFeedbackSubmissionsStorageKey(resource: OnboardingResource): string {
    return `mockAssessment.feedback.${this.getResourceKey(resource)}.submissions`;
  }

  private getResourceKey(resource: OnboardingResource): string {
    return String(resource.eid || resource.id);
  }

  get groupResources(): OnboardingResource[] {
    return this.sharedData.onboardingResources.filter(resource =>
      !this.group || String(resource.groupNumber) === this.group
    );
  }

  private get sortedOnboardingResources(): OnboardingResource[] {
    return this.groupResources.sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }


  ngAfterContentInit(): void {
    this.summaryTableTab = this.summary?.tabMenusItems?.[0];
    this.feedbackTab = this.summary?.tabMenusItems?.[1];
    this.headCountTab = this.summary?.tabMenusItems?.[2];
  }

  // Save to backend API
  saveMockAssessment(): void {
    localStorage.setItem(
      this.summaryStorageKey,
      JSON.stringify(this.summary)
    );

  }
}
