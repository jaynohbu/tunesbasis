import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MlMetricsComponent } from './ml-metrics.component';

describe('MlMetricsComponent', () => {
  let component: MlMetricsComponent;
  let fixture: ComponentFixture<MlMetricsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ MlMetricsComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MlMetricsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
