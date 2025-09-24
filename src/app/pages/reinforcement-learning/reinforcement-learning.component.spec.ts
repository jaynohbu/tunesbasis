import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReinforcementLearningComponent } from './reinforcement-learning.component';

describe('ReinforcementLearningComponent', () => {
  let component: ReinforcementLearningComponent;
  let fixture: ComponentFixture<ReinforcementLearningComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ReinforcementLearningComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ReinforcementLearningComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
