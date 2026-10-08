import { Injectable } from '@angular/core';
import { Observable, of, delay } from 'rxjs';
import { GroupTrainingsTrack, GROUP_TRAININGS_TRACKS_BY_GROUP } from './group-trainings-mock-data';

@Injectable({ providedIn: 'root' })
export class GroupTrainingsDataService {
  getTracksForGroup(group: string): Observable<GroupTrainingsTrack[]> {
    const tracks = GROUP_TRAININGS_TRACKS_BY_GROUP[group] ?? [];
    return of(tracks).pipe(delay(250));
  }
}
