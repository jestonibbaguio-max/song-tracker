import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SharedDataService } from '../../services/shared-data.service';
import { OnboardingResource, ProjectReachout } from '../../models/types';
import { ReachoutDataService, ReachoutPayload, REACHOUT_DEFAULT_STATUS, REACHOUT_STATUSES } from './reachout-data.service';

interface ReachoutForm {
  eid: string;
  projectName: string;
  techRole: string;
  pocEid: string;
  status: string;
  details: string;
  groupNumber: string;
}

function emptyForm(): ReachoutForm {
  return {
    eid: '',
    projectName: '',
    techRole: '',
    pocEid: '',
    status: REACHOUT_DEFAULT_STATUS,
    details: '',
    groupNumber: '',
  };
}

@Component({
  selector: 'app-reachout',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './reachout.component.html',
  styleUrl: './reachout.component.css'
})
export class ReachoutComponent implements OnInit {
  /** Groups a reachout can belong to. Wider than the sidebar list, which stops at 5. */
  readonly groupNumbers = [1, 2, 3, 4, 5, 6];
  readonly statuses = REACHOUT_STATUSES;

  reachouts: ProjectReachout[] = [];
  loading = true;
  loadError = '';

  /** Id of the row whose status dropdown is mid-save, so only that one locks. */
  savingStatusId: number | null = null;
  statusError = '';

  formDialog = {
    open: false,
    mode: 'add' as 'add' | 'edit',
    id: null as number | null,
    saving: false,
    error: '',
    fields: emptyForm(),
  };

  deleteDialog = {
    open: false,
    saving: false,
    error: '',
    reachout: null as ProjectReachout | null,
  };

  constructor(private reachoutData: ReachoutDataService, public sharedData: SharedDataService) {}

  ngOnInit(): void {
    if (this.sharedData.onboardingResources.length === 0) {
      this.sharedData.loadOnboardingResources();
    }
    this.loadReachouts();
  }

  /**
   * Rows for the group picked in the sidebar — every row when "All Groups" is selected.
   * Filtering here rather than on the server keeps the table in step with the sidebar without a refetch.
   */
  get visibleReachouts(): ProjectReachout[] {
    const group = this.sharedData.attendanceGroup;
    if (!group) return this.reachouts;
    return this.reachouts.filter(r => String(r.groupNumber) === String(group));
  }

  /** EID suggestions for the form, so a reachout can be tied to a known resource. */
  get resourceOptions(): OnboardingResource[] {
    return [...this.sharedData.onboardingResources]
      .sort((a, b) => String(a.eid ?? '').localeCompare(String(b.eid ?? '')));
  }

  get isFormValid(): boolean {
    const f = this.formDialog.fields;
    return !!(f.eid.trim() && f.projectName.trim() && f.techRole.trim() && f.pocEid.trim());
  }

  resourceName(eid: string): string {
    return this.sharedData.onboardingResources.find(r => r.eid === eid)?.name ?? '';
  }

  /** Base pill class plus a slug class per status, e.g. 'reachout-status reachout-status-cv-requested'. */
  statusClasses(status: string): string {
    const slug = (status || REACHOUT_DEFAULT_STATUS).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return `reachout-status reachout-status-${slug}`;
  }

  /** A status saved before the list changed still needs an option, or its row would render blank. */
  statusOptions(status: string): string[] {
    const known = this.statuses as readonly string[];
    return status && !known.includes(status) ? [status, ...known] : [...known];
  }

  /** Inline edit from the table — saves on pick, and puts the old value back if the save fails. */
  onStatusChange(reachout: ProjectReachout, status: string): void {
    const previous = reachout.status;
    if (status === previous || this.savingStatusId !== null) return;

    reachout.status = status;
    this.savingStatusId = reachout.id;
    this.statusError = '';

    this.reachoutData.updateReachout(reachout.id, { status }).subscribe({
      next: saved => {
        this.reachouts = this.reachouts.map(r => (r.id === saved.id ? saved : r));
        this.savingStatusId = null;
      },
      error: () => {
        reachout.status = previous;
        this.savingStatusId = null;
        this.statusError = 'Could not save the status change. Please try again.';
      },
    });
  }

  // ── Add / edit dialog ──────────────────────────────────────────────────────

  openAddDialog(): void {
    const fields = emptyForm();
    // Pre-fill the group with whatever the sidebar is filtered to, so a new row stays visible.
    fields.groupNumber = this.sharedData.attendanceGroup ?? '';
    this.formDialog = { open: true, mode: 'add', id: null, saving: false, error: '', fields };
  }

  openEditDialog(reachout: ProjectReachout): void {
    this.formDialog = {
      open: true,
      mode: 'edit',
      id: reachout.id,
      saving: false,
      error: '',
      fields: {
        eid: reachout.eid ?? '',
        projectName: reachout.projectName ?? '',
        techRole: reachout.techRole ?? '',
        pocEid: reachout.pocEid ?? '',
        status: reachout.status || REACHOUT_DEFAULT_STATUS,
        details: reachout.details ?? '',
        groupNumber: reachout.groupNumber == null ? '' : String(reachout.groupNumber),
      },
    };
  }

  closeFormDialog(): void {
    if (this.formDialog.saving) return;
    this.formDialog.open = false;
  }

  /** The group follows the resource, so typing a known EID fills it in without extra work. */
  onFormEidChange(): void {
    const eid = this.formDialog.fields.eid.trim().toLowerCase();
    const match = this.sharedData.onboardingResources.find(r => r.eid === eid);
    if (match?.groupNumber != null) {
      this.formDialog.fields.groupNumber = String(match.groupNumber);
    }
  }

  saveReachout(): void {
    if (!this.isFormValid || this.formDialog.saving) return;

    const f = this.formDialog.fields;
    const payload: ReachoutPayload = {
      eid: f.eid.trim(),
      projectName: f.projectName.trim(),
      techRole: f.techRole.trim(),
      pocEid: f.pocEid.trim(),
      status: f.status.trim() || REACHOUT_DEFAULT_STATUS,
      details: f.details.trim(),
      groupNumber: f.groupNumber ? Number(f.groupNumber) : null,
    };

    this.formDialog.saving = true;
    this.formDialog.error = '';

    const request = this.formDialog.mode === 'edit' && this.formDialog.id != null
      ? this.reachoutData.updateReachout(this.formDialog.id, payload)
      : this.reachoutData.createReachout(payload);

    request.subscribe({
      next: saved => {
        if (this.formDialog.mode === 'edit') {
          this.reachouts = this.reachouts.map(r => (r.id === saved.id ? saved : r));
        } else {
          this.reachouts = [...this.reachouts, saved];
        }
        this.formDialog.saving = false;
        this.formDialog.open = false;
      },
      error: err => {
        this.formDialog.saving = false;
        this.formDialog.error = err?.error?.error || 'Could not save the reachout. Please try again.';
      },
    });
  }

  // ── Delete dialog ──────────────────────────────────────────────────────────

  openDeleteDialog(reachout: ProjectReachout): void {
    this.deleteDialog = { open: true, saving: false, error: '', reachout };
  }

  closeDeleteDialog(): void {
    if (this.deleteDialog.saving) return;
    this.deleteDialog.open = false;
    this.deleteDialog.reachout = null;
  }

  confirmDelete(): void {
    const reachout = this.deleteDialog.reachout;
    if (!reachout || this.deleteDialog.saving) return;

    this.deleteDialog.saving = true;
    this.deleteDialog.error = '';

    this.reachoutData.deleteReachout(reachout.id).subscribe({
      next: () => {
        this.reachouts = this.reachouts.filter(r => r.id !== reachout.id);
        this.deleteDialog = { open: false, saving: false, error: '', reachout: null };
      },
      error: () => {
        this.deleteDialog.saving = false;
        this.deleteDialog.error = 'Could not delete the reachout. Please try again.';
      },
    });
  }

  private loadReachouts(): void {
    this.loading = true;
    this.loadError = '';
    this.reachoutData.getReachouts().subscribe({
      next: reachouts => {
        this.reachouts = reachouts;
        this.loading = false;
      },
      error: () => {
        this.reachouts = [];
        this.loading = false;
        this.loadError = 'Could not load reachouts. Check that the API is running.';
      },
    });
  }
}
