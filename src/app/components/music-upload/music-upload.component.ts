import { Component, EventEmitter, Output } from '@angular/core';
import { MusicUploadService } from 'src/app/services/music-upload.service';

interface StemInfo {
  name: string;
  url: string;
}

type ProgressMode = 'upload' | 'processing' | 'done';

@Component({
  selector: 'music-upload',
  templateUrl: './music-upload.component.html',
  styleUrls: ['./music-upload.component.scss']
})
export class MusicUploadComponent {
  @Output() stemsReady = new EventEmitter<StemInfo[]>();
@Output() uploadStarted = new EventEmitter<void>();
@Output() uploadFinished = new EventEmitter<StemInfo[]>();
@Output() uploadFailed = new EventEmitter<any>();

  file!: File;

  loading = false;
  progress = 0;
  progressMode: ProgressMode = 'upload';
  progressTimer: any = null;

  readonly PROCESSING_TIME_MS = 5 * 60 * 1000;

  constructor(private uploadService: MusicUploadService) {}

  onFileSelected(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files?.length) {
      this.file = input.files[0];
    }
  }

  async upload() {
  if (!this.file || this.loading) return;

  this.loading = true;
  this.progress = 0;
  this.progressMode = 'upload';

  this.uploadStarted.emit(); // 🔥 Player에게 알림

  try {
    const res = await this.uploadService.upload(
      this.file,
      p => (this.progress = Math.min(90, p * 0.9))
    );

    this.startProcessingProgress();

    // 🔥 핵심: 업로드 + 처리 완료 후 Player에 전달
    this.uploadFinished.emit(res.data.stems);

    this.finishProgress();
  } catch (e) {
    this.uploadFailed.emit(e);
    this.resetProgress();
  }
}


  startProcessingProgress() {
    this.progressMode = 'processing';
    const start = Date.now();

    this.progressTimer = setInterval(() => {
      const ratio = (Date.now() - start) / this.PROCESSING_TIME_MS;
      this.progress = Math.min(99, 90 + ratio * 9);
    }, 500);
  }

  finishProgress() {
    clearInterval(this.progressTimer);
    this.loading = false;
    this.progressMode = 'done';
    setTimeout(() => (this.progress = 0), 500);
  }

  resetProgress() {
    clearInterval(this.progressTimer);
    this.loading = false;
    this.progress = 0;
    this.progressMode = 'upload';
  }
}
