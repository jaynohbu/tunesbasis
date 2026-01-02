/*
import { Component } from '@angular/core';
import { PrimeNGConfig } from 'primeng/api';
@Component({
    selector: 'app-root',
    templateUrl: './app.component.html'
})
export class AppComponent {

    menuMode = 'static';

    constructor(private primengConfig: PrimeNGConfig) { }

    ngOnInit() {
        this.primengConfig.ripple = true;
        document.documentElement.style.fontSize = '14px';
    }
}
*/


import { Component, OnInit } from '@angular/core';
import { PrimeNGConfig } from 'primeng/api';
import { LayoutService } from './layout/service/app.layout.service';
import { AuthService } from './services/auth.service';
import { setupAxiosInterceptor } from './services/axios.interceptor';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html'
})
export class AppComponent implements OnInit {

    constructor(
        private primengConfig: PrimeNGConfig,
        private layoutService: LayoutService,
        private authService: AuthService
    ) {
        // Initialize Axios interceptor to add JWT tokens to all API requests
        setupAxiosInterceptor(this.authService);
    }

    ngOnInit(): void {
        this.primengConfig.ripple = true;       //enables core ripple functionality
		document.documentElement.style.fontSize = '14px';

        //optional configuration with the default configuration
        this.layoutService.config = {
            ripple: false,                      //toggles ripple on and off
            inputStyle: 'outlined',             //default style for input elements
            menuMode: 'static',                 //layout mode of the menu, valid values are "static" and "overlay"
            colorScheme: 'light',               //color scheme of the template, valid values are "light" and "dark"
            //theme: 'lara-light-indigo',         //default component theme for PrimeNG
			theme: 'mdc-light-deeppurple',         //default component theme for PrimeNG

            scale: 14                           //size of the body font size to scale the whole application
        };
    }

}
