import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SharedDataService } from '../../services/shared-data.service';
import { OnboardingResource } from '../../models/types';
import { BenchTrainingsProgressService } from './bench-trainings-progress.service';

export interface BenchTrainingsCourse {
  id: string;
  title: string;
  length: string;
  link: string;
}

@Component({
  selector: 'app-bench-trainings',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './bench-trainings.component.html',
  styleUrl: './bench-trainings.component.css'
})
export class BenchTrainingsComponent implements OnInit {
  // Stable ids: progress is keyed by course id, so ids minted per construction
  // (crypto.randomUUID()) orphaned all stored progress on every remount.
  courses: BenchTrainingsCourse[] = [
    { id: 'bench-1', title: 'TQ Training on Udacity', length: '', link: 'https://www.udacity.com/learning-plan/tq-at-accenture' },
    { id: 'bench-2', title: 'Ethics and Compliance', length: '', link: 'https://wd103.myworkday.com/accenture/learning/viewmore/6964690f7fd810001c749ba92ee68ceb' },
    { id: 'bench-3', title: 'ISA Advocate', length: '', link: 'https://isadvocate.accenture.com/' },
    { id: 'bench-4', title: 'GenAI', length: '', link: 'https://atci.lkm.delivery.accenture.com/TT/Automation/genAI' },
  ];

  selectedEid = '';
  progressLoading = false;
  /** One save at a time: while true, every checkbox and the resource picker are locked. */
  saving = false;
  progressError = '';
  newCourse = { title: '', length: '', link: '' };

  private completedCourseIds = new Set<string>();

  constructor(private trainingsProgress: BenchTrainingsProgressService, public sharedData: SharedDataService) {}

  ngOnInit(): void {
    if (this.sharedData.onboardingResources.length === 0) {
      this.sharedData.loadOnboardingResources();
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

  get completedCount(): number {
    return this.courses.filter(c => this.completedCourseIds.has(c.id)).length;
  }

  onResourceChange(): void {
    this.loadProgress();
  }

  isCompleted(courseId: string): boolean {
    return this.completedCourseIds.has(courseId);
  }

  toggleCompleted(courseId: string, event: Event): void {
    // Cancel the browser's own flip so [checked] is the only writer of the box;
    // otherwise an early return below would leave it ticked against the model.
    event.preventDefault();
    if (!this.selectedEid || this.saving) return;

    const eid = this.selectedEid;
    const completed = !this.isCompleted(courseId);

    // Optimistic — the checkbox reflects the click immediately, and rolls back on failure.
    // The resource picker is locked until this settles, so the rollback can't land on another resource.
    this.applyCompleted(courseId, completed);
    this.progressError = '';
    this.saving = true;

    this.trainingsProgress.setCourseCompleted(eid, courseId, completed).subscribe({
      next: () => { this.saving = false; },
      error: () => {
        this.applyCompleted(courseId, !completed);
        this.saving = false;
        this.progressError = 'Could not save progress. Please try again.';
      }
    });
  }

  addCourse(): void {
    const title = this.newCourse.title.trim();
    if (!title) return;
    this.courses.push({
      id: crypto.randomUUID(),
      title,
      length: this.newCourse.length.trim(),
      link: this.newCourse.link.trim(),
    });
    this.newCourse = { title: '', length: '', link: '' };
  }

  removeCourse(course: BenchTrainingsCourse): void {
    this.courses = this.courses.filter(c => c.id !== course.id);
  }

  private applyCompleted(courseId: string, completed: boolean): void {
    if (completed) {
      this.completedCourseIds.add(courseId);
    } else {
      this.completedCourseIds.delete(courseId);
    }
  }

  private loadProgress(): void {
    this.progressError = '';
    // Clear up front so the previous resource's ticks never show under this one.
    this.completedCourseIds = new Set<string>();
    if (!this.selectedEid) return;

    this.progressLoading = true;
    this.trainingsProgress.getProgress(this.selectedEid).subscribe(progress => {
      // A read superseded by a newer selection is dropped, not rendered.
      if (progress.eid !== this.selectedEid) return;
      this.completedCourseIds = new Set(progress.completedCourseIds);
      this.progressLoading = false;
    });
  }
}
