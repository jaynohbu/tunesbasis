import { Injectable, NgZone } from '@angular/core';
import axios, { AxiosResponse } from 'axios';
import { environment } from '../../environments/environment';

/* ================= API TYPES ================= */

export interface UploadResponse {
  success: boolean;
  jobId: string;
  stems: {
    name: string;
    url: string;
  }[];
}

@Injectable({ providedIn: 'root' })
export class MusicUploadService {

  constructor(private zone: NgZone) {}

 upload(file: File, onProgress: (percent: number) => void) {
  const form = new FormData();
  form.append('file', file);

  return axios.post(
    `${environment.apiBaseUrl}/upload`,
    form,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (evt) => {
        if (!evt.total) return;

        // 🔒 Cap upload progress at 90%
        const raw = Math.round((evt.loaded / evt.total) * 100);
        const capped = Math.min(raw, 90);
        onProgress(capped);
      }
    }
  );
}

}
