import { Component, DoCheck, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SharedDataService } from '../../services/shared-data.service';
import { TrainingDataService } from './training-data.service';
import { TrainingTrack } from './training-mock-data';

@Component({
  selector: 'app-training',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './training.component.html',
  styleUrl: './training.component.css'
})
export class TrainingComponent implements OnInit, DoCheck {
  tracks: TrainingTrack[] = [];
  activeTab = '';
  loading = true;
  newCourse = { title: '', length: '', link: '' };

  private lastGroup: string | null = null;

  constructor(private trainingData: TrainingDataService, public sharedData: SharedDataService) {}

  ngOnInit(): void {
    this.loadTracks(this.sharedData.attendanceGroup);
  }

  ngDoCheck(): void {
    if (this.sharedData.attendanceGroup !== this.lastGroup) {
      this.loadTracks(this.sharedData.attendanceGroup);
    }
  }

  selectTab(id: string): void {
    this.activeTab = id;
    this.newCourse = { title: '', length: '', link: '' };
  }

  addCourse(track: TrainingTrack): void {
    const title = this.newCourse.title.trim();
    if (!title) return;
    track.courses.push({
      id: crypto.randomUUID(),
      title,
      length: this.newCourse.length.trim(),
      link: this.newCourse.link.trim(),
    });
    this.newCourse = { title: '', length: '', link: '' };
  }

  removeCourse(track: TrainingTrack, course: TrainingTrack['courses'][number]): void {
    track.courses = track.courses.filter(c => c.id !== course.id);
  }

  private loadTracks(group: string): void {
    this.lastGroup = group;
    this.loading = true;
    this.trainingData.getTracksForGroup(group).subscribe(tracks => {
      this.tracks = tracks;
      this.activeTab = tracks[0]?.id ?? '';
      this.newCourse = { title: '', length: '', link: '' };
      this.loading = false;
    });
  }
}
