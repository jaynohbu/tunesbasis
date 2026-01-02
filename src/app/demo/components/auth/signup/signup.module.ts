import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SignupRoutingModule } from './signup-routing.module';
import { SignupComponent } from './signup.component';
import { ButtonModule } from 'primeng/button';
import { FormsModule } from '@angular/forms';
import { PasswordModule } from 'primeng/password';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';

@NgModule({
    imports: [
        CommonModule,
        SignupRoutingModule,
        ButtonModule,
        InputTextModule,
        FormsModule,
        PasswordModule,
        MessageModule
    ],
    declarations: [SignupComponent]
})
export class SignupModule { }
