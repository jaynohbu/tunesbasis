import { Component, Input, Output, EventEmitter } from '@angular/core';
import { SongDTO } from 'src/app/services/music-upload.service';
import { Scene, SceneSong, StemSettings } from '../../model/scene';

@Component({
  selector: 'scene-editor',
  templateUrl: './scene-editor.component.html',
  styleUrls: ['./scene-editor.component.scss']
})
export class SceneEditorComponent {

  @Input() songs: SongDTO[] = [];

  @Output() sceneChange = new EventEmitter<Scene>();

  scene: Scene = {
    name: 'New Scene',
    items: []
  };

  intervalOptions = [
    { label: '10 sec', value: 10 },
    { label: '30 sec', value: 30 },
    { label: '1 min', value: 60 },
    { label: '5 min', value: 300 },
    { label: '10 min', value: 600 },
    { label: '30 min', value: 1800 },
    { label: '1 hour', value: 3600 }
  ];

  globalInterval = 30;

  addSong(song: SongDTO) {
    const stems: Record<string, StemSettings> = {};

    // initialize per-stem defaults
    Object.keys(song.stems ?? {}).forEach(stem => {
      stems[stem] = {
        volume: 1,
        muted: false,
        pregain: 0.3,
        compression: 0,
        tone: 0.7,
        distortion: 0
      };
    });

    this.scene.items.push({
      song,
      intervalSec: this.globalInterval,
      stems
    });

    this.emit();
  }

  applyGlobalInterval() {
    this.scene.items.forEach(i => i.intervalSec = this.globalInterval);
    this.emit();
  }

  updateStem(
    index: number,
    stem: string,
    patch: Partial<StemSettings>
  ) {
    Object.assign(this.scene.items[index].stems[stem], patch);
    this.emit();
  }

  moveUp(i: number) {
    if (i === 0) return;
    [this.scene.items[i - 1], this.scene.items[i]] =
      [this.scene.items[i], this.scene.items[i - 1]];
    this.emit();
  }

  moveDown(i: number) {
    if (i === this.scene.items.length - 1) return;
    [this.scene.items[i + 1], this.scene.items[i]] =
      [this.scene.items[i], this.scene.items[i + 1]];
    this.emit();
  }

  remove(i: number) {
    this.scene.items.splice(i, 1);
    this.emit();
  }

  private emit() {
    this.sceneChange.emit(this.scene);
  }
}
