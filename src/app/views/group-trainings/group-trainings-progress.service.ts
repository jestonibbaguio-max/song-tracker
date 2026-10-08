import { Injectable } from '@angular/core';
import { Observable, of, delay, tap } from 'rxjs';

/** One resource's checklist state — the course ids they have completed, per training track. */
export interface GroupTrainingsProgress {
  eid: string;
  completedCourseIds: string[];
}

export interface GroupTrainingsProgressSaveResult {
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
export class GroupTrainingsProgressService {
  private readonly progressByEid = new Map<string, Set<string>>();

  /** Course ids are only unique inside a track, so progress is stored under a track-scoped key. */
  static key(trackId: string, courseId: string): string {
    return `${trackId}::${courseId}`;
  }

  /** Simulates GET /api/training-progress/:eid */
  getProgress(eid: string): Observable<GroupTrainingsProgress> {
    const completedCourseIds = [...(this.progressByEid.get(eid) ?? [])];
    return of({ eid, completedCourseIds }).pipe(delay(200));
  }

  /** Simulates PATCH /api/training-progress/:eid — called on checkbox click. */
  setCourseCompleted(eid: string, trackId: string, courseId: string, completed: boolean): Observable<GroupTrainingsProgressSaveResult> {
    const result: GroupTrainingsProgressSaveResult = {
      eid,
      trackId,
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
        const key = GroupTrainingsProgressService.key(trackId, courseId);
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
