import { Injectable } from '@angular/core';
import { Observable, of, delay, tap } from 'rxjs';

/** One resource's checklist state — the set of course ids they have completed. */
export interface TrainingsProgress {
  eid: string;
  completedCourseIds: string[];
}

export interface TrainingsProgressSaveResult {
  eid: string;
  courseId: string;
  completed: boolean;
  savedAt: string;
}

/**
 * Placeholder for the future trainings-progress API. Nothing is persisted —
 * state lives in memory for the lifetime of the page and is lost on reload.
 * Swap the `of(...)` calls for HttpClient requests when the backend exists:
 *   GET   /api/trainings-progress/:eid
 *   PATCH /api/trainings-progress/:eid
 */
@Injectable({ providedIn: 'root' })
export class TrainingsProgressService {
  private readonly progressByEid = new Map<string, Set<string>>();

  /** Simulates GET /api/trainings-progress/:eid */
  getProgress(eid: string): Observable<TrainingsProgress> {
    const completedCourseIds = [...(this.progressByEid.get(eid) ?? [])];
    return of({ eid, completedCourseIds }).pipe(delay(200));
  }

  /** Simulates PATCH /api/trainings-progress/:eid — called on checkbox click. */
  setCourseCompleted(eid: string, courseId: string, completed: boolean): Observable<TrainingsProgressSaveResult> {
    const result: TrainingsProgressSaveResult = {
      eid,
      courseId,
      completed,
      savedAt: new Date().toISOString(),
    };
    return of(result).pipe(
      delay(300),
      tap(() => {
        const completedCourseIds = this.progressByEid.get(eid) ?? new Set<string>();
        if (completed) {
          completedCourseIds.add(courseId);
        } else {
          completedCourseIds.delete(courseId);
        }
        this.progressByEid.set(eid, completedCourseIds);
      })
    );
  }
}
