import {
  Component,
  Input,
  ViewChild,
  AfterViewInit,
  Output,
  EventEmitter
} from '@angular/core';
import { Scene } from 'src/app/model/scene';
import { MusicPlayerComponent } from 'src/app/pages/music-player/music-player.component';

@Component({
  selector: 'scene-player-tab',
  templateUrl: './scene-player-tab.component.html',
  styleUrls: ['./scene-player-tab.component.scss']
})
export class ScenePlayerTabComponent implements AfterViewInit {

  @Input() scene!: Scene;

  /** emit updated scene to parent */
  @Output() sceneUpdated = new EventEmitter<Scene>();

  /** real player instance */
  @ViewChild(MusicPlayerComponent)
  player!: MusicPlayerComponent;

  /** overlay visibility */
  overlayOpen = false;

  /** selected (but not yet loaded) song index */
  selectedIndex: number | null = null;

  ngAfterViewInit(): void {
    console.log('[ScenePlayerTab] MusicPlayer bound:', !!this.player);
  }

  /* ================= SONG LOADING ================= */

  onLoadSong(index: number) {
    if (!this.player) {
      console.warn('[ScenePlayerTab] Cannot load song — player not ready');
      return;
    }

    console.log('[ScenePlayerTab] Load song:', index);

    this.selectedIndex = index;

    // wipe previous song completely
    this.player.resetPlayer();

    // load selected song
    this.player.loadFromScene(index);

    // close overlay
    this.overlayOpen = false;
  }

  /* ================= SCENE UPDATE ================= */

  onUpdateScene() {
    if (!this.player) {
      console.warn('[ScenePlayerTab] Cannot update scene — player not ready');
      return;
    }

    console.log('[ScenePlayerTab] Update Scene:', this.scene.name);

    // snapshot from player (contains live stem state)
    const updatedScene = this.player.captureCurrentSceneState();

    // emit upward for persistence
    this.sceneUpdated.emit(updatedScene);
  }

  onSceneChange(scene: Scene) {
    this.scene = scene;
  }

  /* ================= OVERLAY ================= */

  toggleOverlay() {
    this.overlayOpen = !this.overlayOpen;
  }
}
