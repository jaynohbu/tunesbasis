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

  /* ================= EVENTS ================= */

  /** 업로드 시작 (UI / disable 용) */
  @Output() uploadStarted = new EventEmitter<void>();

  /** ❗ Player 즉시 로드용 (stems URL만 필요) */
  @Output() stemsReady = new EventEmitter<StemInfo[]>();

  /** 🔥 분석 + 저장 완료 → songs / scene reload 시점 */
  @Output() processCompleted = new EventEmitter<void>();

  /** 실패 */
  @Output() uploadFailed = new EventEmitter<any>();

  /* ================= STATE ================= */

  file!: File;

  loading = false;
  progress = 0;
  progressMode: ProgressMode = 'upload';
  progressTimer: any = null;

  /** Dialog state */
  displayDialog = false;
  songName = '';

  /** 백엔드 분석 최대 예상 시간 */
  readonly PROCESSING_TIME_MS = 5 * 60 * 1000;

  constructor(private uploadService: MusicUploadService) {}

  /* ================= FILE ================= */

  onFileSelected(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files?.length) {
      this.file = input.files[0];
    }
  }

  /* ================= DIALOG ================= */

  showSongNameDialog() {
    if (!this.file || this.loading) return;

    // Default song name from file name (without extension)
    const fileName = this.file.name;
    const nameWithoutExt = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;
    this.songName = nameWithoutExt.substring(0, 40); // Limit to 40 chars

    this.displayDialog = true;
  }

  confirmUpload() {
    if (!this.songName.trim()) return;

    this.displayDialog = false;
    this.upload();
  }

  /* ================= UPLOAD ================= */

  async upload() {
    if (!this.file || this.loading) return;

    this.loading = true;
    this.progress = 0;
    this.progressMode = 'upload';

    this.uploadStarted.emit();

    try {
      /* 1️⃣ Upload with song name */
      const res = await this.uploadService.upload(
        this.file,
        p => (this.progress = Math.min(90, p)),
        this.songName.trim()
      );

      /* 2️⃣ Processing progress (fake but UX-friendly) */
      this.startProcessingProgress();

      /* 3️⃣ 🔊 Player can load stems immediately */
      this.stemsReady.emit(res.data.stems);

      /* 4️⃣ ✅ 분석 + 저장 완료 시점
       *     - songs reload
       *     - scene check / create
       */
      this.processCompleted.emit();

      this.finishProgress();

      // Reset song name for next upload
      this.songName = '';

    } catch (e) {
      this.uploadFailed.emit(e);
      this.resetProgress();
    }
  }

  /* ================= PROGRESS ================= */

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

    setTimeout(() => {
      this.progress = 0;
      this.progressMode = 'upload';
    }, 500);
  }

  resetProgress() {
    clearInterval(this.progressTimer);
    this.loading = false;
    this.progress = 0;
    this.progressMode = 'upload';
  }
}
