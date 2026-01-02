import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AcceptInvitationRoutingModule } from './accept-invitation-routing.module';
import { AcceptInvitationComponent } from './accept-invitation.component';
import { ButtonModule } from 'primeng/button';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

@NgModule({
  imports: [
    CommonModule,
    AcceptInvitationRoutingModule,
    ButtonModule,
    ProgressSpinnerModule
  ],
  declarations: [AcceptInvitationComponent]
})
export class AcceptInvitationModule { }
