import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface MockAssessmentRow {
  stream: string;
  totalResources: number;
  scheduled: string | number;
  totalConducted: number;
  totalPassed: number;
  totalFailed: string | number;
  passRate: string;  // e.g., "85%" or "85.5%"
  failRate: string | number;  // e.g., "15%" or "14.5%"
}

export interface MockAssessmentSummary {
  id?: number;
  title: string;
  rows: MockAssessmentRow[];
  highlights: string[];
}

@Component({
  selector: 'app-mock-assessment',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './mock-assessment.component.html',
  styleUrls: ['./mock-assessment.component.css']
})
export class MockAssessmentComponent {
  @Input() summary!: MockAssessmentSummary;
  
  editingIndex: number | null = null;
  editingRow: MockAssessmentRow | null = null;
  showEditModal = false;

  constructor() {}

  onEdit(index: number): void {
    this.editingIndex = index;
    this.editingRow = JSON.parse(JSON.stringify(this.summary.rows[index]));
    this.showEditModal = true;
  }

  onDelete(index: number): void {
    if (confirm(`Are you sure you want to delete "${this.summary.rows[index].stream}"?`)) {
      this.summary.rows.splice(index, 1);
      this.saveMockAssessment();
    }
  }

  onUpdate(): void {
    if (this.editingIndex !== null && this.editingRow) {
      this.summary.rows[this.editingIndex] = this.editingRow;
      this.closeModal();
      this.saveMockAssessment();
    }
  }

  closeModal(): void {
    this.showEditModal = false;
    this.editingIndex = null;
    this.editingRow = null;
  }

  onAddRow(): void {
    const newRow: MockAssessmentRow = {
      stream: 'New Step',
      totalResources: 0,
      scheduled: '-',
      totalConducted: 0,
      totalPassed: 0,
      totalFailed: '-',
      passRate: '0%',
      failRate: '0'
    };
    this.summary.rows.push(newRow);
    this.editingIndex = this.summary.rows.length - 1;
    this.editingRow = JSON.parse(JSON.stringify(newRow));
    this.showEditModal = true;
  }

  // Highlight methods
  editingHighlightIndex: number | null = null;
  editingHighlight: string | null = null;
  showHighlightModal = false;

  onEditHighlight(index: number): void {
    this.editingHighlightIndex = index;
    this.editingHighlight = this.summary.highlights[index];
    this.showHighlightModal = true;
  }

  onDeleteHighlight(index: number): void {
    if (confirm(`Are you sure you want to delete this highlight?`)) {
      this.summary.highlights.splice(index, 1);
      this.saveMockAssessment();
    }
  }

  onAddHighlight(): void {
    this.editingHighlightIndex = this.summary.highlights.length;
    this.editingHighlight = '';
    this.showHighlightModal = true;
  }

  onUpdateHighlight(): void {
    if (this.editingHighlight !== null && this.editingHighlightIndex !== null) {
      if (this.editingHighlightIndex === this.summary.highlights.length) {
        this.summary.highlights.push(this.editingHighlight);
      } else {
        this.summary.highlights[this.editingHighlightIndex] = this.editingHighlight;
      }
      this.closeHighlightModal();
      this.saveMockAssessment();
    }
  }

  closeHighlightModal(): void {
    this.showHighlightModal = false;
    this.editingHighlightIndex = null;
    this.editingHighlight = null;
  }

  ngOnInit(): void {
    const savedData = localStorage.getItem('mockAssessment');

    if (savedData) {
      this.summary = JSON.parse(savedData);
    }
}

  // Save to backend API
  saveMockAssessment(): void {
    localStorage.setItem(
      'mockAssessment',
      JSON.stringify(this.summary)
    );

    console.log('Mock assessment saved locally');
  }
}
