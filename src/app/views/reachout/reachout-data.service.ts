import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ProjectReachout } from '../../models/types';
import { SharedDataService } from '../../services/shared-data.service';

/** Every reachout starts here — a CV has been asked for but nothing has been sent yet. */
export const REACHOUT_DEFAULT_STATUS = 'CV Requested';

/** Pipeline a reachout moves through, earliest stage first. */
export const REACHOUT_STATUSES = [
  REACHOUT_DEFAULT_STATUS,
  'Interview Scheduled',
  'Passed',
  'Failed',
  'Pending Update',
] as const;

export type ReachoutPayload = Omit<ProjectReachout, 'id' | 'createdAt' | 'updatedAt'>;

@Injectable({ providedIn: 'root' })
export class ReachoutDataService {
  constructor(private http: HttpClient, private sharedData: SharedDataService) {}

  /** Every reachout — the group filter is applied on the client so sidebar changes are instant. */
  getReachouts(): Observable<ProjectReachout[]> {
    return this.http.get<ProjectReachout[]>(this.sharedData.apiUrl('/api/project-reachouts'));
  }

  createReachout(payload: ReachoutPayload): Observable<ProjectReachout> {
    return this.http.post<ProjectReachout>(this.sharedData.apiUrl('/api/project-reachouts'), payload);
  }

  /** Partial by design — the dialog sends every field, the inline status dropdown sends only `status`. */
  updateReachout(id: number, payload: Partial<ReachoutPayload>): Observable<ProjectReachout> {
    return this.http.patch<ProjectReachout>(this.sharedData.apiUrl(`/api/project-reachouts/${id}`), payload);
  }

  deleteReachout(id: number): Observable<{ deleted: boolean }> {
    return this.http.delete<{ deleted: boolean }>(this.sharedData.apiUrl(`/api/project-reachouts/${id}`));
  }
}
