import {
  Component,
  Input,
  ViewChild,
  AfterViewInit,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges
} from '@angular/core';
import { Scene } from 'src/app/model/scene';
import { MusicPlayerComponent } from 'src/app/pages/music-player/music-player.component';

@Component({
  selector: 'scene-player-tab',
  templateUrl: './scene-player-tab.component.html',
  styleUrls: ['./scene-player-tab.component.scss']
})
export class ScenePlayerTabComponent implements AfterViewInit, OnChanges {

  @Input() scene!: Scene;
  @Input() isActive = false;

  /** emit updated scene to parent */
  @Output() sceneUpdated = new EventEmitter<Scene>();

  /** emit copy scene request to parent */
  @Output() sceneCopied = new EventEmitter<Scene>();

  /** real player instance */
  @ViewChild(MusicPlayerComponent)
  player!: MusicPlayerComponent;

  /** overlay visibility */
  overlayOpen = false;

  /** selected (but not yet loaded) song index */
  selectedIndex: number | null = null;

  /** track if this tab has ever been loaded */
  private hasBeenLoaded = false;

  ngAfterViewInit(): void {
    console.log('[ScenePlayerTab] MusicPlayer bound:', !!this.player);
  }

  ngOnChanges(changes: SimpleChanges): void {
    // When tab becomes active for the first time, trigger load
    if (changes['isActive'] && this.isActive && !this.hasBeenLoaded) {
      console.log(`[ScenePlayerTab] Tab "${this.scene?.name}" became active for first time`);
      this.hasBeenLoaded = true;
      // The music-player will auto-load via its own ngOnChanges
    }

    // When tab becomes active again (switching back), ensure player is ready
    if (changes['isActive'] && this.isActive && this.hasBeenLoaded && changes['isActive'].previousValue === false) {
      console.log(`[ScenePlayerTab] Tab "${this.scene?.name}" became active again (switching back)`);
      // Player already loaded, no need to reload
    }
  }

  /* ================= SONG LOADING ================= */

  onLoadSong(index: number) {
    if (!this.player) {
      console.warn('[ScenePlayerTab.onLoadSong] Cannot load song — player not ready');
      return;
    }

    console.log('[ScenePlayerTab.onLoadSong] User selected song at index:', index, {
      sceneName: this.scene?.name,
      songName: this.scene?.items[index]?.song?.originalName
    });

    this.selectedIndex = index;

    // wipe previous song completely
    this.player.resetPlayer();

    // load selected song
    this.player.loadFromScene(index);

    // close overlay
    this.overlayOpen = false;
  }

  /* ================= SAVE SONG SETTINGS ================= */

  onUpdateScene() {
    if (!this.player) {
      console.warn('[ScenePlayerTab.onUpdateScene] Cannot save song settings — player not ready');
      return;
    }

    console.log('[ScenePlayerTab.onUpdateScene] User clicked Save Song Settings for:', this.scene.name);

    // snapshot from player (contains live stem state)
    const updatedScene = this.player.captureCurrentSceneState();

    // emit upward for persistence
    this.sceneUpdated.emit(updatedScene);
  }

  onSceneChange(scene: Scene) {
    this.scene = scene;
  }

  /* ================= COPY SCENE ================= */

  onCopyScene() {
    console.log('[ScenePlayerTab.onCopyScene] User clicked Copy Scene for:', this.scene.name);

    // emit upward to dashboard to create a copy with default settings
    this.sceneCopied.emit(this.scene);
  }

  /* ================= OVERLAY ================= */

  toggleOverlay() {
    this.overlayOpen = !this.overlayOpen;
  }
}
