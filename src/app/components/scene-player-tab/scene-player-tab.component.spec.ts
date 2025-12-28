import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ScenePlayerTabComponent } from './scene-player-tab.component';

describe('ScenePlayerTabComponent', () => {
  let component: ScenePlayerTabComponent;
  let fixture: ComponentFixture<ScenePlayerTabComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ScenePlayerTabComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ScenePlayerTabComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
