import { Injectable, NgZone } from '@angular/core';
import axios, { AxiosResponse } from 'axios';
import { environment } from '../../environments/environment';

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

  constructor(private zone: NgZone) {}

  /* ================= UPLOAD ================= */

  async upload(
    file: File,
    onProgress: (percent: number) => void,
    songName?: string
  ): Promise<AxiosResponse<UploadResponse>> {
    try {
      // Step 1: Get presigned URL from backend
      this.zone.run(() => onProgress(5));

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
      });

      const { songId, presignedUrl, s3Key } = presignedResponse.data;

      // Step 2: Upload file directly to S3 using presigned URL
      this.zone.run(() => onProgress(10));

      await axios.put(presignedUrl, file, {
        headers: {
          'Content-Type': file.type || 'audio/wav',
        },
        onUploadProgress: (evt) => {
          if (!evt.total) return;

          // Map S3 upload progress to 10-80%
          const s3Progress = Math.round((evt.loaded / evt.total) * 100);
          const mappedProgress = 10 + Math.round(s3Progress * 0.7);

          this.zone.run(() => onProgress(mappedProgress));
        },
      });

      // Step 3: Notify backend to process the uploaded file
      this.zone.run(() => onProgress(85));

      const completeResponse = await axios.post<UploadResponse>(
        `${environment.apiBaseUrl}/upload/complete`,
        {
          songId,
          s3Key,
          songName,
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

  listSongs(): Promise<AxiosResponse<SongDTO[]>> {
    return axios.get<SongDTO[]>(
      `${environment.apiBaseUrl}/songs`
    );
  }

  updateSong(
    songId: string,
    payload: { sceneName?: string }
  ): Promise<AxiosResponse<void>> {
    return axios.put<void>(
      `${environment.apiBaseUrl}/songs/${songId}`,
      payload
    );
  }

  /* ================= SCENES ================= */

  listScenes(): Promise<AxiosResponse<SceneDTO[]>> {
    return axios.get<SceneDTO[]>(
      `${environment.apiBaseUrl}/scenes`
    );
  }

  getScene(sceneId: string): Promise<AxiosResponse<SceneDTO>> {
    return axios.get<SceneDTO>(
      `${environment.apiBaseUrl}/scenes/${sceneId}`
    );
  }

  createScene(payload: {
    name: string;
    items: SceneItemDTO[];
  }): Promise<AxiosResponse<SceneDTO>> {
    return axios.post<SceneDTO>(
      `${environment.apiBaseUrl}/scenes`,
      payload
    );
  }

  updateScene(
    sceneId: string,
    payload: {
      name?: string;
      items?: SceneItemDTO[];
    }
  ): Promise<AxiosResponse<void>> {
    return axios.put<void>(
      `${environment.apiBaseUrl}/scenes/${sceneId}`,
      payload
    );
  }
}
