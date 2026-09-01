import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SharedDataService } from '../../services/shared-data.service';
import { OnboardingResource } from '../../models/types';
import { TrainingsProgressService } from './trainings-progress.service';

export interface TrainingsCourse {
  id: string;
  title: string;
  length: string;
  link: string;
}

@Component({
  selector: 'app-trainings',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './trainings.component.html',
  styleUrl: './trainings.component.css'
})
export class TrainingsComponent implements OnInit {
  // Temporary dummy data until the trainings feature is wired to a data service.
  courses: TrainingsCourse[] = [
    {
      id: 'dummy-1',
      title: 'Sample Training Course',
      length: '2h 30m',
      link: 'https://example.com',
    },
  ];

  selectedEid = '';
  progressLoading = false;
  savingCourseId: string | null = null;
  progressError = '';

  private completedCourseIds = new Set<string>();

  constructor(private trainingsProgress: TrainingsProgressService, public sharedData: SharedDataService) {}

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

  toggleCompleted(courseId: string, completed: boolean): void {
    if (!this.selectedEid) return;

    // Optimistic — the checkbox reflects the click immediately, and rolls back on failure.
    this.applyCompleted(courseId, completed);
    this.progressError = '';
    this.savingCourseId = courseId;

    this.trainingsProgress.setCourseCompleted(this.selectedEid, courseId, completed).subscribe({
      next: () => { this.savingCourseId = null; },
      error: () => {
        this.applyCompleted(courseId, !completed);
        this.savingCourseId = null;
        this.progressError = 'Could not save progress. Please try again.';
      }
    });
  }

  removeCourse(course: TrainingsCourse): void {
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
    this.savingCourseId = null;
    if (!this.selectedEid) {
      this.completedCourseIds = new Set<string>();
      return;
    }
    this.progressLoading = true;
    this.trainingsProgress.getProgress(this.selectedEid).subscribe(progress => {
      this.completedCourseIds = new Set(progress.completedCourseIds);
      this.progressLoading = false;
    });
  }
}
