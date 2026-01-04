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
import { SongDTO } from 'src/app/services/music-upload.service';

@Component({
  selector: 'scene-player-tab',
  templateUrl: './scene-player-tab.component.html',
  styleUrls: ['./scene-player-tab.component.scss']
})
export class ScenePlayerTabComponent implements AfterViewInit, OnChanges {

  @Input() scene!: Scene;
  @Input() isActive = false;
  @Input() allSongs: SongDTO[] = [];
  @Input() groupId: string | null = null;

  /** emit updated scene to parent */
  @Output() sceneUpdated = new EventEmitter<Scene>();

  /** emit copy scene request to parent */
  @Output() sceneCopied = new EventEmitter<Scene>();

  /** emit delete scene request to parent */
  @Output() sceneDeleted = new EventEmitter<Scene>();

  /** emit delete song request to parent (sceneId, songIndex) */
  @Output() songDeleted = new EventEmitter<{ sceneId: string; songIndex: number }>();

  /** emit add song request to parent */
  @Output() songAdded = new EventEmitter<SongDTO>();

  /** emit toggle sharing request to parent */
  @Output() toggleSharing = new EventEmitter<{ sceneId: string; shared: boolean }>();

  /** emit jamming saved request to parent to reload scenes */
  @Output() jammingSaved = new EventEmitter<void>();

  /** emit recording state change to parent to disable/enable tabs */
  @Output() recordingStateChanged = new EventEmitter<boolean>();

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
    // Log all songs input changes
    if (changes['allSongs']) {
      console.log('[ScenePlayerTab.ngOnChanges] allSongs changed:', {
        previousCount: changes['allSongs'].previousValue?.length || 0,
        currentCount: changes['allSongs'].currentValue?.length || 0,
        songs: changes['allSongs'].currentValue?.map((s: SongDTO) => s.originalName) || []
      });
    }

    // When tab becomes active (first time or switching back)
    if (changes['isActive'] && this.isActive) {
      if (!this.hasBeenLoaded) {
        console.log(`[ScenePlayerTab] Tab "${this.scene?.name}" became active for first time`);
        this.hasBeenLoaded = true;
      } else if (changes['isActive'].previousValue === false) {
        console.log(`[ScenePlayerTab] Tab "${this.scene?.name}" became active again (switching back)`);
        // Music player's ngOnChanges will handle the reload automatically
        // since we clear stems when tab becomes inactive
      }
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
    if (!this.scene?.sceneId) {
      console.warn('[ScenePlayerTab.onDeleteSong] Cannot delete song — scene has no ID');
      return;
    }

    console.log('[ScenePlayerTab.onDeleteSong] User deleting song at index:', index, {
      sceneId: this.scene.sceneId,
      sceneName: this.scene?.name,
      songName: this.scene?.items[index]?.song?.originalName
    });

    // Emit delete request to parent dashboard
    // Dashboard will handle the API call and reload the scene
    // Note: Overlay should stay open during deletion
    this.songDeleted.emit({ sceneId: this.scene.sceneId, songIndex: index });

    console.log('[ScenePlayerTab.onDeleteSong] Delete event emitted, overlay should remain open');
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

  onDefaultsInitialized() {
    console.log('[ScenePlayerTab.onDefaultsInitialized] Default settings initialized, saving to backend');
    // Save the default settings to backend
    this.sceneUpdated.emit(this.scene);
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

  /* ================= ADD SONG ================= */

  onAddSong(song: SongDTO) {
    console.log('[ScenePlayerTab.onAddSong] Adding song to scene:', song.originalName);

    // Add the song to the scene
    this.scene.items.push({
      song,
      intervalSec: 10,
      stems: {}
    });

    // Save the updated scene
    this.sceneUpdated.emit(this.scene);

    console.log('[ScenePlayerTab.onAddSong] Song added successfully, scene now has', this.scene.items.length, 'songs');
  }

  /* ================= OVERLAY ================= */

  toggleOverlay() {
    this.overlayOpen = !this.overlayOpen;
  }

  /* ================= SCENE SHARING ================= */

  onToggleSharing(shared: boolean) {
    if (!this.scene.sceneId) {
      console.warn('[ScenePlayerTab.onToggleSharing] Scene has no ID');
      return;
    }
    console.log('[ScenePlayerTab.onToggleSharing] Emitting toggle sharing:', { sceneId: this.scene.sceneId, shared });
    this.toggleSharing.emit({ sceneId: this.scene.sceneId, shared });
  }

  /* ================= JAMMING SAVED ================= */

  onJammingSaved() {
    console.log('[ScenePlayerTab.onJammingSaved] Jamming saved, emitting to dashboard to reload scenes');
    this.jammingSaved.emit();
  }

  /* ================= RECORDING STATE ================= */

  onRecordingStateChanged(isRecording: boolean) {
    console.log('[ScenePlayerTab.onRecordingStateChanged] Recording state:', isRecording);
    this.recordingStateChanged.emit(isRecording);
  }

  /* ================= HELPER METHODS ================= */

  isInJamSession(): boolean {
    return this.player?.isInJamSession() || false;
  }

  isJammingsScene(): boolean {
    return this.scene?.name === 'Jammings';
  }
}
