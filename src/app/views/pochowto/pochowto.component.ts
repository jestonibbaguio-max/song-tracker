import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { QuillModule } from 'ngx-quill';
import { PocHowToContentService } from '../../services/poc-howto-content.service';

interface PocHowToTab {
  id: string;
  label: string;
  icon: string;
  description: string;
}

@Component({
  selector: 'app-pochowto',
  standalone: true,
  imports: [FormsModule, QuillModule],
  templateUrl: './pochowto.component.html',
  styleUrl: './pochowto.component.css'
})
export class PocHowToComponent implements OnInit {
  readonly tabs: PocHowToTab[] = [
    { id: 'am-group', label: 'AM Call w/ group', icon: 'bi-people', description: 'Guidance for running the morning call with the group.' },
    { id: 'am-execs', label: 'AM Call w/ Execs', icon: 'bi-person-badge', description: 'Guidance for running the morning call with execs.' },
    { id: 'eod-call', label: 'EOD Call', icon: 'bi-moon-stars', description: 'Guidance for running the end-of-day call.' },
    { id: 'prepare-report', label: 'How to prepare report', icon: 'bi-file-earmark-text', description: 'Guidance for preparing the report.' },
    { id: 'new-sprint-prep', label: 'New sprint prep', icon: 'bi-calendar-plus', description: 'Guidance for preparing a new sprint.' },
  ];

  activeTab = this.tabs[0].id;
  savedContent: Record<string, string> = {};
  draftContent: Record<string, string> = {};
  editing: Record<string, boolean> = {};

  constructor(private contentService: PocHowToContentService) {}

  ngOnInit(): void {
    for (const tab of this.tabs) {
      this.contentService.getContent(tab.id).subscribe(html => {
        this.savedContent[tab.id] = html;
        this.draftContent[tab.id] = html;
        this.editing[tab.id] = false;
      });
    }
  }

  selectTab(id: string): void {
    this.activeTab = id;
  }

  startEdit(tabId: string): void {
    this.editing[tabId] = true;
  }

  saveEdit(tabId: string): void {
    this.contentService.saveContent(tabId, this.draftContent[tabId]).subscribe(() => {
      this.savedContent[tabId] = this.draftContent[tabId];
      this.editing[tabId] = false;
    });
  }

  cancelEdit(tabId: string): void {
    this.draftContent[tabId] = this.savedContent[tabId];
    this.editing[tabId] = false;
  }

  get activeTabInfo(): PocHowToTab {
    return this.tabs.find(t => t.id === this.activeTab) ?? this.tabs[0];
  }
}
