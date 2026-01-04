import { Injectable, NgZone } from '@angular/core';
import axios, { AxiosResponse } from 'axios';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

/* ================= API TYPES ================= */

/** Upload API response */
export interface UploadResponse {
  success: boolean;
  songId: string;
  status?: string; // 'processing', 'ready', 'failed'
  message?: string;
  stems?: {
    name: string;
    url: string;
  }[];
}

/** Song as returned by listSongs */
export interface SongDTO {
  entityType: 'SONG';
  songId: string;
  originalName: string;
  sceneName?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  audioKey: string;
  stems: Record<string, string>;
}

/* ================= SCENE TYPES ================= */

export interface SceneItemDTO {
  songId: string;
  order: number;
  intervalSec: number;
  soundState?: any;
}

export interface SceneDTO {
  sceneId: string;
  name: string;
  items: SceneItemDTO[];
  createdAt: string;
  updatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class MusicUploadService {

  constructor(private zone: NgZone, private authService: AuthService) {}

  /* ================= UPLOAD ================= */

  async upload(
    file: File,
    onProgress: (percent: number) => void,
    songName?: string
  ): Promise<AxiosResponse<UploadResponse>> {
    try {
      // Step 1: Get presigned URL from backend
      this.zone.run(() => onProgress(5));

      const token = await this.authService.getIdToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const presignedResponse = await axios.get<{
        songId: string;
        presignedUrl: string;
        s3Key: string;
        expiresIn: number;
      }>(`${environment.apiBaseUrl}/upload/presigned-url`, {
        params: {
          fileName: file.name,
          contentType: file.type || 'audio/wav',
          songName: songName,
        },
        headers: {
          'Authorization': token
        }
      });

      const { songId, presignedUrl, s3Key } = presignedResponse.data;

      // Step 2: Upload file directly to S3 using presigned URL
      this.zone.run(() => onProgress(10));

      // Use XMLHttpRequest for S3 upload to avoid axios adding extra headers
      // that would invalidate the presigned URL signature
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (evt) => {
          if (!evt.total) return;

          // Map S3 upload progress to 10-80%
          const s3Progress = Math.round((evt.loaded / evt.total) * 100);
          const mappedProgress = 10 + Math.round(s3Progress * 0.7);

          this.zone.run(() => onProgress(mappedProgress));
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`S3 upload failed with status ${xhr.status}: ${xhr.responseText}`));
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('S3 upload network error'));
        });

        xhr.open('PUT', presignedUrl);
        xhr.setRequestHeader('Content-Type', file.type || 'audio/webm');
        xhr.send(file);
      });

      // Step 3: Notify backend to process the uploaded file
      this.zone.run(() => onProgress(85));

      const completeResponse = await axios.post<UploadResponse>(
        `${environment.apiBaseUrl}/upload/complete`,
        {
          songId,
          s3Key,
          songName,
        },
        {
          headers: {
            'Authorization': token
          }
        }
      );

      this.zone.run(() => onProgress(100));

      return completeResponse;
    } catch (error) {
      console.error('[UPLOAD] Failed:', error);
      throw error;
    }
  }

  /* ================= SONGS ================= */

  async listSongs(): Promise<AxiosResponse<SongDTO[]>> {
    const token = await this.authService.getIdToken();
    return axios.get<SongDTO[]>(
      `${environment.apiBaseUrl}/songs`,
      {
        headers: {
          'Authorization': token
        }
      }
    );
  }

  async updateSong(
    songId: string,
    payload: { sceneName?: string }
  ): Promise<AxiosResponse<void>> {
    const token = await this.authService.getIdToken();
    return axios.put<void>(
      `${environment.apiBaseUrl}/songs/${songId}`,
      payload,
      {
        headers: {
          'Authorization': token
        }
      }
    );
  }

  /* ================= SCENES ================= */

  async listScenes(): Promise<AxiosResponse<SceneDTO[]>> {
    const token = await this.authService.getIdToken();
    return axios.get<SceneDTO[]>(
      `${environment.apiBaseUrl}/scenes`,
      {
        headers: {
          'Authorization': token
        }
      }
    );
  }

  async getScene(sceneId: string): Promise<AxiosResponse<SceneDTO>> {
    const token = await this.authService.getIdToken();
    return axios.get<SceneDTO>(
      `${environment.apiBaseUrl}/scenes/${sceneId}`,
      {
        headers: {
          'Authorization': token
        }
      }
    );
  }

  async createScene(payload: {
    name: string;
    items: SceneItemDTO[];
  }): Promise<AxiosResponse<SceneDTO>> {
    const token = await this.authService.getIdToken();
    return axios.post<SceneDTO>(
      `${environment.apiBaseUrl}/scenes`,
      payload,
      {
        headers: {
          'Authorization': token
        }
      }
    );
  }

  async updateScene(
    sceneId: string,
    payload: {
      name?: string;
      items?: SceneItemDTO[];
    }
  ): Promise<AxiosResponse<void>> {
    const token = await this.authService.getIdToken();
    return axios.put<void>(
      `${environment.apiBaseUrl}/scenes/${sceneId}`,
      payload,
      {
        headers: {
          'Authorization': token
        }
      }
    );
  }
}
