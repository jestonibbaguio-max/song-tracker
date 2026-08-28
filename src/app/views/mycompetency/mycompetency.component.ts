import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { SharedDataService } from '../../services/shared-data.service';
import { CompetencyRecord } from '../../models/types';

@Component({
  selector: 'app-mycompetency',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './mycompetency.component.html',
  styleUrl: './mycompetency.component.css'
})
export class MyCompetencyComponent implements OnInit {
  competencyRecords: CompetencyRecord[] = [];
  selectedCompetencyGroup = '5';

  constructor(private http: HttpClient, public sharedData: SharedDataService) {}

  ngOnInit(): void {
    this.loadCompetency();
  }

  loadCompetency(): void {
    this.http.get<CompetencyRecord[]>(this.sharedData.apiUrl(`/api/competency-records?group=${this.selectedCompetencyGroup}`)).subscribe(recs => {
      this.competencyRecords = recs;
    });
  }

  updateCompetencyField(eid: string, field: keyof CompetencyRecord, value: string): void {
    this.http.patch<CompetencyRecord>(this.sharedData.apiUrl(`/api/competency-records/${eid}`), { [field]: value }).subscribe(updated => {
      const idx = this.competencyRecords.findIndex(r => r.eid === eid);
      if (idx !== -1) this.competencyRecords[idx] = updated;
    });
  }

  isCompetencyRowGreen(rec: CompetencyRecord): boolean {
    return this.meetsMinReq(rec);
  }

  private profLevel(p: string): 'none' | 'p1' | 'p2plus' {
    if (!p || p === 'N/A' || p === 'TBD') return 'none';
    if (p === 'P1') return 'p1';
    return 'p2plus';
  }

  get competencySummary() {
    const tally = (prof: string) => ({
      completed: 0, notStarted: 0, belowP2: 0, p2AndAbove: 0, noAssessment: 0
    });
    const p = tally('primary');
    const s = tally('secondary');

    for (const rec of this.competencyRecords) {
      const pl = this.profLevel(rec.primaryProficiency);
      const sl = this.profLevel(rec.secondaryProficiency);

      if (pl === 'none') p.notStarted++;
      else { p.completed++; pl === 'p1' ? p.belowP2++ : p.p2AndAbove++; }

      const hasSecondarySkill = rec.secondarySkill && rec.secondarySkill !== 'N/A' && rec.secondarySkill !== 'TBD';
      if (!hasSecondarySkill && sl === 'none') { s.noAssessment++; }
      else if (sl === 'none') s.notStarted++;
      else { s.completed++; sl === 'p1' ? s.belowP2++ : s.p2AndAbove++; }
    }
    return { primary: p, secondary: s };
  }

  meetsMinReq(rec: CompetencyRecord): boolean {
    const cl = Number(rec.clLevel);
    const prof = rec.primaryProficiency;
    if (cl === 11 || cl === 12) {
      return /^P([2-9]|\d{2,})(\+)?$/.test(prof);
    }
    return /^P([3-9]|\d{2,})(\+)?$/.test(prof);
  }

  get competencyMeetReq() {
    return {
      primaryMet: this.competencyRecords.filter(r => this.meetsMinReq(r)).length,
      primaryTotal: this.competencyRecords.length,
      secondaryMet: this.competencyRecords.filter(r =>
        r.secondarySkill && r.secondarySkill !== 'N/A' && r.secondarySkill !== 'TBD' &&
        /^P([3-9]|\d{2,})(\+)?$/.test(r.secondaryProficiency)
      ).length
    };
  }
}
