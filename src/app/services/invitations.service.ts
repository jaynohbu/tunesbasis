import { Injectable } from '@angular/core';
import axios, { AxiosResponse } from 'axios';
import { environment } from '../../environments/environment';

/* ================= INVITATION DTOs ================= */

export type InvitationStatus = 'pending' | 'accepted' | 'expired';

export interface InvitationDTO {
  invitationId: string;
  groupId: string;
  invitedBy: string;
  email?: string;
  phoneNumber?: string;
  phoneCountryCode?: string;
  token: string;
  status: InvitationStatus;
  expiresAt: number; // Unix timestamp
  createdAt: string;
  updatedAt?: string;
}

export interface SendInvitationRequestDTO {
  email?: string;
  phoneNumber?: string;
  phoneCountryCode?: string;
}

export interface SendInvitationResponseDTO {
  invitationId: string;
  status: InvitationStatus;
  expiresAt: number;
}

export interface ValidateInvitationResponseDTO {
  valid: boolean;
  groupId?: string;
  expiresAt?: number;
}

export interface AcceptInvitationRequestDTO {
  token: string;
}

export interface AcceptInvitationResponseDTO {
  success: boolean;
  groupId: string;
}

export interface MyInvitationsResponseDTO {
  invitations: InvitationDTO[];
}

@Injectable({ providedIn: 'root' })
export class InvitationsService {

  private baseUrl = `${environment.apiBaseUrl}/invitations`;

  /* ============================================================
   * SEND INVITATION
   * ============================================================ */
  sendInvitation(payload: SendInvitationRequestDTO): Promise<AxiosResponse<SendInvitationResponseDTO>> {
    return axios.post<SendInvitationResponseDTO>(`${this.baseUrl}/send`, payload);
  }

  /* ============================================================
   * VALIDATE INVITATION TOKEN
   * ============================================================ */
  validateInvitation(token: string): Promise<AxiosResponse<ValidateInvitationResponseDTO>> {
    return axios.get<ValidateInvitationResponseDTO>(`${this.baseUrl}/validate`, {
      params: { token }
    });
  }

  /* ============================================================
   * ACCEPT INVITATION
   * ============================================================ */
  acceptInvitation(payload: AcceptInvitationRequestDTO): Promise<AxiosResponse<AcceptInvitationResponseDTO>> {
    return axios.post<AcceptInvitationResponseDTO>(`${this.baseUrl}/accept`, payload);
  }

  /* ============================================================
   * LIST MY INVITATIONS
   * ============================================================ */
  getMyInvitations(): Promise<AxiosResponse<MyInvitationsResponseDTO>> {
    return axios.get<MyInvitationsResponseDTO>(`${this.baseUrl}/my-invitations`);
  }
}
