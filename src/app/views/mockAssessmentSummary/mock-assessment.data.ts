import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { QuillModule } from 'ngx-quill';
import { SharedDataService } from '../../services/shared-data.service';
import { OnboardingResource } from '../../models/types';

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

type HeadCountChecklistField = 'communication' | 'technical' | 'client';

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
  @Input() summary!: MockAssessmentSummary;
  summaryTableTab!: MockAssessmentSummaryTabItem;
  feedbackTab!: MockAssessmentSummaryTabItem;
  headCountTab!: MockAssessmentSummaryTabItem;

  page: number = 1;
  pageSize: number = 10;
  maxVisiblePages: number = 5;
  onBoardingResourcesPerPage: number = 10

  feedbackPage: number = 1;
  feedbackSearchTerm: string = '';
  headCountSearchTerm: string = '';
  private expandedFeedbackKeys = new Set<string>();

  editingIndex: number | null = null;
  editingRow: MockAssessmentRow | null = null;
  showEditModal = false;

  constructor(public sharedData: SharedDataService) {}

  onEdit(index: number): void {
    this.editingIndex = index;
    this.editingRow = JSON.parse(JSON.stringify(this.summary.rows[index]));
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
      totalFailed: '-',
      passRate: '0%',
      failRate: '0'
    };
    this.summary.rows.push(newRow);
    this.editingIndex = this.summary.rows.length - 1;
    this.editingRow = JSON.parse(JSON.stringify(newRow));
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
    const savedData = localStorage.getItem('mockAssessment');

    if (savedData) {
      this.summary = JSON.parse(savedData);
    }

    if (this.sharedData.onboardingResources.length === 0) {
      this.sharedData.loadOnboardingResources();
    }

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
   
    console.log(start, end)
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }

  isHeadCountChecklistChecked(resource: OnboardingResource, field: HeadCountChecklistField): boolean {
    return localStorage.getItem(this.getHeadCountChecklistStorageKey(resource, field)) === 'true';
  }

  getHeadCountChecklistTotal(field: HeadCountChecklistField): number {
    return this.sharedData.onboardingResources.filter((resource) =>
      this.isHeadCountChecklistChecked(resource, field)
    ).length;
  }

  headCountFilter: HeadCountChecklistField | null = null;

  toggleHeadCountFilter(field: HeadCountChecklistField): void {
    this.headCountFilter = this.headCountFilter === field ? null : field;
    this.page = 1;
  }

  onHeadCountSearchChange(): void {
    this.page = 1;
  }

  private get filteredOnboardingResources(): OnboardingResource[] {
    let resources = this.sortedOnboardingResources;

    if (this.headCountFilter) {
      resources = resources.filter((resource) =>
        this.isHeadCountChecklistChecked(resource, this.headCountFilter!)
      );
    }

    return this.filterByNameOrEid(resources, this.headCountSearchTerm);
  }

  onHeadCountChecklistChange(resource: OnboardingResource, field: HeadCountChecklistField, event: Event): void {
    const isChecked = (event.target as HTMLInputElement).checked;
    const storageKey = this.getHeadCountChecklistStorageKey(resource, field);

    if (isChecked) {
      localStorage.setItem(storageKey, 'true');
      return;
    }

    localStorage.removeItem(storageKey);
  }

  private getHeadCountChecklistStorageKey(resource: OnboardingResource, field: HeadCountChecklistField): string {
    return `mockAssessment.headCount.${resource.eid || resource.id}.${field}.checked`;
  }

  get feedbackTotalPages(): number {
    return Math.ceil(this.feedbackFilteredResources.length / this.pageSize);
  }

  get feedbackResources(): OnboardingResource[] {
    const start = (this.feedbackPage - 1) * this.pageSize;
    return this.feedbackFilteredResources.slice(start, start + this.pageSize);
  }

  onFeedbackSearchChange(): void {
    this.feedbackPage = 1;
  }

  private get feedbackFilteredResources(): OnboardingResource[] {
    return this.filterByNameOrEid(this.sortedOnboardingResources, this.feedbackSearchTerm);
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

  private get sortedOnboardingResources(): OnboardingResource[] {
    return [...this.sharedData.onboardingResources].sort((a, b) =>
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
      'mockAssessment',
      JSON.stringify(this.summary)
    );

    console.log('Mock assessment saved locally');
  }
}
