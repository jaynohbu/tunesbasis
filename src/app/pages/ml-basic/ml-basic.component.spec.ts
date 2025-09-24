import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MlBasicComponent } from './ml-basic.component';

describe('MlBasicComponent', () => {
  let component: MlBasicComponent;
  let fixture: ComponentFixture<MlBasicComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ MlBasicComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MlBasicComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
