import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthRoutingModule } from './auth-routing.module';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { MessageModule } from 'primeng/message';

@NgModule({
    imports: [
        CommonModule,
        FormsModule,
        AuthRoutingModule,
        ButtonModule,
        InputTextModule,
        PasswordModule,
        MessageModule
    ]
})
export class AuthModule { }
