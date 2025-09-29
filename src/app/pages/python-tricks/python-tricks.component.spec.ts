import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PythonTricksComponent } from './python-tricks.component';

describe('PythonTricksComponent', () => {
  let component: PythonTricksComponent;
  let fixture: ComponentFixture<PythonTricksComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ PythonTricksComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PythonTricksComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
