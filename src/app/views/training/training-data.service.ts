import { Injectable } from '@angular/core';
import { Observable, of, delay } from 'rxjs';
import { TrainingTrack, TRAINING_TRACKS_BY_GROUP } from './training-mock-data';

@Injectable({ providedIn: 'root' })
export class TrainingDataService {
  getTracksForGroup(group: string): Observable<TrainingTrack[]> {
    const tracks = TRAINING_TRACKS_BY_GROUP[group] ?? [];
    return of(tracks).pipe(delay(250));
  }
}
