import { TestBed } from '@angular/core/testing';

import { MusicUploadService } from './music-upload.service';

describe('MusicUploadService', () => {
  let service: MusicUploadService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MusicUploadService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
