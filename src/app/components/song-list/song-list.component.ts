import { Component, Input, Output, EventEmitter } from '@angular/core';
import { Song } from '../../model/song';
import { SongDTO } from 'src/app/services/music-upload.service';

@Component({
  selector: 'song-list',
  templateUrl: './song-list.component.html'
})
export class SongListComponent {
  @Input() songs: SongDTO[] = [];
  @Input() activeSongId: string | null = null;

  @Output() load = new EventEmitter<SongDTO>();
}
