import { Component, OnInit } from '@angular/core';
import { MusicUploadService } from 'src/app/services/music-upload.service';
import { Song } from 'src/app/model/song';

@Component({
  selector: 'app-music-page',
  templateUrl: './music-page.component.html',
  styleUrls: ['./music-page.component.scss']
})
export class MusicPageComponent implements OnInit {

  /* =========================
     SONG STATE
  ========================= */

  songs: Song[] = [];
  selectedSong: Song | null = null;

  /* =========================
     UPLOAD STATE
  ========================= */

  file: File | null = null;

  uploading = false;
  processing = false;
  progress = 0;

  private progressTimer?: any;
  private readonly PROCESSING_TIME_MS = 5 * 60 * 1000;

  constructor(private uploadService: MusicUploadService) {}

  /* =========================
     INIT
  ========================= */

  async ngOnInit(): Promise<void> {

    await this.loadSongs();
  }

  /* =========================
     DERIVED UI STATE
  ========================= */

  get uploadDisabled(): boolean {
    return !this.file || this.uploading || this.processing;
  }

  get progressLabel(): string {
    if (this.uploading) return 'Uploading…';
    if (this.processing) return 'Processing audio… (this may take a few minutes)';
    return '';
  }

  /* =========================
     FILE INPUT
  ========================= */

  onFileSelected(e: Event): void {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.file = input.files[0];
    }
  }

  /* =========================
     LOAD SONGS (SAFE)
  ========================= */

  async loadSongs(): Promise<void> {
    try {
   
      const res = await this.uploadService.listSongs();
      this.songs = Array.isArray(res?.data) ? res.data : [];

      // 🔑 preserve current selection if possible
      if (this.songs.length === 0) {
        this.selectedSong = null;
        return;
      }

      if (this.selectedSong) {
        const found = this.songs.find(
          s => s.songId === this.selectedSong!.songId
        );
        this.selectedSong = found ?? this.songs[0];
      } else {
        // default: first READY song, otherwise first item
        this.selectedSong =
          this.songs.find(s => s.status === 'ready') ?? this.songs[0];
      }

      console.log('[MusicPage] songs:', this.songs);
      console.log('[MusicPage] selectedSong:', this.selectedSong);

    } catch (err) {
      console.error('Failed to load songs', err);
      this.songs = [];
      this.selectedSong = null;
    }
  }

  /* =========================
     SONG SELECTION
  ========================= */

  selectSong(song: Song): void {
    this.selectedSong = song;
  }

  /* =========================
     UPLOAD FLOW
  ========================= */

  async upload(): Promise<void> {
    if (this.uploadDisabled || !this.file) return;

    this.uploading = true;
    this.processing = false;
    this.progress = 0;

    try {
      // ---- UPLOAD (0–90%) ----
      const res = await this.uploadService.upload(
        this.file,
        (p: number) => {
          this.progress = Math.min(90, p);
        }
      );

      // ---- PROCESSING (90–99%) ----
      this.uploading = false;
      this.processing = true;

      const start = Date.now();
      this.progressTimer = setInterval(() => {
        const ratio = (Date.now() - start) / this.PROCESSING_TIME_MS;
        this.progress = Math.min(99, 90 + ratio * 9);
      }, 500);

      // reload list (backend may still be processing)
      await this.loadSongs();

      // try selecting uploaded song once it appears
      const uploadedId = res?.data?.songId;
      if (uploadedId) {
        const found = this.songs.find(s => s.songId === uploadedId);
        if (found) {
          this.selectedSong = found;
        }
      }

    } catch (err) {
      console.error('Upload failed', err);
    } finally {
      clearInterval(this.progressTimer);
      this.uploading = false;
      this.processing = false;
      this.progress = 0;
      this.file = null;
    }
  }
}
