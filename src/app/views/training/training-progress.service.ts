import { Injectable } from '@angular/core';
import { Observable, of, delay, tap } from 'rxjs';

/** One resource's checklist state — the course ids they have completed, per training track. */
export interface TrainingProgress {
  eid: string;
  completedCourseIds: string[];
}

export interface TrainingProgressSaveResult {
  eid: string;
  trackId: string;
  courseId: string;
  completed: boolean;
  savedAt: string;
}

/**
 * Placeholder for the future training-progress API. Nothing is persisted —
 * state lives in memory for the lifetime of the page and is lost on reload.
 * Swap the `of(...)` calls for HttpClient requests when the backend exists:
 *   GET   /api/training-progress/:eid
 *   PATCH /api/training-progress/:eid
 */
@Injectable({ providedIn: 'root' })
export class TrainingProgressService {
  private readonly progressByEid = new Map<string, Set<string>>();

  /** Course ids are only unique inside a track, so progress is stored under a track-scoped key. */
  static key(trackId: string, courseId: string): string {
    return `${trackId}::${courseId}`;
  }

  /** Simulates GET /api/training-progress/:eid */
  getProgress(eid: string): Observable<TrainingProgress> {
    const completedCourseIds = [...(this.progressByEid.get(eid) ?? [])];
    return of({ eid, completedCourseIds }).pipe(delay(200));
  }

  /** Simulates PATCH /api/training-progress/:eid — called on checkbox click. */
  setCourseCompleted(eid: string, trackId: string, courseId: string, completed: boolean): Observable<TrainingProgressSaveResult> {
    const result: TrainingProgressSaveResult = {
      eid,
      trackId,
      courseId,
      completed,
      savedAt: new Date().toISOString(),
    };
    return of(result).pipe(
      delay(300),
      tap(() => {
        const completedCourseIds = this.progressByEid.get(eid) ?? new Set<string>();
        const key = TrainingProgressService.key(trackId, courseId);
        if (completed) {
          completedCourseIds.add(key);
        } else {
          completedCourseIds.delete(key);
        }
        this.progressByEid.set(eid, completedCourseIds);
      })
    );
  }
}
