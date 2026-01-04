import { Injectable } from '@angular/core';
import axios, { AxiosResponse } from 'axios';
import { environment } from '../../environments/environment';

/* ================= SCENE DTOs ================= */

export interface SceneItemDTO {
  songId: string;
  order: number;
  intervalSec: number;
  soundState?: any; // per-song mix / FX state
}

export interface SceneDTO {
  sceneId: string;
  name: string;
  items: SceneItemDTO[];
  ownerUserId?: string;
  shared?: boolean;
  createdAt: string;
  updatedAt: string;
}

@Injectable({ providedIn: 'root' })
export class SceneService {

  private baseUrl = `${environment.apiBaseUrl}/scenes`;

  /* ============================================================
   * LIST SCENES
   * ============================================================ */
  listScenes(): Promise<AxiosResponse<SceneDTO[]>> {
    return axios.get<SceneDTO[]>(this.baseUrl);
  }

  /* ============================================================
   * GET SINGLE SCENE
   * ============================================================ */
  getScene(sceneId: string): Promise<AxiosResponse<SceneDTO>> {
    return axios.get<SceneDTO>(`${this.baseUrl}/${sceneId}`);
  }

  /* ============================================================
   * CREATE SCENE
   * ============================================================ */
  createScene(payload: {
    name: string;
    items: SceneItemDTO[];
  }): Promise<AxiosResponse<SceneDTO>> {
    return axios.post<SceneDTO>(this.baseUrl, payload);
  }

  /* ============================================================
   * UPDATE SCENE
   * ============================================================ */
  updateScene(
    sceneId: string,
    payload: {
      name?: string;
      items?: SceneItemDTO[];
    }
  ): Promise<AxiosResponse<void>> {
    return axios.put<void>(
      `${this.baseUrl}/${sceneId}`,
      payload
    );
  }

  /* ============================================================
   * COPY SCENE
   * ============================================================ */
  copyScene(
    sceneId: string,
    newName: string
  ): Promise<AxiosResponse<SceneDTO>> {
    return axios.post<SceneDTO>(
      `${this.baseUrl}/${sceneId}/copy`,
      { name: newName }
    );
  }

  /* ============================================================
   * DELETE SCENE
   * ============================================================ */
  deleteScene(sceneId: string): Promise<AxiosResponse<void>> {
    return axios.delete<void>(`${this.baseUrl}/${sceneId}`);
  }

  /* ============================================================
   * DELETE SONG FROM SCENE
   * ============================================================ */
  deleteSongFromScene(sceneId: string, songIndex: number): Promise<AxiosResponse<void>> {
    return axios.delete<void>(
      `${this.baseUrl}/${sceneId}/songs/${songIndex}`
    );
  }

  /* ============================================================
   * TOGGLE SCENE SHARING
   * ============================================================ */
  toggleSceneSharing(sceneId: string, shared: boolean): Promise<AxiosResponse<{ shared: boolean }>> {
    return axios.post<{ shared: boolean }>(
      `${this.baseUrl}/${sceneId}/share`,
      { shared }
    );
  }

  /* ============================================================
   * LIST SHARED SCENES
   * ============================================================ */
  listSharedScenes(): Promise<AxiosResponse<SceneDTO[]>> {
    return axios.get<SceneDTO[]>(`${this.baseUrl}/shared/all`);
  }

  /* ============================================================
   * GET OR CREATE PERSONAL JAMMING SCENE
   * ============================================================ */
  getOrCreatePersonalJammingScene(): Promise<AxiosResponse<SceneDTO>> {
    return axios.get<SceneDTO>(`${this.baseUrl}/my-jammings`);
  }

  /* ============================================================
   * GET OR CREATE JAMMING SCENE FOR GROUP
   * ============================================================ */
  getOrCreateJammingScene(groupId: string): Promise<AxiosResponse<SceneDTO>> {
    return axios.get<SceneDTO>(`${this.baseUrl}/jamming/${groupId}`);
  }

  /* ============================================================
   * ADD SONG TO SCENE (ATOMIC)
   * ============================================================ */
  addSongToScene(
    sceneId: string,
    payload: {
      songId: string;
      intervalSec?: number;
      soundState?: any;
    }
  ): Promise<AxiosResponse<SceneDTO>> {
    return axios.post<SceneDTO>(
      `${this.baseUrl}/${sceneId}/songs`,
      payload
    );
  }
}
