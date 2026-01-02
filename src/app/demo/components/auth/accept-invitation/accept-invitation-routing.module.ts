import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AcceptInvitationComponent } from './accept-invitation.component';

@NgModule({
  imports: [RouterModule.forChild([
    { path: '', component: AcceptInvitationComponent }
  ])],
  exports: [RouterModule]
})
export class AcceptInvitationRoutingModule { }
