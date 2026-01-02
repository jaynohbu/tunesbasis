import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { InvitationsService } from 'src/app/services/invitations.service';
import { AuthService } from 'src/app/services/auth.service';

@Component({
  selector: 'app-accept-invitation',
  templateUrl: './accept-invitation.component.html',
  styleUrls: ['./accept-invitation.component.scss']
})
export class AcceptInvitationComponent implements OnInit {
  /* ================= STATE ================= */
  token: string | null = null;
  loading = true;
  validating = true;

  isValid = false;
  isExpired = false;
  isAuthenticated = false;
  acceptingInvitation = false;

  groupId: string | null = null;
  expiresAt: number | null = null;

  error: string | null = null;
  success = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private invitationsService: InvitationsService,
    private authService: AuthService
  ) {}

  async ngOnInit(): Promise<void> {
    // Get token from query params
    this.route.queryParams.subscribe(params => {
      this.token = params['token'];
      if (this.token) {
        this.validateToken();
      } else {
        this.error = 'Invalid invitation link. No token provided.';
        this.loading = false;
        this.validating = false;
      }
    });

    // Check if user is authenticated
    this.isAuthenticated = this.authService.isAuthenticated();
  }

  /* ============================================================
   * VALIDATE TOKEN
   * ============================================================ */
  private async validateToken(): Promise<void> {
    if (!this.token) return;

    try {
      this.validating = true;
      const response = await this.invitationsService.validateInvitation(this.token);
      const data = response.data;

      this.isValid = data.valid;

      if (data.valid) {
        this.groupId = data.groupId || null;
        this.expiresAt = data.expiresAt || null;

        // If user is authenticated, automatically accept invitation
        if (this.isAuthenticated) {
          await this.acceptInvitation();
        }
      } else {
        this.isExpired = true;
        this.error = 'This invitation has expired or is invalid.';
      }
    } catch (error: any) {
      console.error('[ACCEPT INVITATION] Validation error:', error);
      this.error = 'Failed to validate invitation. Please try again.';
      this.isValid = false;
    } finally {
      this.validating = false;
      this.loading = false;
    }
  }

  /* ============================================================
   * ACCEPT INVITATION
   * ============================================================ */
  async acceptInvitation(): Promise<void> {
    if (!this.token || !this.isAuthenticated) return;

    try {
      this.acceptingInvitation = true;
      this.error = null;

      await this.invitationsService.acceptInvitation({ token: this.token });

      this.success = true;

      // Redirect to dashboard after 2 seconds
      setTimeout(() => {
        this.router.navigate(['/dashboard']);
      }, 2000);
    } catch (error: any) {
      console.error('[ACCEPT INVITATION] Accept error:', error);

      const errorMessage = error.response?.data?.message || 'Failed to accept invitation';
      this.error = errorMessage;
      this.success = false;
    } finally {
      this.acceptingInvitation = false;
    }
  }

  /* ============================================================
   * NAVIGATE TO LOGIN/SIGNUP
   * ============================================================ */
  goToSignup(): void {
    // Store token in sessionStorage to retrieve after signup
    if (this.token) {
      sessionStorage.setItem('invitation_token', this.token);
    }
    this.router.navigate(['/auth/signup']);
  }

  goToLogin(): void {
    // Store token in sessionStorage to retrieve after login
    if (this.token) {
      sessionStorage.setItem('invitation_token', this.token);
    }
    this.router.navigate(['/auth/login']);
  }

  goToDashboard(): void {
    this.router.navigate(['/dashboard']);
  }

  goToHome(): void {
    this.router.navigate(['/']);
  }
}
