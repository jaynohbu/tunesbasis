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

  upload(
    file: File,
    onProgress: (percent: number) => void,
    songName?: string
  ) {
    const form = new FormData();
    form.append('file', file);
    if (songName) {
      form.append('songName', songName);
    }

    return axios.post<UploadResponse>(
      `${environment.apiBaseUrl}/upload`,
      form,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (evt) => {
          if (!evt.total) return;

          const raw = Math.round((evt.loaded / evt.total) * 100);
          const capped = Math.min(raw, 90);

          this.zone.run(() => onProgress(capped));
        }
      }
    );
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
