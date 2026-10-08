import { Component, DoCheck, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SharedDataService } from '../../services/shared-data.service';
import { OnboardingResource } from '../../models/types';
import { GroupTrainingsDataService } from './group-trainings-data.service';
import { GroupTrainingsProgressService } from './group-trainings-progress.service';
import { GroupTrainingsTrack } from './group-trainings-mock-data';

@Component({
  selector: 'app-group-trainings',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './group-trainings.component.html',
  styleUrl: './group-trainings.component.css'
})
export class GroupTrainingsComponent implements OnInit, DoCheck {
  tracks: GroupTrainingsTrack[] = [];
  activeTab = '';
  loading = true;
  newCourse = { title: '', length: '', link: '' };

  selectedEid = '';
  progressLoading = false;
  /** One save at a time: while true, every checkbox, the track tabs and the resource picker are locked. */
  saving = false;
  progressError = '';

  private completedCourseKeys = new Set<string>();
  private lastGroup: string | null = null;

  constructor(
    private trainingData: GroupTrainingsDataService,
    private trainingProgress: GroupTrainingsProgressService,
    public sharedData: SharedDataService
  ) {}

  ngOnInit(): void {
    if (this.sharedData.onboardingResources.length === 0) {
      this.sharedData.loadOnboardingResources();
    }
    this.loadTracks(this.sharedData.attendanceGroup);
  }

  ngDoCheck(): void {
    if (this.sharedData.attendanceGroup !== this.lastGroup) {
      this.loadTracks(this.sharedData.attendanceGroup);
    }
  }

  /** Resources of the group currently selected in the sidebar, same rule as the Resources list. */
  get groupMembers(): OnboardingResource[] {
    const group = this.sharedData.attendanceGroup;
    const members = group
      ? this.sharedData.onboardingResources.filter(r => String(r.groupNumber) === String(group))
      : [...this.sharedData.onboardingResources];
    return members.sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? '')));
  }

  get selectedMemberName(): string {
    return this.groupMembers.find(m => m.eid === this.selectedEid)?.name ?? '';
  }

  get activeTrack(): GroupTrainingsTrack | undefined {
    return this.tracks.find(t => t.id === this.activeTab);
  }

  /** Completed count for the track on screen, so the bar matches the visible table. */
  get completedCount(): number {
    const track = this.activeTrack;
    if (!track) return 0;
    return track.courses.filter(c => this.isCompleted(track.id, c.id)).length;
  }

  get activeCourseCount(): number {
    return this.activeTrack?.courses.length ?? 0;
  }

  selectTab(id: string): void {
    if (this.saving) return;
    this.activeTab = id;
    this.newCourse = { title: '', length: '', link: '' };
  }

  onResourceChange(): void {
    this.loadProgress();
  }

  isCompleted(trackId: string, courseId: string): boolean {
    return this.completedCourseKeys.has(GroupTrainingsProgressService.key(trackId, courseId));
  }

  toggleCompleted(trackId: string, courseId: string, event: Event): void {
    // Cancel the browser's own flip so [checked] is the only writer of the box;
    // otherwise an early return below would leave it ticked against the model.
    event.preventDefault();
    if (!this.selectedEid || this.saving) return;

    const eid = this.selectedEid;
    const completed = !this.isCompleted(trackId, courseId);

    // Optimistic — the checkbox reflects the click immediately, and rolls back on failure.
    this.applyCompleted(trackId, courseId, completed);
    this.progressError = '';
    this.saving = true;

    this.trainingProgress.setCourseCompleted(eid, trackId, courseId, completed).subscribe({
      next: () => { this.saving = false; },
      error: () => {
        this.saving = false;
        // The resource picker is locked mid-save, but a sidebar group change can
        // still clear the selection; a late rollback must not land on what is shown now.
        if (this.selectedEid !== eid) return;
        this.applyCompleted(trackId, courseId, !completed);
        this.progressError = 'Could not save progress. Please try again.';
      }
    });
  }

  addCourse(track: GroupTrainingsTrack): void {
    const title = this.newCourse.title.trim();
    if (!title) return;
    track.courses.push({
      id: crypto.randomUUID(),
      title,
      length: this.newCourse.length.trim(),
      link: this.newCourse.link.trim(),
    });
    this.newCourse = { title: '', length: '', link: '' };
  }

  removeCourse(track: GroupTrainingsTrack, course: GroupTrainingsTrack['courses'][number]): void {
    track.courses = track.courses.filter(c => c.id !== course.id);
  }

  private applyCompleted(trackId: string, courseId: string, completed: boolean): void {
    const key = GroupTrainingsProgressService.key(trackId, courseId);
    if (completed) {
      this.completedCourseKeys.add(key);
    } else {
      this.completedCourseKeys.delete(key);
    }
  }

  private loadProgress(): void {
    this.progressError = '';
    // Clear up front so the previous resource's ticks never show under this one.
    this.completedCourseKeys = new Set<string>();
    if (!this.selectedEid) {
      this.progressLoading = false;
      return;
    }

    this.progressLoading = true;
    this.trainingProgress.getProgress(this.selectedEid).subscribe(progress => {
      // A read superseded by a newer selection is dropped, not rendered.
      if (progress.eid !== this.selectedEid) return;
      this.completedCourseKeys = new Set(progress.completedCourseIds);
      this.progressLoading = false;
    });
  }

  private loadTracks(group: string): void {
    this.lastGroup = group;
    this.loading = true;
    // The picker only lists the current group's resources, so the old pick no longer applies.
    this.selectedEid = '';
    this.loadProgress();
    this.trainingData.getTracksForGroup(group).subscribe(tracks => {
      // Tracks for a group the sidebar has since moved off are dropped.
      if (group !== this.lastGroup) return;
      this.tracks = tracks;
      this.activeTab = tracks[0]?.id ?? '';
      this.newCourse = { title: '', length: '', link: '' };
      this.loading = false;
    });
  }
}
