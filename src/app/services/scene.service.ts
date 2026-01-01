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
}
