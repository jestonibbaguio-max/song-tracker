import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { SharedDataService } from '../../services/shared-data.service';
import { SprintRetroCategory, SprintRetroItem } from '../../models/types';

interface SprintOption {
  id: number;
  name: string;
  start: string;
  end: string;
}

interface RetroColumn {
  category: SprintRetroCategory;
  title: string;
  icon: string;
  tone: string;
  placeholder: string;
}

@Component({
  selector: 'app-sprint-retros',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './sprint-retros.component.html',
  styleUrl: './sprint-retros.component.css'
})
export class SprintRetrosComponent implements OnInit {
  readonly columns: RetroColumn[] = [
    {
      category: 'improve',
      title: 'What we can improve',
      icon: 'bi-arrow-up-circle',
      tone: 'improve',
      placeholder: 'Add an improvement idea'
    },
    {
      category: 'didnt-go-well',
      title: "What didn't go well",
      icon: 'bi-exclamation-circle',
      tone: 'challenge',
      placeholder: 'Add a challenge'
    },
    {
      category: 'went-well',
      title: 'What went well',
      icon: 'bi-check-circle',
      tone: 'success',
      placeholder: 'Add a win'
    }
  ];

  sprints: SprintOption[] = [];
  selectedSprintId: number | null = null;
  items: SprintRetroItem[] = [];
  drafts: Record<SprintRetroCategory, string> = {
    improve: '',
    'didnt-go-well': '',
    'went-well': ''
  };
  savingCategory: SprintRetroCategory | null = null;
  deletingIds = new Set<number>();
  editingId: number | null = null;
  editDraft = '';
  savingEdit = false;
  private collapsedGroups = new Set<number>();
  loading = true;
  errorMessage = '';

  constructor(private http: HttpClient, public sharedData: SharedDataService) {}

  ngOnInit(): void {
    this.loadTracker();
  }

  get selectedSprint(): SprintOption | undefined {
    return this.sprints.find(sprint => sprint.id === this.selectedSprintId);
  }

  get hasGroupSelected(): boolean {
    return !!this.sharedData.attendanceGroup;
  }

  get groupLabel(): string {
    return this.sharedData.getGroupLabel(this.sharedData.attendanceGroup);
  }

  itemsFor(category: SprintRetroCategory): SprintRetroItem[] {
    const group = this.sharedData.attendanceGroup;
    return this.items.filter(item =>
      item.category === category && (!group || item.groupNumber === Number(group))
    );
  }

  get groupsOverview(): { groupNumber: number; label: string; totalEntries: number }[] {
    const groups = new Set(this.items.map(item => item.groupNumber));
    return Array.from(groups)
      .sort((a, b) => a - b)
      .map(groupNumber => ({
        groupNumber,
        label: this.sharedData.getGroupLabel(String(groupNumber)),
        totalEntries: this.items.filter(item => item.groupNumber === groupNumber).length
      }));
  }

  itemsForGroup(groupNumber: number, category: SprintRetroCategory): SprintRetroItem[] {
    return this.items.filter(item => item.groupNumber === groupNumber && item.category === category);
  }

  isGroupExpanded(groupNumber: number): boolean {
    return !this.collapsedGroups.has(groupNumber);
  }

  toggleGroup(groupNumber: number): void {
    if (this.collapsedGroups.has(groupNumber)) {
      this.collapsedGroups.delete(groupNumber);
    } else {
      this.collapsedGroups.add(groupNumber);
    }
  }

  onSprintChange(sprintId: number | string): void {
    this.selectedSprintId = Number(sprintId);
    this.loadItems();
  }

  addItem(category: SprintRetroCategory): void {
    const text = this.drafts[category].trim();
    const groupNumber = Number(this.sharedData.attendanceGroup);
    if (!text || this.selectedSprintId === null || this.savingCategory || !this.hasGroupSelected || !Number.isInteger(groupNumber)) return;

    this.savingCategory = category;
    this.errorMessage = '';
    this.http.post<SprintRetroItem>(this.sharedData.apiUrl('/api/sprint-retros'), {
      sprintId: this.selectedSprintId,
      groupNumber,
      category,
      text
    }).subscribe({
      next: item => {
        this.items = [...this.items, item];
        this.drafts[category] = '';
        this.savingCategory = null;
      },
      error: () => {
        this.errorMessage = 'The retrospective item could not be added. Please try again.';
        this.savingCategory = null;
      }
    });
  }

  removeItem(item: SprintRetroItem): void {
    if (this.deletingIds.has(item.id) || !this.hasGroupSelected) return;

    this.deletingIds.add(item.id);
    this.errorMessage = '';
    this.http.delete(this.sharedData.apiUrl(`/api/sprint-retros/${item.id}`)).subscribe({
      next: () => {
        this.items = this.items.filter(existing => existing.id !== item.id);
        this.deletingIds.delete(item.id);
      },
      error: () => {
        this.errorMessage = 'The retrospective item could not be removed. Please try again.';
        this.deletingIds.delete(item.id);
      }
    });
  }

  startEdit(item: SprintRetroItem): void {
    if (this.deletingIds.has(item.id) || !this.hasGroupSelected) return;
    this.editingId = item.id;
    this.editDraft = item.text;
  }

  cancelEdit(): void {
    this.editingId = null;
    this.editDraft = '';
  }

  saveEdit(item: SprintRetroItem): void {
    const text = this.editDraft.trim();
    if (!text || this.savingEdit) return;

    this.savingEdit = true;
    this.errorMessage = '';
    this.http.patch<SprintRetroItem>(this.sharedData.apiUrl(`/api/sprint-retros/${item.id}`), { text }).subscribe({
      next: updated => {
        this.items = this.items.map(existing => existing.id === updated.id ? updated : existing);
        this.savingEdit = false;
        this.cancelEdit();
      },
      error: () => {
        this.errorMessage = 'The retrospective item could not be updated. Please try again.';
        this.savingEdit = false;
      }
    });
  }

  formatSprintDates(sprint: SprintOption): string {
    const formatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${formatter.format(new Date(`${sprint.start}T00:00:00`))} - ${formatter.format(new Date(`${sprint.end}T00:00:00`))}`;
  }

  private loadTracker(): void {
    this.loading = true;
    this.errorMessage = '';
    forkJoin({
      sprints: this.http.get<SprintOption[]>(this.sharedData.apiUrl('/api/sprints')),
      items: this.http.get<SprintRetroItem[]>(this.sharedData.apiUrl('/api/sprint-retros'))
    }).subscribe({
      next: ({ sprints, items }) => {
        this.sprints = sprints.sort((a, b) => a.id - b.id);
        this.selectedSprintId = this.findCurrentSprintId();
        this.items = items.filter(item => item.sprintId === this.selectedSprintId);
        this.loading = false;
      },
      error: () => {
        this.errorMessage = 'The sprint retrospective could not be loaded. Please refresh and try again.';
        this.loading = false;
      }
    });
  }

  private loadItems(): void {
    if (this.selectedSprintId === null) {
      this.items = [];
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.http.get<SprintRetroItem[]>(
      this.sharedData.apiUrl(`/api/sprint-retros?sprintId=${this.selectedSprintId}`)
    ).subscribe({
      next: items => {
        this.items = items;
        this.loading = false;
      },
      error: () => {
        this.errorMessage = 'The selected sprint retrospective could not be loaded.';
        this.loading = false;
      }
    });
  }

  private findCurrentSprintId(): number | null {
    if (this.sprints.length === 0) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const current = this.sprints.find(sprint => {
      const start = new Date(`${sprint.start}T00:00:00`);
      const end = new Date(`${sprint.end}T23:59:59`);
      return today >= start && today <= end;
    });
    return current?.id ?? this.sprints[this.sprints.length - 1].id;
  }
}
