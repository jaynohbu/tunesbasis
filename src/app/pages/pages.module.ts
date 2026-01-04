import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PagesRoutingModule } from './pages-routing.module';

/* PrimeNG */
import { TabViewModule } from 'primeng/tabview';
import { PanelMenuModule } from 'primeng/panelmenu';
import { AccordionModule } from 'primeng/accordion';
// ✅ ADD
import { ProgressBarModule } from 'primeng/progressbar';// ✅ ADD
import { ButtonModule } from 'primeng/button';
import { SliderModule } from 'primeng/slider';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ToastModule } from 'primeng/toast';
import { MessageService, ConfirmationService } from 'primeng/api';
import { InputSwitchModule } from 'primeng/inputswitch';
import { CheckboxModule } from 'primeng/checkbox';
import { SidebarModule } from 'primeng/sidebar';
import { BadgeModule } from 'primeng/badge';
import { ConfirmDialogModule } from 'primeng/confirmdialog';

/* Components */
import { TimeSeriesComponent } from './time-series/time-series.component';
import { MlMetricsComponent } from './ml-metrics/ml-metrics.component';
import { MlBasicComponent } from './ml-basic/ml-basic.component';
import { HomeComponent } from './home/home.component';
import { ReinforcementLearningComponent } from './reinforcement-learning/reinforcement-learning.component';
import { AlgorythmsComponent } from './algorythms/algorythms.component';
import { PythonTricksComponent } from './python-tricks/python-tricks.component';
import { MusicalDataComponent } from './musical-data/musical-data.component';
import { MusicPlayerComponent } from './music-player/music-player.component';
import { MusicUploadComponent } from '../components/music-upload/music-upload.component';
import { ToggleButtonModule } from 'primeng/togglebutton';
import { SongListComponent } from '../components/song-list/song-list.component';
import { ListboxModule } from 'primeng/listbox';
import { PanelModule } from 'primeng/panel';
import { DashboardComponent } from './dashboard/dashboard.component';
import { SceneEditorComponent } from '../components/scene-editor/scene-editor.component';
import { DropdownModule } from 'primeng/dropdown';
import { OrderListModule } from 'primeng/orderlist';
import { ScenePlayerTabComponent } from '../components/scene-player-tab/scene-player-tab.component';
import { InviteModalComponent } from '../components/invite-modal/invite-modal.component';
import { ChatComponent } from '../components/chat/chat.component';
import { ClockSyncTestComponent } from '../components/clock-sync-test/clock-sync-test.component';
import { JamSessionComponent } from '../components/jam-session/jam-session.component';
import { ParticipantWaveformsComponent } from '../components/participant-waveforms/participant-waveforms.component';
@NgModule({
  declarations: [
    TimeSeriesComponent,
    MlMetricsComponent,
    MlBasicComponent,
    HomeComponent,
    ReinforcementLearningComponent,
    AlgorythmsComponent,
    PythonTricksComponent,
    MusicalDataComponent,
    MusicPlayerComponent,
    MusicUploadComponent,
    SongListComponent,
    DashboardComponent,
    SceneEditorComponent,
    ScenePlayerTabComponent,
    InviteModalComponent,
    ChatComponent,
    ClockSyncTestComponent,
    JamSessionComponent,
    ParticipantWaveformsComponent
  ],
  imports: [
    CommonModule,
    PagesRoutingModule,
    ToggleButtonModule,
    TabViewModule,
    PanelMenuModule,
    AccordionModule,
    ButtonModule,
    ProgressBarModule,
    FormsModule,
    PanelModule,
    ListboxModule,
    DropdownModule,
    OrderListModule,
    DialogModule,
    InputTextModule,
    ProgressSpinnerModule,
    ToastModule,
    SliderModule,
    InputSwitchModule,
    CheckboxModule,
    SidebarModule,
    BadgeModule,
    ConfirmDialogModule
  ],
  providers: [
    MessageService,
    ConfirmationService
  ]
})
export class PagesModule { }
