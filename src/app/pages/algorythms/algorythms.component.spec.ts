import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AlgorythmsComponent } from './algorythms.component';

describe('AlgorythmsComponent', () => {
  let component: AlgorythmsComponent;
  let fixture: ComponentFixture<AlgorythmsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ AlgorythmsComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AlgorythmsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
