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
  ],
  imports: [
    CommonModule,
    PagesRoutingModule,
    ToggleButtonModule,
    TabViewModule,
    PanelMenuModule,
    AccordionModule,
    ButtonModule,          // ✅ REQUIRED
    ProgressBarModule      // ✅ REQUIRED
  ]
})
export class PagesModule {}
