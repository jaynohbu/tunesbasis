import { Injectable } from '@angular/core';
import axios, { AxiosResponse } from 'axios';
import { environment } from '../../environments/environment';

/* ================= GROUP DTOs ================= */

export interface GroupDTO {
  groupId: string;
  ownerId: string;
  name: string;
  memberIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MyGroupResponseDTO {
  exists: boolean;
  group?: GroupDTO;
}

@Injectable({ providedIn: 'root' })
export class GroupsService {

  private baseUrl = `${environment.apiBaseUrl}/groups`;

  /* ============================================================
   * CREATE GROUP
   * ============================================================ */
  createGroup(name: string): Promise<AxiosResponse<GroupDTO>> {
    return axios.post<GroupDTO>(this.baseUrl, { name });
  }

  /* ============================================================
   * GET MY GROUP
   * ============================================================ */
  getMyGroup(): Promise<AxiosResponse<MyGroupResponseDTO>> {
    return axios.get<MyGroupResponseDTO>(`${this.baseUrl}/my-group`);
  }

  /* ============================================================
   * GET GROUP BY ID
   * ============================================================ */
  getGroup(groupId: string): Promise<AxiosResponse<GroupDTO>> {
    return axios.get<GroupDTO>(`${this.baseUrl}/${groupId}`);
  }

  /* ============================================================
   * UPDATE GROUP NAME
   * ============================================================ */
  updateGroupName(groupId: string, name: string): Promise<AxiosResponse<void>> {
    return axios.patch<void>(`${this.baseUrl}/${groupId}/name`, { name });
  }

  /* ============================================================
   * REMOVE MEMBER FROM GROUP
   * ============================================================ */
  removeMember(groupId: string, memberId: string): Promise<AxiosResponse<void>> {
    return axios.delete<void>(`${this.baseUrl}/${groupId}/members/${memberId}`);
  }
}
