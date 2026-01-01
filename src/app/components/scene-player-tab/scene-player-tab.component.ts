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

  /** emit delete scene request to parent */
  @Output() sceneDeleted = new EventEmitter<Scene>();

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

  onDeleteSong(index: number) {
    if (!this.player) {
      console.warn('[ScenePlayerTab.onDeleteSong] Cannot delete song — player not ready');
      return;
    }

    console.log('[ScenePlayerTab.onDeleteSong] User deleting song at index:', index, {
      sceneName: this.scene?.name,
      songName: this.scene?.items[index]?.song?.originalName
    });

    // Get current playing index
    const currentIndex = this.player.activeIndex;

    // Remove the song from the scene
    this.scene.items.splice(index, 1);

    // Determine next song to load
    let nextIndex = index;
    if (nextIndex >= this.scene.items.length) {
      nextIndex = this.scene.items.length - 1; // Move to last song
    }

    // If we deleted the currently playing song, load the next one
    if (index === currentIndex) {
      if (this.scene.items.length > 0) {
        console.log('[ScenePlayerTab.onDeleteSong] Loading next song at index:', nextIndex);
        this.player.resetPlayer();
        this.player.loadFromScene(nextIndex);
        this.selectedIndex = nextIndex;
      } else {
        console.log('[ScenePlayerTab.onDeleteSong] No songs left in scene');
        this.player.resetPlayer();
        this.selectedIndex = null;
      }
    } else if (index < currentIndex) {
      // If we deleted a song before the current one, adjust the current index
      this.player.activeIndex = currentIndex - 1;
    }

    // Save the updated scene
    this.sceneUpdated.emit(this.scene);
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
    console.log('[ScenePlayerTab.onSceneChange] Scene changed, saving to backend');
    this.scene = scene;
    // Save the updated scene to backend
    this.sceneUpdated.emit(this.scene);
  }

  onSongRenamed() {
    console.log('[ScenePlayerTab.onSongRenamed] Song was renamed');
    // No need to emit anything, the song name is already updated in the scene object
  }

  /* ================= COPY SCENE ================= */

  onCopyScene() {
    console.log('[ScenePlayerTab.onCopyScene] User clicked Copy Scene for:', this.scene.name);

    // emit upward to dashboard to create a copy with default settings
    this.sceneCopied.emit(this.scene);
  }

  /* ================= DELETE SCENE ================= */

  onDeleteScene() {
    console.log('[ScenePlayerTab.onDeleteScene] User clicked Delete Scene for:', this.scene.name);

    // emit upward to dashboard to delete the scene
    this.sceneDeleted.emit(this.scene);
  }

  /* ================= OVERLAY ================= */

  toggleOverlay() {
    this.overlayOpen = !this.overlayOpen;
  }
}
