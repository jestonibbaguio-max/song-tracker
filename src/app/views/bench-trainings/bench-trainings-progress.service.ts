import { Injectable } from '@angular/core';
import { Observable, of, delay, tap } from 'rxjs';

/** One resource's checklist state — the set of course ids they have completed. */
export interface BenchTrainingsProgress {
  eid: string;
  completedCourseIds: string[];
}

export interface BenchTrainingsProgressSaveResult {
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
export class BenchTrainingsProgressService {
  private readonly progressByEid = new Map<string, Set<string>>();

  /** Simulates GET /api/trainings-progress/:eid */
  getProgress(eid: string): Observable<BenchTrainingsProgress> {
    const completedCourseIds = [...(this.progressByEid.get(eid) ?? [])];
    return of({ eid, completedCourseIds }).pipe(delay(200));
  }

  /** Simulates PATCH /api/trainings-progress/:eid — called on checkbox click. */
  setCourseCompleted(eid: string, courseId: string, completed: boolean): Observable<BenchTrainingsProgressSaveResult> {
    const result: BenchTrainingsProgressSaveResult = {
      eid,
      courseId,
      completed,
      savedAt: new Date().toISOString(),
    };
    return of(result).pipe(
      // TEMPORARY: raised from 300ms so the "Saving…" indicator and the resource
      // lock are visible while this is still in-memory. Restore (or remove) once
      // saving hits a real endpoint.
      delay(1200),
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
