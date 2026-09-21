import { Component, DoCheck, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SharedDataService } from '../../services/shared-data.service';
import { OnboardingResource } from '../../models/types';
import { TrainingDataService } from './training-data.service';
import { TrainingProgressService } from './training-progress.service';
import { TrainingTrack } from './training-mock-data';

@Component({
  selector: 'app-training',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './training.component.html',
  styleUrl: './training.component.css'
})
export class TrainingComponent implements OnInit, DoCheck {
  tracks: TrainingTrack[] = [];
  activeTab = '';
  loading = true;
  newCourse = { title: '', length: '', link: '' };

  selectedEid = '';
  progressLoading = false;
  savingCourseKey: string | null = null;
  progressError = '';

  private completedCourseKeys = new Set<string>();
  private lastGroup: string | null = null;

  constructor(
    private trainingData: TrainingDataService,
    private trainingProgress: TrainingProgressService,
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

  get activeTrack(): TrainingTrack | undefined {
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
    this.activeTab = id;
    this.newCourse = { title: '', length: '', link: '' };
  }

  onResourceChange(): void {
    this.loadProgress();
  }

  isCompleted(trackId: string, courseId: string): boolean {
    return this.completedCourseKeys.has(TrainingProgressService.key(trackId, courseId));
  }

  isSaving(trackId: string, courseId: string): boolean {
    return this.savingCourseKey === TrainingProgressService.key(trackId, courseId);
  }

  toggleCompleted(trackId: string, courseId: string, completed: boolean): void {
    if (!this.selectedEid) return;

    // Optimistic — the checkbox reflects the click immediately, and rolls back on failure.
    this.applyCompleted(trackId, courseId, completed);
    this.progressError = '';
    this.savingCourseKey = TrainingProgressService.key(trackId, courseId);

    this.trainingProgress.setCourseCompleted(this.selectedEid, trackId, courseId, completed).subscribe({
      next: () => { this.savingCourseKey = null; },
      error: () => {
        this.applyCompleted(trackId, courseId, !completed);
        this.savingCourseKey = null;
        this.progressError = 'Could not save progress. Please try again.';
      }
    });
  }

  addCourse(track: TrainingTrack): void {
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

  removeCourse(track: TrainingTrack, course: TrainingTrack['courses'][number]): void {
    track.courses = track.courses.filter(c => c.id !== course.id);
  }

  private applyCompleted(trackId: string, courseId: string, completed: boolean): void {
    const key = TrainingProgressService.key(trackId, courseId);
    if (completed) {
      this.completedCourseKeys.add(key);
    } else {
      this.completedCourseKeys.delete(key);
    }
  }

  private loadProgress(): void {
    this.progressError = '';
    this.savingCourseKey = null;
    if (!this.selectedEid) {
      this.completedCourseKeys = new Set<string>();
      return;
    }
    this.progressLoading = true;
    this.trainingProgress.getProgress(this.selectedEid).subscribe(progress => {
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
      this.tracks = tracks;
      this.activeTab = tracks[0]?.id ?? '';
      this.newCourse = { title: '', length: '', link: '' };
      this.loading = false;
    });
  }
}
