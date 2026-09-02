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
  courses: TrainingsCourse[] = [
    { id: crypto.randomUUID(), title: 'TQ Training on Udacity', length: '', link: 'https://www.udacity.com/learning-plan/tq-at-accenture' },
    { id: crypto.randomUUID(), title: 'Ethics and Compliance', length: '', link: 'https://wd103.myworkday.com/accenture/learning/viewmore/6964690f7fd810001c749ba92ee68ceb' },
    { id: crypto.randomUUID(), title: 'ISA Advocate', length: '', link: 'https://isadvocate.accenture.com/' },
    { id: crypto.randomUUID(), title: 'GenAI', length: '', link: 'https://atci.lkm.delivery.accenture.com/TT/Automation/genAI' },
  ];

  selectedEid = '';
  progressLoading = false;
  savingCourseId: string | null = null;
  progressError = '';
  newCourse = { title: '', length: '', link: '' };

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
