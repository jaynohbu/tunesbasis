import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PagesRoutingModule } from './pages-routing.module';
import { TimeSeriesComponent } from './time-series/time-series.component';

// 👉 import PrimeNG TabView
import { TabViewModule } from 'primeng/tabview';
import { MlMetricsComponent } from './ml-metrics/ml-metrics.component';
import { MlBasicComponent } from './ml-basic/ml-basic.component';
import { HomeComponent } from './home/home.component';
import { ReinforcementLearningComponent } from './reinforcement-learning/reinforcement-learning.component';
import { AlgorythmsComponent } from './algorythms/algorythms.component';

import { PanelMenuModule } from 'primeng/panelmenu';
import { AccordionModule } from 'primeng/accordion';
@NgModule({
  declarations: [
    TimeSeriesComponent,
    MlMetricsComponent,
    MlBasicComponent,
    HomeComponent,
    ReinforcementLearningComponent,
    AlgorythmsComponent
  ],
  imports: [
    CommonModule,
    PagesRoutingModule,
    TabViewModule  , // ✅ add this,
    PanelMenuModule,
    AccordionModule
  ]
})
export class PagesModule { }
