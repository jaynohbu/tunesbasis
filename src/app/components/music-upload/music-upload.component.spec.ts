import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MusicUploadComponent } from './music-upload.component';

describe('MusicUploadComponent', () => {
  let component: MusicUploadComponent;
  let fixture: ComponentFixture<MusicUploadComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ MusicUploadComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MusicUploadComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
