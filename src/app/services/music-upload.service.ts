import { Injectable, NgZone } from '@angular/core';
import axios, { AxiosResponse } from 'axios';
import { environment } from '../../environments/environment';

/* ================= API TYPES ================= */

/** Upload API response (unchanged behavior) */
export interface UploadResponse {
  success: boolean;
  songId: string;
  stems: {
    name: string;
    url: string;
  }[];
}

/** Song as returned by listSongs */
export interface SongDTO {
  entityType: 'SONG';
  songId: string;
  originalName: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  audioKey: string;
  stems: Record<string, string>; // 🔒 IMPORTANT
}

@Injectable({ providedIn: 'root' })
export class MusicUploadService {

  constructor(private zone: NgZone) {}

  /* ================= UPLOAD ================= */

  upload(file: File, onProgress: (percent: number) => void) {
    const form = new FormData();
    form.append('file', file);

    return axios.post<UploadResponse>(
      `${environment.apiBaseUrl}/upload`,
      form,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (evt) => {
          if (!evt.total) return;

          const raw = Math.round((evt.loaded / evt.total) * 100);
          const capped = Math.min(raw, 90);

          // 🔒 ensure Angular updates UI
          this.zone.run(() => onProgress(capped));
        }
      }
    );
  }

  /* ================= LIST SONGS ================= */

  listSongs(): Promise<AxiosResponse<SongDTO[]>> {
    return axios.get<SongDTO[]>(
      `${environment.apiBaseUrl}/songs`
    );
  }
}
