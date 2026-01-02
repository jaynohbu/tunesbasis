import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { GroupsService, GroupDTO, MyGroupResponseDTO } from 'src/app/services/groups.service';
import { InvitationsService, SendInvitationRequestDTO } from 'src/app/services/invitations.service';
import { SceneService } from 'src/app/services/scene.service';
import { Scene } from 'src/app/model/scene';
import { MessageService } from 'primeng/api';

@Component({
  selector: 'app-invite-modal',
  templateUrl: './invite-modal.component.html',
  styleUrls: ['./invite-modal.component.scss']
})
export class InviteModalComponent implements OnInit {
  @Input() currentScene?: Scene;
  @Output() closeModal = new EventEmitter<void>();

  /* ================= MODAL STATE ================= */
  visible = true;
  loading = false;

  /* ================= GROUP STATE ================= */
  group: GroupDTO | null = null;
  groupName = '';
  hasGroup = false;
  creatingGroup = false;

  /* ================= INVITATION FORM ================= */
  inviteMethod: 'email' | 'phone' = 'email';
  email = '';
  phoneNumber = '';
  shareCurrentScene = false;

  constructor(
    private groupsService: GroupsService,
    private invitationsService: InvitationsService,
    private sceneService: SceneService,
    private messageService: MessageService
  ) {}

  async ngOnInit(): Promise<void> {
    await this.loadGroup();
  }

  /* ============================================================
   * LOAD GROUP
   * ============================================================ */
  private async loadGroup(): Promise<void> {
    try {
      this.loading = true;
      const response = await this.groupsService.getMyGroup();
      const data: MyGroupResponseDTO = response.data;

      if (data.exists && data.group) {
        this.hasGroup = true;
        this.group = data.group;
        this.groupName = data.group.name;
      } else {
        this.hasGroup = false;
      }
    } catch (error: any) {
      console.error('[INVITE MODAL] Failed to load group:', error);
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load group information'
      });
    } finally {
      this.loading = false;
    }
  }

  /* ============================================================
   * CREATE GROUP
   * ============================================================ */
  async onCreateGroup(): Promise<void> {
    if (!this.groupName.trim()) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Warning',
        detail: 'Please enter a group name'
      });
      return;
    }

    try {
      this.creatingGroup = true;
      const response = await this.groupsService.createGroup(this.groupName.trim());
      this.group = response.data;
      this.hasGroup = true;

      this.messageService.add({
        severity: 'success',
        summary: 'Success',
        detail: `Group "${this.group.name}" created successfully!`
      });
    } catch (error: any) {
      console.error('[INVITE MODAL] Failed to create group:', error);

      const errorMessage = error.response?.data?.message || 'Failed to create group';
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: errorMessage
      });
    } finally {
      this.creatingGroup = false;
    }
  }

  /* ============================================================
   * SEND INVITATION
   * ============================================================ */
  async onSendInvitation(): Promise<void> {
    // Validation
    if (this.inviteMethod === 'email') {
      if (!this.email.trim()) {
        this.messageService.add({
          severity: 'warn',
          summary: 'Warning',
          detail: 'Please enter an email address'
        });
        return;
      }

      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(this.email.trim())) {
        this.messageService.add({
          severity: 'warn',
          summary: 'Warning',
          detail: 'Please enter a valid email address'
        });
        return;
      }
    } else {
      if (!this.phoneNumber.trim()) {
        this.messageService.add({
          severity: 'warn',
          summary: 'Warning',
          detail: 'Please enter a phone number'
        });
        return;
      }

      // Basic US phone validation (10 digits)
      const digitsOnly = this.phoneNumber.replace(/\D/g, '');
      if (digitsOnly.length !== 10) {
        this.messageService.add({
          severity: 'warn',
          summary: 'Warning',
          detail: 'Please enter a valid 10-digit US phone number'
        });
        return;
      }
    }

    try {
      this.loading = true;

      const payload: SendInvitationRequestDTO = this.inviteMethod === 'email'
        ? { email: this.email.trim() }
        : {
            phoneNumber: `+1${this.phoneNumber.replace(/\D/g, '')}`,
            phoneCountryCode: 'US'
          };

      await this.invitationsService.sendInvitation(payload);

      // Share current scene if checkbox is checked
      if (this.shareCurrentScene && this.currentScene?.sceneId) {
        try {
          await this.sceneService.toggleSceneSharing(this.currentScene.sceneId, true);
          console.log('[INVITE MODAL] Scene shared:', this.currentScene.name);
        } catch (shareError) {
          console.error('[INVITE MODAL] Failed to share scene:', shareError);
          // Don't fail the invitation if scene sharing fails
        }
      }

      this.messageService.add({
        severity: 'success',
        summary: 'Success',
        detail: `Invitation sent successfully via ${this.inviteMethod}!${this.shareCurrentScene ? ' Scene shared.' : ''}`
      });

      // Clear form
      this.email = '';
      this.phoneNumber = '';
      this.shareCurrentScene = false;

      // Close modal after successful send
      setTimeout(() => {
        this.onClose();
      }, 1500);
    } catch (error: any) {
      console.error('[INVITE MODAL] Failed to send invitation:', error);

      const errorMessage = error.response?.data?.message || 'Failed to send invitation';
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: errorMessage
      });
    } finally {
      this.loading = false;
    }
  }

  /* ============================================================
   * MODAL CONTROLS
   * ============================================================ */
  onClose(): void {
    this.visible = false;
    this.closeModal.emit();
  }

  onHide(): void {
    this.closeModal.emit();
  }
}
