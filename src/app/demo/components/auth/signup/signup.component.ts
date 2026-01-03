import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { LayoutService } from 'src/app/layout/service/app.layout.service';
import { AuthService } from 'src/app/services/auth.service';
import { InvitationsService } from 'src/app/services/invitations.service';

@Component({
    selector: 'app-signup',
    templateUrl: './signup.component.html',
    styles: [`
        :host ::ng-deep .p-password input {
            width: 100%;
            padding:1rem;
        }

        :host ::ng-deep .pi-eye{
            transform:scale(1.6);
            margin-right: 1rem;
            color: var(--primary-color) !important;
        }

        :host ::ng-deep .pi-eye-slash{
            transform:scale(1.6);
            margin-right: 1rem;
            color: var(--primary-color) !important;
        }
    `]
})
export class SignupComponent implements OnInit {
    email: string = '';
    password: string = '';
    confirmPassword: string = '';
    verificationCode: string = '';
    loading: boolean = false;
    error: string = '';
    success: string = '';
    needsVerification: boolean = false;
    returnUrl: string = '';

    constructor(
        public layoutService: LayoutService,
        private authService: AuthService,
        private router: Router,
        private route: ActivatedRoute,
        private invitationsService: InvitationsService
    ) { }

    ngOnInit(): void {
        this.returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/app';

        // Redirect if already logged in
        this.authService.isAuthenticated().then(isAuth => {
            if (isAuth) {
                this.router.navigate([this.returnUrl]);
            }
        });
    }

    async onSignUp(): Promise<void> {
        if (!this.email || !this.password) {
            this.error = 'Please enter email and password';
            return;
        }

        if (this.password !== this.confirmPassword) {
            this.error = 'Passwords do not match';
            return;
        }

        if (this.password.length < 8) {
            this.error = 'Password must be at least 8 characters';
            return;
        }

        this.loading = true;
        this.error = '';
        this.success = '';

        try {
            await this.authService.signUp(this.email, this.password);
            this.success = 'Account created! Please check your email for a verification code.';
            this.needsVerification = true;
            this.loading = false;
        } catch (err: any) {
            console.error('Sign up error:', err);
            this.error = err.message || 'Failed to create account. Please try again.';
            this.loading = false;
        }
    }

    async onVerify(): Promise<void> {
        if (!this.verificationCode) {
            this.error = 'Please enter the verification code';
            return;
        }

        this.loading = true;
        this.error = '';

        try {
            await this.authService.confirmRegistration(this.email, this.verificationCode);
            this.success = 'Email verified! Signing you in...';
            
            // Auto sign in after verification
            await this.authService.signIn(this.email, this.password);

            // Check if there's a pending invitation token
            const invitationToken = sessionStorage.getItem('invitation_token');
            if (invitationToken) {
                try {
                    await this.invitationsService.acceptInvitation({ token: invitationToken });
                    sessionStorage.removeItem('invitation_token');
                    setTimeout(() => {
                        this.router.navigate(['/dashboard']);
                    }, 1000);
                } catch (inviteErr) {
                    console.error('Failed to accept invitation:', inviteErr);
                    // Still redirect even if invitation acceptance fails
                    setTimeout(() => {
                        this.router.navigate([this.returnUrl]);
                    }, 1000);
                }
            } else {
                setTimeout(() => {
                    this.router.navigate([this.returnUrl]);
                }, 1000);
            }
        } catch (err: any) {
            console.error('Verification error:', err);
            this.error = err.message || 'Failed to verify code. Please try again.';
            this.loading = false;
        }
    }

    goToLogin(): void {
        this.router.navigate(['/auth/login'], {
            queryParams: { returnUrl: this.returnUrl }
        });
    }
}
