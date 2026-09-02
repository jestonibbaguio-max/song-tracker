import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class PocHowToContentService {
  // In-memory only — saves last for the session, a page refresh restores defaults.
  private content: Record<string, string> = {};

  constructor(private http: HttpClient) {}

  getContent(tabId: string): Observable<string> {
    const saved = this.content[tabId];
    if (saved !== undefined) return of(saved);

    return this.http.get(`/poc-howto/${tabId}.html`, { responseType: 'text' })
      .pipe(catchError(() => of('')));
  }

  saveContent(tabId: string, html: string): Observable<void> {
    this.content[tabId] = html;
    return of(undefined);
  }
}
