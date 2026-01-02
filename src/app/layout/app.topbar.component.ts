import { Component, ElementRef, ViewChild, OnInit } from '@angular/core';
import { MenuItem } from 'primeng/api';
import { Router } from '@angular/router';
import { LayoutService } from "./service/app.layout.service";
import { AuthService } from '../services/auth.service';

@Component({
    selector: 'app-topbar',
    templateUrl: './app.topbar.component.html'
})
export class AppTopBarComponent implements OnInit {

    items!: MenuItem[];
    userMenuItems!: MenuItem[];
    userEmail: string = '';

    @ViewChild('menubutton') menuButton!: ElementRef;

    @ViewChild('topbarmenubutton') topbarMenuButton!: ElementRef;

    @ViewChild('topbarmenu') menu!: ElementRef;

    constructor(
        public layoutService: LayoutService,
        private authService: AuthService,
        private router: Router
    ) { }

    ngOnInit(): void {
        // Get user email from auth service
        const currentUser = this.authService.currentUserValue;
        this.userEmail = currentUser?.email || 'User';

        // Setup user dropdown menu
        this.userMenuItems = [
            {
                label: this.userEmail,
                icon: 'pi pi-user',
                items: [
                    {
                        label: 'Profile',
                        icon: 'pi pi-user',
                        command: () => {
                            this.router.navigate(['/app']);
                        }
                    },
                    {
                        label: 'Settings',
                        icon: 'pi pi-cog',
                        command: () => {
                            this.router.navigate(['/app/documentation']);
                        }
                    },
                    {
                        separator: true
                    },
                    {
                        label: 'Logout',
                        icon: 'pi pi-sign-out',
                        command: () => {
                            this.logout();
                        }
                    }
                ]
            }
        ];
    }

    logout(): void {
        this.authService.signOut();
        this.router.navigate(['/auth/login']);
    }
}
