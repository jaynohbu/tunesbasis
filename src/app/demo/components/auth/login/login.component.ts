import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { LayoutService } from 'src/app/layout/service/app.layout.service';
import { AuthService } from 'src/app/services/auth.service';

@Component({
    selector: 'app-login',
    templateUrl: './login.component.html',
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
export class LoginComponent implements OnInit {
    email: string = '';
    password: string = '';
    loading: boolean = false;
    error: string = '';
    returnUrl: string = '';

    constructor(
        public layoutService: LayoutService,
        private authService: AuthService,
        private router: Router,
        private route: ActivatedRoute
    ) { }

    ngOnInit(): void {
        // Get return URL from route parameters or default to '/app'
        this.returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/app';

        // Redirect if already logged in
        if (this.authService.isAuthenticated()) {
            this.router.navigate([this.returnUrl]);
        }
    }

    async onSignIn(): Promise<void> {
        if (!this.email || !this.password) {
            this.error = 'Please enter email and password';
            return;
        }

        this.loading = true;
        this.error = '';

        try {
            await this.authService.signIn(this.email, this.password);
            // Redirect to return URL
            this.router.navigate([this.returnUrl]);
        } catch (err: any) {
            console.error('Sign in error:', err);
            this.error = err.message || 'Failed to sign in. Please check your credentials.';
            this.loading = false;
        }
    }

    goToSignUp(): void {
        this.router.navigate(['/auth/signup'], {
            queryParams: { returnUrl: this.returnUrl }
        });
    }

    goToForgotPassword(): void {
        this.router.navigate(['/auth/forgot-password']);
    }
}
