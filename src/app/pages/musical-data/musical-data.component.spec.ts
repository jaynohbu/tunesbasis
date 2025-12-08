import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MusicalDataComponent } from './musical-data.component';

describe('MusicalDataComponent', () => {
  let component: MusicalDataComponent;
  let fixture: ComponentFixture<MusicalDataComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ MusicalDataComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MusicalDataComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
