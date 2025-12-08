import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TimeSeriesComponent } from './time-series/time-series.component';
import { MlBasicComponent } from './ml-basic/ml-basic.component';
import { MlMetricsComponent } from './ml-metrics/ml-metrics.component';
import { HomeComponent } from './home/home.component';
import { ReinforcementLearningComponent } from './reinforcement-learning/reinforcement-learning.component';
import { AlgorythmsComponent } from './algorythms/algorythms.component';
import { PythonTricksComponent } from './python-tricks/python-tricks.component';
import { MusicalDataComponent } from './musical-data/musical-data.component';

const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'time-series', component: TimeSeriesComponent },
  { path: 'ml-basic', component: MlBasicComponent },
  { path: 'ml-metrics', component: MlMetricsComponent },
  { path: 'reinforcement-learning', component: ReinforcementLearningComponent },
  { path: 'algorythms', component: AlgorythmsComponent },
  { path: 'python-tricks', component: PythonTricksComponent },
  { path: 'music-data', component: MusicalDataComponent },

  
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class PagesRoutingModule { }
