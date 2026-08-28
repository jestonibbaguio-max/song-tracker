import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { CdkDragDrop, CdkDrag, CdkDropList, CdkDropListGroup, moveItemInArray } from '@angular/cdk/drag-drop';
import { SharedDataService } from '../../services/shared-data.service';
import {
  PlannerBoard,
  PlannerBucket,
  PlannerTask,
  PlannerLabel,
  PlannerChecklistItem,
  PlannerComment,
  DeletionLog,
  BurndownRow,
  BurndownChartConfig,
  OnboardingResource,
  AttendanceEntry,
} from '../../models/types';

@Component({
  selector: 'app-planner',
  standalone: true,
  imports: [FormsModule, DecimalPipe, CdkDrag, CdkDropList, CdkDropListGroup],
  templateUrl: './planner.component.html',
  styleUrl: './planner.component.css'
})
export class PlannerComponent implements OnInit, OnDestroy {
  plannerView: 'boards' | 'board' = 'boards';
  plannerBoardTab: 'sprint' | 'dashboard' = 'sprint';
  plannerSubView: 'grid' | 'board' | 'dashboard' = 'board';
  plannerGridSearch = '';
  plannerBoards: PlannerBoard[] = [];
  plannerBuckets: PlannerBucket[] = [];
  plannerTasks: PlannerTask[] = [];
  plannerLabels: PlannerLabel[] = [];
  selectedBoard: PlannerBoard | null = null;
  plannerLoading = false;
  showCompletedByBucket: Record<number, boolean> = {};
  selectedSprintName = '';
  sprintSchedule: { id: number; name: string; start: string; end: string }[] = [];
  sprintModal: {
    open: boolean;
    isEdit: boolean;
    id: number | null;
    name: string;
    start: string;
    end: string;
    error: string;
    saving: boolean;
  } = { open: false, isEdit: false, id: null, name: '', start: '', end: '', error: '', saving: false };
  taskModal: {
    open: boolean;
    isNew: boolean;
    task: PlannerTask;
    activeTab: 'details' | 'attachments';
    checklistInput: string;
    commentInput: string;
    commentAuthor: string;
    labelMenuOpen: boolean;
  } = { open: false, isNew: true, task: this.emptyTask(), activeTab: 'details', checklistInput: '', commentInput: '', commentAuthor: '', labelMenuOpen: false };

  deleteCommentDialog: {
    open: boolean;
    comment: PlannerComment | null;
    typeInput: string;
  } = { open: false, comment: null, typeInput: '' };

  deleteTaskDialog: {
    open: boolean;
    typeInput: string;
  } = { open: false, typeInput: '' };

  taskSaveError = '';

  // ── Kanban ──────────────────────────────────────────────────────────────
  readonly kanbanCols: { id: string; label: string; color: string }[] = [
    { id: 'new',    label: 'New',         color: '#9ca3af' },
    { id: 'active', label: 'In Progress', color: '#3b82f6' },
    { id: 'review', label: 'Review',      color: '#f59e0b' },
    { id: 'done',   label: 'Done',        color: '#10b981' },
  ];

  tasksPendingSync: Record<string, boolean> = {};

  private readonly colStatusMap: Record<string, { status: string; completed: boolean }> = {
    new:    { status: 'Not started', completed: false },
    active: { status: 'In progress', completed: false },
    review: { status: 'Review',      completed: false },
    done:   { status: 'Completed',   completed: true  },
  };

  // ── Planner filter ───────────────────────────────────────────────────────
  plannerFilterOpen = false;
  plannerFilterSection: string | null = null;
  assigneeSearch = '';
  plannerFilter = { assignees: [] as string[] };

  // ── Capacity plan ────────────────────────────────────────────────────────
  capacityOpen = false;
  capacityLoading = false;
  capacityAttendance: AttendanceEntry[] = [];
  capacityData: Record<string, {
    totalDays: number; leaveDays: number; availHours: number; tasks: number; storyPoints: number; utilPct: number;
    pto: number; cadence: number; admin: number; holiday: number; capacity: number;
    trainingHours: number; deliveryHours: number; totalHours: number;
    trainingSP: number; deliverySP: number; totalSP: number;
  } | undefined> = {};
  capacityEntries: Record<string, { id?: number; cadence: number; admin: number; holiday: number }> = {};
  private capacityPollInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private http: HttpClient, public sharedData: SharedDataService) {}

  ngOnInit(): void {
    this.loadPlanner();
  }

  ngOnDestroy(): void {
    this.stopCapacityPolling();
  }

  // ── Computed from sharedData ─────────────────────────────────────────────

  get plannerGroupMembers(): OnboardingResource[] {
    if (!this.sharedData.attendanceGroup) return this.sharedData.onboardingResources;
    return this.sharedData.onboardingResources.filter(r => Number(r.groupNumber) === Number(this.sharedData.attendanceGroup));
  }

  get filteredPlannerBoards(): PlannerBoard[] {
    if (!this.sharedData.attendanceGroup) return this.plannerBoards;
    return this.plannerBoards.filter(b => Number(b.groupNumber) === Number(this.sharedData.attendanceGroup));
  }

  // ── Load ─────────────────────────────────────────────────────────────────

  loadPlanner(): void {
    if (this.plannerLabels.length === 0) {
      this.http.get<PlannerLabel[]>(this.sharedData.apiUrl('/api/planner-labels')).subscribe({
        next: labels => { this.plannerLabels = labels; }
      });
    }
    if (this.sprintSchedule.length === 0) {
      this.http.get<{ id: number; name: string; start: string; end: string }[]>(this.sharedData.apiUrl('/api/sprints')).subscribe({
        next: sprints => {
          this.sprintSchedule = sprints.sort((a, b) => a.id - b.id);
          if (!this.selectedSprintName && this.sprintSchedule.length > 0) {
            this.selectedSprintName = this.getCurrentSprintName();
          }
        }
      });
    }
    this.plannerLoading = true;
    this.http.get<PlannerBoard[]>(this.sharedData.apiUrl('/api/planner-boards')).subscribe({
      next: raw => {
        this.plannerBoards = raw.map(b => ({ ...b, id: Number(b.id), groupNumber: Number(b.groupNumber) }));
        this.plannerLoading = false;
      }
    });
  }

  // ── Sprint ───────────────────────────────────────────────────────────────

  openCreateSprintDialog(): void {
    this.sprintModal = { open: true, isEdit: false, id: null, name: '', start: '', end: '', error: '', saving: false };
  }

  openEditSprintDialog(): void {
    const sprint = this.sprintSchedule.find(s => s.name === this.selectedSprintName);
    if (!sprint) return;
    this.sprintModal = { open: true, isEdit: true, id: sprint.id, name: sprint.name, start: sprint.start, end: sprint.end, error: '', saving: false };
  }

  cancelSprintDialog(): void {
    this.sprintModal.open = false;
  }

  saveSprintDialog(): void {
    const { isEdit, id, name, start, end } = this.sprintModal;
    if (!name.trim()) { this.sprintModal.error = 'Sprint name is required.'; return; }
    if (!start) { this.sprintModal.error = 'Start date is required.'; return; }
    if (!end) { this.sprintModal.error = 'End date is required.'; return; }
    if (end < start) { this.sprintModal.error = 'End date must be after start date.'; return; }
    this.sprintModal.saving = true;
    this.sprintModal.error = '';

    if (isEdit && id !== null) {
      this.http.patch<{ id: number; name: string; start: string; end: string }>(
        this.sharedData.apiUrl(`/api/sprints/${id}`), { name: name.trim(), start, end }
      ).subscribe({
        next: updated => {
          const idx = this.sprintSchedule.findIndex(s => s.id === id);
          if (idx !== -1) this.sprintSchedule[idx] = updated;
          this.selectedSprintName = updated.name;
          this.sprintModal.open = false;
          this.sprintModal.saving = false;
        },
        error: () => { this.sprintModal.error = 'Failed to save sprint.'; this.sprintModal.saving = false; }
      });
    } else {
      this.http.post<{ id: number; name: string; start: string; end: string }>(
        this.sharedData.apiUrl('/api/sprints'), { name: name.trim(), start, end }
      ).subscribe({
        next: created => {
          this.sprintSchedule.push(created);
          this.sprintSchedule.sort((a, b) => a.id - b.id);
          this.selectedSprintName = created.name;
          this.sprintModal.open = false;
          this.sprintModal.saving = false;
          if (this.plannerView === 'board') this.ensureBucketForSprint(created.name);
        },
        error: () => { this.sprintModal.error = 'Failed to create sprint.'; this.sprintModal.saving = false; }
      });
    }
  }

  getCurrentSprintName(): string {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const active = this.sprintSchedule.find(s => {
      const start = new Date(s.start + 'T00:00:00');
      const end   = new Date(s.end   + 'T23:59:59');
      return today >= start && today <= end;
    });
    return active?.name ?? this.sprintSchedule[this.sprintSchedule.length - 1].name;
  }

  getSprintDateRange(sprintName: string): string {
    const s = this.sprintSchedule.find(sp => sp.name === sprintName);
    if (!s) return '';
    const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${fmt(s.start)} – ${fmt(s.end)}`;
  }

  onSprintSelected(sprintName: string): void {
    this.selectedSprintName = sprintName;
    if (this.plannerView === 'board') {
      this.ensureBucketForSprint(sprintName);
    }
  }

  // ── Board ────────────────────────────────────────────────────────────────

  openBoard(board: PlannerBoard): void {
    this.selectedBoard = board;
    this.plannerView = 'board';
    this.plannerLoading = true;
    this.http.get<PlannerBucket[]>(this.sharedData.apiUrl(`/api/planner-buckets?boardId=${board.id}`)).subscribe({
      next: raw => {
        const buckets = raw.map(b => ({ ...b, id: Number(b.id), boardId: Number(b.boardId) }));
        this.plannerBuckets = buckets.sort((a, b) => a.order - b.order);
        const current = this.getCurrentSprintName();
        const match   = this.plannerBuckets.find(b => b.name === current);
        this.selectedSprintName = match?.name ?? this.plannerBuckets[0]?.name ?? current;
        this.ensureBucketForSprint(this.selectedSprintName);
      }
    });
    this.http.get<PlannerTask[]>(this.sharedData.apiUrl(`/api/planner-tasks?boardId=${board.id}`)).subscribe({
      next: raw => {
        this.plannerTasks = raw.map(t => ({
          ...t,
          id:       Number(t.id),
          boardId:  Number(t.boardId),
          bucketId: Number(t.bucketId),
        }));
        this.plannerLoading = false;
      }
    });
  }

  backToBoards(): void {
    this.stopCapacityPolling();
    this.capacityOpen = false;
    this.plannerView = 'boards';
    this.plannerBoardTab = 'sprint';
    this.plannerSubView = 'board';
    this.plannerGridSearch = '';
    this.selectedBoard = null;
    this.plannerBuckets = [];
    this.plannerTasks = [];
  }

  private ensureBucketForSprint(sprintName: string): void {
    if (!this.selectedBoard) return;
    const exists = this.plannerBuckets.find(b => b.name === sprintName);
    if (exists) return;
    const order = this.plannerBuckets.length;
    this.http.post<PlannerBucket>(this.sharedData.apiUrl('/api/planner-buckets'), {
      boardId: this.selectedBoard.id,
      name: sprintName,
      order
    }).subscribe({
      next: bucket => {
        this.plannerBuckets = [...this.plannerBuckets, { ...bucket, id: Number(bucket.id), boardId: Number(bucket.boardId) }]
          .sort((a, b) => a.order - b.order);
      }
    });
  }

  // ── Kanban ───────────────────────────────────────────────────────────────

  isTaskPendingSync(taskId: number | string | undefined): boolean {
    return taskId !== undefined && !!this.tasksPendingSync[String(taskId)];
  }

  onKanbanDrop(event: CdkDragDrop<PlannerTask[]>): void {
    if (event.previousContainer === event.container) {
      const colTasks = [...event.container.data];
      moveItemInArray(colTasks, event.previousIndex, event.currentIndex);
      const colIds = new Set(colTasks.map(t => t.id));
      const positions: number[] = [];
      this.plannerTasks.forEach((t, i) => { if (colIds.has(t.id)) positions.push(i); });
      const updated = [...this.plannerTasks];
      positions.forEach((pos, i) => { updated[pos] = colTasks[i]; });
      this.plannerTasks = updated;
      return;
    }
    const task    = event.item.data as PlannerTask;
    const toColId = (event.container.id as string).split('-')[0];
    const newStatus = this.colStatusMap[toColId];
    if (!newStatus || !task.id) return;
    const snapshot   = { ...task };
    const optimistic = { ...task, ...newStatus, updatedAt: new Date().toISOString() };
    this.plannerTasks     = this.plannerTasks.map(t => String(t.id) === String(task.id) ? optimistic : t);
    this.tasksPendingSync = { ...this.tasksPendingSync, [String(task.id)]: true };
    this.http.patch<PlannerTask>(
      this.sharedData.apiUrl(`/api/planner-tasks/${task.id}`), newStatus
    ).subscribe({
      next: saved => {
        const p = { ...this.tasksPendingSync };
        delete p[String(saved.id)];
        this.tasksPendingSync = p;
        this.plannerTasks = this.plannerTasks.map(t => String(t.id) === String(saved.id) ? saved : t);
      },
      error: () => {
        const p = { ...this.tasksPendingSync };
        delete p[String(task.id)];
        this.tasksPendingSync = p;
        this.plannerTasks = this.plannerTasks.map(t => String(t.id) === String(task.id) ? snapshot : t);
      }
    });
  }

  getTaskColId(task: PlannerTask): string {
    if (task.completed || task.status === 'Completed' || task.status === 'Closed') return 'done';
    if (task.status === 'Review' || task.status === 'Testing') return 'review';
    if (task.status === 'In progress' || task.status === 'Active') return 'active';
    return 'new';
  }

  getTasksForCol(bucketId: number, colId: string): PlannerTask[] {
    let tasks = this.plannerTasks.filter(t => Number(t.bucketId) === Number(bucketId));
    if (this.plannerFilter.assignees.length) {
      tasks = tasks.filter(t => this.plannerFilter.assignees.includes(this.getPlannerMemberName(t.assignee)));
    }
    return tasks.filter(t => this.getTaskColId(t) === colId);
  }

  getColTaskCount(bucketId: number, colId: string): number {
    return this.plannerTasks.filter(t =>
      Number(t.bucketId) === Number(bucketId) && this.getTaskColId(t) === colId
    ).length;
  }

  getTaskStatusColor(task: PlannerTask): string {
    const colId = this.getTaskColId(task);
    return this.kanbanCols.find(c => c.id === colId)?.color ?? '#9ca3af';
  }

  getBucketTasks(bucketId: number, completed: boolean): PlannerTask[] {
    return this.plannerTasks.filter(t => Number(t.bucketId) === Number(bucketId) && !!t.completed === completed);
  }

  toggleShowCompleted(bucketId: number): void {
    this.showCompletedByBucket[bucketId] = !this.showCompletedByBucket[bucketId];
  }

  // ── Filter ───────────────────────────────────────────────────────────────

  get plannerActiveFilterCount(): number { return this.plannerFilter.assignees.length; }

  get filteredPeopleForFilter(): OnboardingResource[] {
    const q = this.assigneeSearch.trim().toLowerCase();
    if (!q) return this.plannerGroupMembers;
    return this.plannerGroupMembers.filter(m => m.name.toLowerCase().includes(q));
  }

  toggleAssigneeFilter(name: string): void {
    const idx = this.plannerFilter.assignees.indexOf(name);
    if (idx === -1) this.plannerFilter.assignees.push(name);
    else this.plannerFilter.assignees.splice(idx, 1);
  }

  clearPlannerFilter(): void {
    this.plannerFilter = { assignees: [] };
    this.plannerFilterSection = null;
    this.assigneeSearch = '';
  }

  getFilteredBucketTasks(bucketId: number, completed: boolean): PlannerTask[] {
    let tasks = this.plannerTasks.filter(t =>
      Number(t.bucketId) === Number(bucketId) && !!t.completed === completed
    );
    if (this.plannerFilter.assignees.length) {
      tasks = tasks.filter(t => this.plannerFilter.assignees.includes(this.getPlannerMemberName(t.assignee)));
    }
    return tasks;
  }

  // ── Task Modal ───────────────────────────────────────────────────────────

  openNewTaskModal(bucketId: number): void {
    const task = this.emptyTask();
    task.boardId = this.selectedBoard!.id;
    task.bucketId = bucketId;
    this.taskModal = { open: true, isNew: true, task, activeTab: 'details', checklistInput: '', commentInput: '', commentAuthor: this.taskModal.commentAuthor, labelMenuOpen: false };
  }

  openEditTaskModal(task: PlannerTask): void {
    this.taskSaveError = '';
    this.taskModal = {
      open: true, isNew: false,
      task: {
        ...task,
        description: task.description || '',
        acceptanceCriteria: task.acceptanceCriteria || '',
        labels: [...new Set((task.labels || []).map(id => Number(id)))],
        checklist: task.checklist.map(c => ({ ...c })),
        comments: (task.comments || []).map(c => ({ ...c }))
      },
      activeTab: 'details', checklistInput: '', commentInput: '', commentAuthor: this.taskModal.commentAuthor, labelMenuOpen: false
    };
  }

  closeTaskModal(): void {
    this.taskModal = { ...this.taskModal, open: false, labelMenuOpen: false };
  }

  saveTask(): void {
    if (!this.taskModal.task.title.trim()) return;
    this.taskSaveError = '';
    const now = new Date().toISOString();
    const task = { ...this.taskModal.task, updatedAt: now };
    if (this.taskModal.isNew) {
      task.createdAt = now;
      this.http.post<PlannerTask>(this.sharedData.apiUrl('/api/planner-tasks'), task).subscribe({
        next: saved => { this.plannerTasks = [...this.plannerTasks, saved]; this.closeTaskModal(); },
        error: err => { this.taskSaveError = `Save failed: ${err?.error?.error ?? err?.message ?? 'Server error'}. Please try again.`; }
      });
    } else {
      this.http.patch<PlannerTask>(this.sharedData.apiUrl(`/api/planner-tasks/${task.id}`), task).subscribe({
        next: saved => {
          this.plannerTasks = this.plannerTasks.map(t => Number(t.id) === Number(saved.id) ? saved : t);
          this.closeTaskModal();
        },
        error: err => { this.taskSaveError = `Save failed: ${err?.error?.error ?? err?.message ?? 'Server error'}. Please try again.`; }
      });
    }
  }

  toggleTaskComplete(task: PlannerTask, event: Event): void {
    event.stopPropagation();
    const updated = { ...task, completed: !task.completed, status: !task.completed ? 'Completed' : 'Not started', updatedAt: new Date().toISOString() };
    this.http.patch<PlannerTask>(this.sharedData.apiUrl(`/api/planner-tasks/${task.id}`), updated).subscribe({
      next: saved => { this.plannerTasks = this.plannerTasks.map(t => String(t.id) === String(saved.id) ? saved : t); }
    });
  }

  openDeleteTaskDialog(): void {
    this.deleteTaskDialog = { open: true, typeInput: '' };
  }

  closeDeleteTaskDialog(): void {
    this.deleteTaskDialog = { open: false, typeInput: '' };
  }

  confirmDeleteTask(): void {
    if (this.deleteTaskDialog.typeInput !== 'DELETE') return;
    const { task } = this.taskModal;
    if (!task.id) { this.closeTaskModal(); return; }

    const authorName = this.taskModal.commentAuthor || 'Unknown';
    const eid = this.plannerGroupMembers.find(m => m.name === authorName)?.eid ?? 'unknown';
    const log: DeletionLog = {
      type: 'task-deletion',
      taskId: task.id,
      taskTitle: task.title,
      deletedBy: authorName,
      deletedByEid: eid
    };
    this.http.post(this.sharedData.apiUrl('/api/deletion-logs'), log).subscribe();

    this.http.delete(this.sharedData.apiUrl(`/api/planner-tasks/${task.id}`)).subscribe({
      next: () => {
        this.plannerTasks = this.plannerTasks.filter(t => t.id !== task.id);
        this.closeDeleteTaskDialog();
        this.closeTaskModal();
      }
    });
  }

  addChecklistItem(): void {
    const text = this.taskModal.checklistInput.trim();
    if (!text) return;
    const id = Date.now();
    this.taskModal.task.checklist = [...this.taskModal.task.checklist, { id, text, done: false }];
    this.taskModal.checklistInput = '';
  }

  removeChecklistItem(id: number): void {
    this.taskModal.task.checklist = this.taskModal.task.checklist.filter(c => c.id !== id);
  }

  addComment(): void {
    const text = this.taskModal.commentInput.trim();
    if (!text) return;
    const comment: PlannerComment = {
      id: Date.now(),
      author: this.taskModal.commentAuthor.trim() || 'Anonymous',
      text,
      createdAt: new Date().toISOString()
    };
    this.taskModal.task.comments = [...this.taskModal.task.comments, comment];
    this.taskModal.commentInput = '';
  }

  openDeleteCommentDialog(comment: PlannerComment): void {
    this.deleteCommentDialog = { open: true, comment, typeInput: '' };
  }

  closeDeleteCommentDialog(): void {
    this.deleteCommentDialog = { open: false, comment: null, typeInput: '' };
  }

  confirmDeleteComment(): void {
    const { comment } = this.deleteCommentDialog;
    if (!comment || this.deleteCommentDialog.typeInput !== 'DELETE') return;

    this.taskModal.task.comments = this.taskModal.task.comments.filter(c => c.id !== comment.id);

    const authorName = this.taskModal.commentAuthor || 'Unknown';
    const eid = this.plannerGroupMembers.find(m => m.name === authorName)?.eid ?? 'unknown';
    const log: DeletionLog = {
      type: 'comment-deletion',
      taskId: this.taskModal.task.id,
      taskTitle: this.taskModal.task.title,
      deletedBy: authorName,
      deletedByEid: eid,
      commentAuthor: comment.author,
      commentText: comment.text,
      commentCreatedAt: comment.createdAt
    };
    this.http.post(this.sharedData.apiUrl('/api/deletion-logs'), log).subscribe();
    this.closeDeleteCommentDialog();
  }

  checklistDoneCount(checklist: PlannerChecklistItem[]): number {
    return checklist.filter(c => c.done).length;
  }

  getInitials(name: string): string {
    if (!name) return '?';
    return name.split(' ').filter(p => p).map(p => p[0]).join('').toUpperCase().slice(0, 2);
  }

  formatCommentDate(iso: string): string {
    if (!iso) return '';
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  toggleLabelOnTask(labelId: number): void {
    const labels = this.taskModal.task.labels;
    const clickedLabel = this.plannerLabels.find(l => Number(l.id) === Number(labelId));
    const isStoryPoint = !!clickedLabel?.name.match(/^Story Point \d+$/i);

    if (isStoryPoint) {
      const spIds = this.plannerLabels
        .filter(l => l.name.match(/^Story Point \d+$/i))
        .map(l => Number(l.id));
      const wasSelected = labels.some(id => Number(id) === Number(labelId));
      const withoutSP = labels.filter(id => !spIds.includes(Number(id)));
      this.taskModal.task.labels = wasSelected ? withoutSP : [...withoutSP, labelId];
    } else {
      const idx = labels.findIndex(id => Number(id) === Number(labelId));
      this.taskModal.task.labels = idx === -1
        ? [...labels, labelId]
        : labels.filter((_, i) => i !== idx);
    }
  }

  isLabelOnTask(labelId: number): boolean {
    return this.taskModal.task.labels.some(id => Number(id) === Number(labelId));
  }

  getLabelById(id: number): PlannerLabel | undefined {
    return this.plannerLabels.find(l => Number(l.id) === Number(id));
  }

  getTaskLabels(task: PlannerTask): PlannerLabel[] {
    return task.labels.map(id => this.plannerLabels.find(l => Number(l.id) === Number(id))).filter((l): l is PlannerLabel => !!l);
  }

  getBucketName(bucketId: number): string {
    return this.plannerBuckets.find(b => Number(b.id) === Number(bucketId))?.name ?? '';
  }

  getPlannerInitials(assignee: string): string {
    if (!assignee) return '?';
    const parts = assignee.split(/[\.\s,]+/).filter(Boolean);
    return parts.slice(0, 2).map(p => p[0].toUpperCase()).join('');
  }

  getPlannerMemberName(eid: string): string {
    return this.plannerGroupMembers.find(m => m.eid === eid)?.name || eid;
  }

  get plannerGridTasks(): PlannerTask[] {
    const bucketId = this.selectedBucket?.id;
    let tasks = bucketId != null
      ? this.plannerTasks.filter(t => Number(t.bucketId) === Number(bucketId))
      : [...this.plannerTasks];

    if (this.plannerFilter.assignees.length) {
      tasks = tasks.filter(t => this.plannerFilter.assignees.includes(this.getPlannerMemberName(t.assignee)));
    }

    const q = this.plannerGridSearch.trim().toLowerCase();
    if (q) {
      tasks = tasks.filter(t =>
        t.title.toLowerCase().includes(q) ||
        this.getPlannerMemberName(t.assignee).toLowerCase().includes(q)
      );
    }

    return tasks.sort((a, b) => {
      const statusOrder: Record<string, number> = { 'Completed': 3, 'In progress': 1, 'Not started': 0, 'In review': 2 };
      return (statusOrder[a.status] ?? 0) - (statusOrder[b.status] ?? 0);
    });
  }

  getPriorityDotColor(priority: string): string {
    const map: Record<string, string> = { Low: '#5b8dd9', Medium: '#e6b54a', High: '#e07832', Urgent: '#e05c5c' };
    return map[priority] ?? '#aaa';
  }

  getDueDateClass(dueDate: string): string {
    if (!dueDate) return '';
    const diff = new Date(dueDate).getTime() - Date.now();
    if (diff < 0) return 'due-overdue';
    if (diff < 3 * 24 * 60 * 60 * 1000) return 'due-soon';
    return '';
  }

  formatPlannerDate(dateStr: string): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  }

  // ── Capacity ─────────────────────────────────────────────────────────────

  get selectedSprintWorkingDays(): number {
    const sprint = this.sprintSchedule.find(s => s.name === this.selectedSprintName);
    if (!sprint) return 10;
    const start = new Date(sprint.start + 'T00:00:00');
    const end   = new Date(sprint.end   + 'T00:00:00');
    let count = 0;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6) count++;
    }
    return count;
  }

  toggleCapacity(): void {
    this.capacityOpen = !this.capacityOpen;
    if (this.capacityOpen) {
      this.loadCapacityEntries();
      this.loadCapacityData();
      this.startCapacityPolling();
    } else {
      this.stopCapacityPolling();
    }
  }

  loadCapacityData(): void {
    this.loadCapacityEntries();
    const sprint = this.sprintSchedule.find(s => s.name === this.selectedSprintName);
    if (!sprint) return;
    this.capacityLoading = true;
    this.capacityAttendance = [];

    const startDate = new Date(sprint.start + 'T00:00:00');
    const endDate   = new Date(sprint.end   + 'T00:00:00');
    const monthSet  = new Set<string>();
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      monthSet.add(`${d.getFullYear()}-${d.getMonth() + 1}`);
    }

    const monthKeys = Array.from(monthSet);
    let remaining = monthKeys.length;

    monthKeys.forEach(m => {
      const [y, mo] = m.split('-');
      this.http.get<AttendanceEntry[]>(this.sharedData.apiUrl(`/api/attendance?year=${y}&month=${mo}`)).subscribe({
        next: entries => {
          this.capacityAttendance = [...this.capacityAttendance, ...entries];
          if (--remaining === 0) { this.capacityLoading = false; this.buildCapacityData(sprint); }
        },
        error: () => {
          if (--remaining === 0) { this.capacityLoading = false; this.buildCapacityData(sprint); }
        }
      });
    });
  }

  loadCapacityEntries(): void {
    const sprint = this.selectedSprintName;
    if (!sprint) return;
    this.http.get<{id: number; sprintName: string; eid: string; cadence: number; admin: number; holiday: number}[]>(
      this.sharedData.apiUrl(`/api/capacity-entries?sprintName=${encodeURIComponent(sprint)}`)
    ).subscribe({
      next: entries => {
        this.capacityEntries = {};
        entries.forEach(e => {
          this.capacityEntries[e.eid] = { id: e.id, cadence: e.cadence, admin: e.admin, holiday: e.holiday };
        });
      }
    });
  }

  saveCapacityEntry(eid: string, field: 'cadence' | 'admin' | 'holiday', value: number): void {
    const entry = this.capacityEntries[eid] ?? { cadence: 0, admin: 0, holiday: 0 };
    entry[field] = Math.max(0, Math.round(value) || 0);
    this.capacityEntries[eid] = entry;
    const sprint = this.sprintSchedule.find(s => s.name === this.selectedSprintName);
    if (sprint) this.buildCapacityData(sprint);
    this.http.post(this.sharedData.apiUrl('/api/capacity-entries'), {
      sprintName: this.selectedSprintName, eid, ...this.capacityEntries[eid]
    }).subscribe();
  }

  getTaskStoryPoints(task: PlannerTask): number {
    for (const labelId of task.labels) {
      const label = this.plannerLabels.find(l => Number(l.id) === Number(labelId));
      if (label) {
        const match = label.name.match(/^Story Point (\d+)$/i);
        if (match) return Number(match[1]);
      }
    }
    return 1;
  }

  getTotalCapacity(): number {
    return this.plannerGroupMembers.reduce((s, m) => s + (this.capacityData[m.eid]?.capacity ?? this.selectedSprintWorkingDays), 0);
  }
  getTotalPTO(): number {
    return this.plannerGroupMembers.reduce((s, m) => s + (this.capacityData[m.eid]?.pto ?? 0), 0);
  }
  getTotalTrainingHours(): number {
    return parseFloat(this.plannerGroupMembers.reduce((s, m) => s + (this.capacityData[m.eid]?.trainingHours ?? 0), 0).toFixed(1));
  }
  getTotalDeliveryHours(): number {
    return parseFloat(this.plannerGroupMembers.reduce((s, m) => s + (this.capacityData[m.eid]?.deliveryHours ?? 0), 0).toFixed(1));
  }
  getTotalHours(): number {
    return this.plannerGroupMembers.reduce((s, m) => s + (this.capacityData[m.eid]?.totalHours ?? 0), 0);
  }
  getTotalTrainingSP(): number {
    return this.plannerGroupMembers.reduce((s, m) => s + (this.capacityData[m.eid]?.trainingSP ?? 0), 0);
  }
  getTotalDeliverySP(): number {
    return this.plannerGroupMembers.reduce((s, m) => s + (this.capacityData[m.eid]?.deliverySP ?? 0), 0);
  }
  getTotalSP(): number {
    return this.plannerGroupMembers.reduce((s, m) => s + (this.capacityData[m.eid]?.totalSP ?? 0), 0);
  }

  // ── Burndown ─────────────────────────────────────────────────────────────

  get selectedBucket(): PlannerBucket | null {
    return this.plannerBuckets.find(b => b.name === this.selectedSprintName) ?? null;
  }

  get burndownData(): BurndownRow[] {
    const sprint = this.sprintSchedule.find(s => s.name === this.selectedSprintName);
    const bucket = this.selectedBucket;
    if (!sprint || !bucket) return [];

    const sprintTasks = this.plannerTasks.filter(t =>
      Number(t.bucketId) === Number(bucket.id)
    );
    const total = sprintTasks.length;
    if (total === 0) return [];

    const workingDays: Date[] = [];
    const startD = new Date(sprint.start + 'T00:00:00');
    const endD   = new Date(sprint.end   + 'T00:00:00');
    for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
      if (d.getDay() !== 0 && d.getDay() !== 6) workingDays.push(new Date(d));
    }

    const n = workingDays.length || 10;
    const goalPerDay = total / n;
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const rows: BurndownRow[] = [];
    rows.push({ day: 0, goalPerDay: 0, complete: 0, target: total, actuals: total, targetRate: 0, actualRate: 0 });

    let prevActuals = total;
    workingDays.forEach((dayDate, idx) => {
      const dayNum = idx + 1;
      const dayEnd = new Date(dayDate.getTime());
      dayEnd.setHours(23, 59, 59, 999);

      const target = Math.max(0, Math.round(total - goalPerDay * dayNum));
      const targetRate = Math.round((dayNum / n) * 100);

      let actuals: number | null = null;
      let complete = 0;
      let actualRate: number | null = null;

      if (dayEnd <= today) {
        const doneCount = sprintTasks.filter(t =>
          (t.status === 'DONE' || t.completed) &&
          t.dueDate && new Date(t.dueDate + 'T23:59:59') <= dayEnd
        ).length;
        actuals = Math.max(0, total - doneCount);
        complete = Math.max(0, prevActuals - actuals);
        actualRate = Math.round(((total - actuals) / total) * 100);
        prevActuals = actuals;
      }

      rows.push({ day: dayNum, goalPerDay, complete, target, actuals, targetRate, actualRate });
    });

    return rows;
  }

  get burndownSummary(): { total: number; remaining: number | null; completed: number } {
    const rows = this.burndownData;
    if (rows.length === 0) return { total: 0, remaining: null, completed: 0 };
    const total = rows[0].target;
    const last = rows[rows.length - 1];
    const remaining = last.actuals;
    return {
      total,
      remaining,
      completed: remaining !== null ? total - remaining : 0,
    };
  }

  get burndownChartConfig(): BurndownChartConfig {
    const empty: BurndownChartConfig = {
      total: 0, bars: [], actualLine: '', actualPts: [],
      yTicks: [], xLabels: [], chartX: 55, baseY: 265
    };
    const rows = this.burndownData;
    if (rows.length < 2) return empty;

    const cX = 55, cY = 30, cW = 610, cH = 230;
    const baseY = cY + cH;
    const total = rows[0].target;
    const numDays = rows.length - 1;
    const slotW = cW / numDays;
    const barW = slotW * 0.55;
    const maxVal = total * 1.12;

    const ys = (v: number) => cY + cH - (v / maxVal) * cH;
    const cx = (i: number) => cX + (i - 0.5) * slotW;
    const bx = (i: number) => cx(i) - barW / 2;

    const bars = rows.slice(1).map((row, idx) => {
      const i = idx + 1;
      const yTop = ys(row.target);
      return { x: bx(i), y: yTop, w: barW, h: baseY - yTop, val: row.target, dayLabel: i };
    });

    const actualPts: { x: number; y: number; val: number; day: number }[] = [];
    rows.filter(r => r.actuals !== null).forEach(row => {
      const x = row.day === 0 ? cX : cx(row.day);
      actualPts.push({ x, y: ys(row.actuals!), val: row.actuals!, day: row.day });
    });

    const actualLine = actualPts.map((p, i) =>
      i === 0 ? `M${p.x.toFixed(1)},${p.y.toFixed(1)}` : `L${p.x.toFixed(1)},${p.y.toFixed(1)}`
    ).join(' ');

    const tickCount = 4;
    const yTicks = Array.from({ length: tickCount + 1 }, (_, i) => ({
      y: ys(total * (i / tickCount)),
      label: Math.round(total * (i / tickCount)),
    }));

    const xLabels = Array.from({ length: numDays }, (_, idx) => ({
      x: cx(idx + 1),
      label: idx + 1,
    }));

    return { total, bars, actualLine, actualPts, yTicks, xLabels, chartX: cX, baseY };
  }

  private buildCapacityData(sprint: { name: string; start: string; end: string }): void {
    const leaveStatuses = new Set(['Leave', 'SL', 'VL', 'SLwPay', 'LWOP', 'Absent', 'PL', 'ML', 'BL']);
    const startDate = new Date(sprint.start + 'T00:00:00');
    const endDate   = new Date(sprint.end   + 'T00:00:00');
    const workingDays: { year: number; month: number; day: number }[] = [];

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay();
      if (dow !== 0 && dow !== 6) workingDays.push({ year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() });
    }

    this.capacityData = {};
    this.plannerGroupMembers.forEach(member => {
      const leaveDays = workingDays.filter(wd =>
        this.capacityAttendance.some(e =>
          e.eid === member.eid && e.year === wd.year && e.month === wd.month && e.day === wd.day &&
          leaveStatuses.has(e.status)
        )
      ).length;

      const availHours = (workingDays.length - leaveDays) * 8;
      const memberTasks = this.selectedBucket
        ? this.plannerTasks.filter(t =>
            Number(t.bucketId) === Number(this.selectedBucket!.id) &&
            t.assignee === member.eid && !t.completed
          )
        : [];
      const tasks = memberTasks.length;
      const storyPoints = memberTasks.reduce((sum, t) => sum + this.getTaskStoryPoints(t), 0);
      const utilPct = availHours > 0 ? Math.round((storyPoints * 8 / availHours) * 100) : 0;

      const pto = leaveDays;
      const entry = this.capacityEntries[member.eid] ?? { cadence: 0, admin: 0, holiday: 0 };
      const { cadence, admin, holiday } = entry;
      const capacity = Math.max(0, workingDays.length - pto - cadence - admin - holiday);

      const trainingHours = parseFloat((capacity * 8 * 0.4).toFixed(1));
      const deliveryHours = parseFloat((capacity * 8 * 0.6).toFixed(1));
      const totalHours = capacity * 8;
      const trainingSP = Math.round(capacity * 0.4);
      const deliverySP = Math.round(capacity * 0.6);
      const totalSP = trainingSP + deliverySP;

      this.capacityData[member.eid] = {
        totalDays: workingDays.length, leaveDays, availHours, tasks, storyPoints, utilPct,
        pto, cadence, admin, holiday, capacity,
        trainingHours, deliveryHours, totalHours, trainingSP, deliverySP, totalSP
      };
    });
  }

  private silentRefreshCapacity(): void {
    const sprint = this.sprintSchedule.find(s => s.name === this.selectedSprintName);
    if (!sprint || !this.selectedBoard) return;

    const startDate = new Date(sprint.start + 'T00:00:00');
    const endDate   = new Date(sprint.end   + 'T00:00:00');
    const monthSet  = new Set<string>();
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      monthSet.add(`${d.getFullYear()}-${d.getMonth() + 1}`);
    }

    const monthKeys = Array.from(monthSet);
    let fresh: AttendanceEntry[] = [];
    let remaining = monthKeys.length;

    const done = () => {
      this.capacityAttendance = fresh;
      this.http.get<PlannerTask[]>(this.sharedData.apiUrl(`/api/planner-tasks?boardId=${this.selectedBoard!.id}`)).subscribe({
        next: tasks => { this.plannerTasks = tasks; this.buildCapacityData(sprint); }
      });
    };

    monthKeys.forEach(m => {
      const [y, mo] = m.split('-');
      this.http.get<AttendanceEntry[]>(this.sharedData.apiUrl(`/api/attendance?year=${y}&month=${mo}`)).subscribe({
        next: entries => { fresh = [...fresh, ...entries]; if (--remaining === 0) done(); },
        error: ()      => { if (--remaining === 0) done(); }
      });
    });
  }

  private startCapacityPolling(): void {
    this.stopCapacityPolling();
    this.capacityPollInterval = setInterval(() => {
      if (!this.capacityOpen || !this.selectedBoard) return;
      this.silentRefreshCapacity();
    }, 2500);
  }

  private stopCapacityPolling(): void {
    if (this.capacityPollInterval !== null) {
      clearInterval(this.capacityPollInterval);
      this.capacityPollInterval = null;
    }
  }

  private emptyTask(): PlannerTask {
    return {
      boardId: 0, bucketId: 0, title: '',
      status: 'Not started', priority: 'Medium',
      startDate: '', dueDate: '',
      labels: [], assignee: '',
      checklist: [], description: '', acceptanceCriteria: '', comments: [],
      completed: false, createdAt: '', updatedAt: ''
    };
  }
}
