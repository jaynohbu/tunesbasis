import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  SimpleChanges,
  OnDestroy,
  ViewChild,
  NgZone
} from '@angular/core';
import { Scene, SceneSong, StemSettings } from 'src/app/model/scene';
import { MusicPlayerEngine, StemInfo, KnobParam } from './music-player.engine';
import { CachedSong } from 'src/app/services/audio-cache.service';
import { AuthService } from 'src/app/services/auth.service';
import { JamSessionComponent } from 'src/app/components/jam-session/jam-session.component';
import { ParticipantAudioStream } from 'src/app/services/webrtc-audio.service';
import { RecordedStem } from 'src/app/services/recording-to-stem.service';
import { ConfirmationService, MessageService } from 'primeng/api';
import { MusicUploadService } from 'src/app/services/music-upload.service';
import { SceneService } from 'src/app/services/scene.service';

@Component({
  selector: 'music-player',
  templateUrl: './music-player.component.html',
  styleUrls: ['./music-player.component.scss']
})
export class MusicPlayerComponent implements OnInit, OnChanges, OnDestroy {

  @Input() scene!: Scene;
  @Input() activeIndex = 0;
  @Input() isTabActive = false;
  @Input() groupId: string | null = null;

  @Output() defaultsInitialized = new EventEmitter<void>();
  @Output() jammingSaved = new EventEmitter<void>();
  @Output() recordingStateChanged = new EventEmitter<boolean>();

  @ViewChild(JamSessionComponent) jamSessionComponent?: JamSessionComponent;

  stems: StemInfo[] = [];

  /* ================= LOCALSTORAGE KEYS ================= */
  private readonly STORAGE_KEY_SONG_INDEX = 'tunesbasis.activeSongIndex';

  private readonly STEM_ORDER = [
    'drums',
    'bass',
    'guitar',
    'piano',
    'vocals',
    'other'
  ];

  public playerEngine = new MusicPlayerEngine();
  private engine = this.playerEngine; // Alias for backward compatibility

  globalVolume = 1;

  get playing(): boolean {
    return this.engine.isPlaying();
  }

  get stemVolumes(): Record<string, number> {
    return new Proxy({}, {
      get: (_, stem: string) => this.engine.getStemVolume(stem)
    });
  }

  get stemMuted(): Record<string, boolean> {
    return new Proxy({}, {
      get: (_, stem: string) => this.engine.isStemMuted(stem)
    });
  }

  get stemBypassLED(): Record<string, boolean> {
    return new Proxy({}, {
      get: (_, stem: string) => this.engine.getStemBypassLED(stem)
    });
  }

  get stemKnobs(): Record<string, { pregain: number; compression: number; tone: number; distortion: number; eqLow: number; eqMid: number; eqHigh: number; reverb: number }> {
    return new Proxy({} as any, {
      get: (_, stem: string) => this.engine.getStemKnobs(stem)
    });
  }

  cursorPercent = 0;
  cursorRaf: number | null = null;

  waveformsDrawn = 0;
  waveformsReady = false;

  private isRestoring = false;
  private isLoading = false;

  // Scene playback
  playingScene = false;
  private scenePlaybackTimer: any = null;

  // Recorded mic stems
  private _recordedMicStems: RecordedStem[] = [];
  get recordedMicStems(): RecordedStem[] {
    return this._recordedMicStems;
  }
  set recordedMicStems(value: RecordedStem[]) {
    console.log('[MusicPlayer] recordedMicStems setter called:', {
      oldLength: this._recordedMicStems.length,
      newLength: value.length,
      stack: new Error().stack
    });
    this._recordedMicStems = value;
  }
  showingLiveMics = true;

  // Local microphone (before joining jam session)
  localMicEnabled = false;
  private localMicStream: MediaStream | null = null;

  // Auto-save debounce timer
  private autoSaveTimer: any = null;

  constructor(
    private authService: AuthService,
    private confirmationService: ConfirmationService,
    private messageService: MessageService,
    private musicUploadService: MusicUploadService,
    private sceneService: SceneService,
    private zone: NgZone
  ) {}

  async ngOnInit() {
    console.log('[MusicPlayer] Component initialized, recordedMicStems:', this.recordedMicStems.length);
    // Set auth token for streaming requests
    const token = await this.authService.getIdToken();
    this.engine.setAuthToken(token);
  }

  ngOnChanges(changes: SimpleChanges) {
    // Log all changes for debugging
    if (changes['scene']) {
      console.log(`[MusicPlayer.ngOnChanges] scene changed for "${this.scene?.name}"`, {
        hasItems: !!this.scene?.items?.length,
        itemCount: this.scene?.items?.length || 0,
        isTabActive: this.isTabActive,
        stemsLength: this.stems?.length || 0
      });

      // Check if scene items changed (song was added/deleted)
      if (!changes['scene'].firstChange && this.isTabActive) {
        const prevItemCount = changes['scene'].previousValue?.items?.length || 0;
        const currItemCount = this.scene?.items?.length || 0;

        if (prevItemCount !== currItemCount) {
          console.log(`[MusicPlayer.ngOnChanges] Scene items changed: ${prevItemCount} -> ${currItemCount}`);

          // If current song was deleted or scene is now empty, stop playback
          if (this.activeIndex >= currItemCount || currItemCount === 0) {
            console.log(`[MusicPlayer.ngOnChanges] Current song was deleted, stopping playback`);
            if (this.engine.isPlaying()) {
              this.engine.togglePlay();
              this.stopCursorLoop();
            }
            this.stems = [];
            this.waveformsDrawn = 0;
            this.waveformsReady = false;

            // Load first song if scene still has songs
            if (currItemCount > 0) {
              this.activeIndex = 0;
              console.log(`[MusicPlayer.ngOnChanges] Loading first song after deletion`);
              this.loadFromScene(0);
            }
            return;
          }

          // Current song still exists, but need to reload to update UI
          console.log(`[MusicPlayer.ngOnChanges] Reloading current song after scene change`);
          this.loadFromScene(this.activeIndex);
          return;
        }
      }
    }

    if (changes['isTabActive']) {
      console.log(`[MusicPlayer.ngOnChanges] isTabActive changed for "${this.scene?.name}"`, {
        previousValue: changes['isTabActive'].previousValue,
        currentValue: changes['isTabActive'].currentValue,
        hasSceneData: !!this.scene?.items?.length,
        stemsLength: this.stems?.length || 0
      });
    }

    // Try to load if conditions are met (check on ANY change)
    if (this.isTabActive && this.stems?.length === 0 && this.scene?.items?.length) {
      const restoredIndex = this.restoreActiveSongIndex(this.scene);
      this.activeIndex = restoredIndex;
      console.log(`[MusicPlayer.ngOnChanges] ✅ All conditions met - loading scene "${this.scene.name}" at index ${restoredIndex}`);
      this.loadFromScene(restoredIndex);
      return; // Exit early after triggering load
    }

    // Handle tab deactivation (stop playback and clear stems to allow reload on reactivation)
    if (changes['isTabActive'] && !this.isTabActive) {
      console.log(`[MusicPlayer.ngOnChanges] Tab became inactive for "${this.scene?.name}"`);

      // CRITICAL: Fully stop and reset audio engine to prevent multiple songs playing
      console.log(`[MusicPlayer.ngOnChanges] Stopping and resetting audio engine`);
      this.stopCursorLoop();
      this.stopScenePlayback();
      this.engine.reset(); // Fully stop all audio sources and clean up

      // Clear stems so that when tab becomes active again, ngOnChanges will reload
      console.log(`[MusicPlayer.ngOnChanges] Clearing stems to allow reload on reactivation`);
      this.stems = [];
      this.waveformsDrawn = 0;
      this.waveformsReady = false;
    }
  }

  ngOnDestroy() {
    console.log('[MusicPlayer] Component destroyed, recordedMicStems:', this.recordedMicStems.length);
    this.stopCursorLoop();
    this.stopScenePlayback();

    // Clear auto-save timer
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }

    // Note: Don't call engine.destroy() here because Angular might reuse the component
    // The engine will clean up audio nodes in reset() when loading new scenes
  }

  private normalizeSceneItem(item: any) {
    // Backend stores stem settings in soundState.stems
    // We need to map it to item.stems for the component to use
    console.log('[normalizeSceneItem] Input:', {
      hasSoundState: !!item.soundState,
      hasSoundStateStems: !!item.soundState?.stems,
      soundStateKeys: item.soundState ? Object.keys(item.soundState) : [],
      hasStems: !!item.stems,
      stemsKeys: item.stems ? Object.keys(item.stems) : [],
      hasSong: !!item.song
    });

    // Special case: Jam session recordings (no real song in Songs table)
    // For these, soundState.stems contains the stem URLS (not settings)
    if (!item.song && item.soundState?.stems && Array.isArray(item.soundState.stems)) {
      console.log('[normalizeSceneItem] Jam session detected - creating fake song from soundState');
      // Create a fake song object with stems from soundState
      item.song = {
        songId: item.songId,
        originalName: item.soundState.originalName || item.songId,
        stems: item.soundState.stems, // Array of {name, url}
        status: 'ready',
        entityType: 'SONG'
      };
      // Initialize empty stems settings (will be populated as user adjusts)
      item.stems = {};
    }

    // Normal case: Real song from Songs table
    if (!item.stems) {
      if (item.soundState?.stems) {
        // Backend format: soundState.stems contains the stem settings
        console.log('[normalizeSceneItem] Using soundState.stems, keys:', Object.keys(item.soundState.stems));
        item.stems = item.soundState.stems;
      } else if (item.soundState) {
        // Legacy format: soundState directly contains stem settings
        console.log('[normalizeSceneItem] Using soundState directly, keys:', Object.keys(item.soundState));
        item.stems = item.soundState;
      }
    } else if (item.stems.stems && item.stems.originalName) {
      // Handle nested stems case - backend returns { originalName: "...", stems: {...} }
      console.log('[normalizeSceneItem] Extracting nested stems, keys:', Object.keys(item.stems.stems));
      item.stems = item.stems.stems;
    } else {
      console.log('[normalizeSceneItem] Already has stems in correct format, keys:', Object.keys(item.stems));
    }
  }

  async loadFromScene(index = 0) {
    console.log('[MusicPlayer.loadFromScene] Called', {
      index,
      sceneName: this.scene?.name,
      itemCount: this.scene?.items?.length,
      isLoading: this.isLoading
    });

    if (!this.scene?.items?.length) {
      console.warn('[MusicPlayer.loadFromScene] No scene or items');
      return;
    }

    // Prevent multiple simultaneous loads
    if (this.isLoading) {
      console.warn('[MusicPlayer.loadFromScene] ⚠️ BLOCKED - Already loading, ignoring duplicate call');
      return;
    }

    this.isLoading = true;
    console.log('[MusicPlayer.loadFromScene] 🔒 Lock acquired, starting load...');

    // Update activeIndex and save to localStorage
    this.activeIndex = index;
    this.saveActiveSongIndex();

    const item = this.scene.items[index];
    this.normalizeSceneItem(item);

    const song = item.song;

    if (!song?.stems || typeof song.stems !== 'object') {
      console.error('[MusicPlayer.loadFromScene] Invalid stems:', song?.stems);
      this.isLoading = false;
      return;
    }

    console.log('[MusicPlayer.loadFromScene] Loading song:', {
      songId: song.songId,
      originalName: song.originalName,
      stemCount: Array.isArray(song.stems) ? song.stems.length : Object.keys(song.stems).length
    });

    this.stopCursorLoop();
    this.waveformsDrawn = 0;
    this.waveformsReady = false;

    const rawStems = song.stems;

    const stemList: StemInfo[] = Array.isArray(rawStems)
      ? rawStems.filter(s => s?.name && s?.url).map(s => ({ name: s.name, url: s.url }))
      : Object.entries(rawStems)
          .filter(([, url]) => typeof url === 'string')
          .map(([name, url]) => ({ name, url: url as string }));

    this.stems = stemList.sort(
      (a, b) =>
        this.STEM_ORDER.indexOf(a.name) -
        this.STEM_ORDER.indexOf(b.name)
    );

    try {
      const cachedSong = await this.engine.loadBuffers(this.stems, song.songId, song.originalName);

      console.log('[MusicPlayer.loadFromScene] Buffers loaded, drawing waveforms...');

      if (cachedSong) {
        // Use cached waveform peaks for instant rendering
        console.log('[MusicPlayer.loadFromScene] Using cached waveform peaks');
        for (const cachedStem of cachedSong.stems) {
          requestAnimationFrame(() =>
            this.drawWaveformFromPeaks(cachedStem.name, cachedStem.waveformPeaks)
          );
        }

        // Note: Streaming upgrade happens automatically when user presses play (500ms delay)
        console.log('[MusicPlayer.loadFromScene] Ready for playback (will stream on play)');
      } else {
        // Draw waveforms from buffers (first load)
        for (const stem of this.stems) {
          const buffer = this.engine.getBuffer(stem.name);
          if (buffer) {
            requestAnimationFrame(() =>
              this.drawWaveform(stem.name, buffer)
            );
          }
        }
      }

      if (item.stems && Object.keys(item.stems).length > 0) {
        console.log('[MusicPlayer.loadFromScene] Restoring stem settings...', Object.keys(item.stems));
        this.restoreStemSettings(item.stems);
      } else {
        console.log('[MusicPlayer.loadFromScene] No saved settings - initializing with engine defaults');
        // Get engine defaults and apply them to audio nodes
        if (!item.stems) item.stems = {};
        const defaultSettings = this.engine.getAllStemSettings();
        Object.keys(defaultSettings).forEach(stemName => {
          item.stems![stemName] = defaultSettings[stemName];
        });
        console.log('[MusicPlayer.loadFromScene] Default settings stored:', Object.keys(item.stems));
        // Apply defaults to audio nodes (this is critical - otherwise audio nodes have uninitialized values)
        this.restoreStemSettings(defaultSettings);
        // Notify parent to save these defaults to backend
        this.defaultsInitialized.emit();
      }

      console.log('[MusicPlayer.loadFromScene] ✅ Load complete');
    } catch (error) {
      console.error('[MusicPlayer.loadFromScene] ❌ Load failed:', error);
    } finally {
      this.isLoading = false;
      console.log('[MusicPlayer.loadFromScene] 🔓 Lock released');
    }
  }

  restoreStemSettings(settings: Record<string, StemSettings>) {
    this.isRestoring = true;
    this.engine.restoreStemSettings(settings);
    this.isRestoring = false;
  }

  persistStemState(stem: string) {
    if (this.isRestoring) return;

    const item = this.scene.items[this.activeIndex];
    if (!item.stems) item.stems = {};

    const allSettings = this.engine.getAllStemSettings();
    item.stems[stem] = allSettings[stem];

    // Trigger auto-save with debounce
    this.scheduleAutoSave();
  }

  captureCurrentSceneState(): Scene {
    // Before capturing, ensure ALL current stem settings are saved to the scene
    const item = this.scene.items[this.activeIndex];
    if (item) {
      if (!item.stems) {
        item.stems = {};
      }

      // Capture all current stem settings from engine
      const allSettings = this.engine.getAllStemSettings();
      Object.keys(allSettings).forEach(stemName => {
        item.stems![stemName] = allSettings[stemName];
      });
    }

    return JSON.parse(JSON.stringify(this.scene));
  }

  togglePlay() {
    this.engine.togglePlay();
    if (this.engine.isPlaying()) {
      this.startCursorLoop();
    } else {
      this.stopCursorLoop();
    }
  }

  setGlobalVolume(v: number) {
    this.globalVolume = Number(v);
    this.engine.setGlobalVolume(this.globalVolume);
  }

  setStemVolume(name: string, v: number) {
    const value = Number(v);
    this.engine.setStemVolume(name, value);
    this.persistStemState(name);
  }

  toggleMute(name: string) {
    this.engine.toggleMute(name);
    this.persistStemState(name);
  }

  isDistortable(name: string) {
    return this.engine.isDistortable(name);
  }

  setKnob(stem: string, param: KnobParam, value: number) {
    this.engine.setKnob(stem, param, value);
    this.persistStemState(stem);
  }

  startCursorLoop() {
    console.log('[Cursor] Starting cursor loop');
    const tick = () => {
      if (!this.engine.isPlaying()) {
        console.log('[Cursor] Engine not playing, stopping cursor loop');
        return;
      }

      const elapsed = this.engine.getCurrentTime();
      const maxDuration = this.engine.getMaxDuration();
      const newPercent = Math.min(100, (elapsed / maxDuration) * 100);

      // Run inside Angular zone to trigger change detection
      this.zone.run(() => {
        this.cursorPercent = newPercent;
      });

      this.cursorRaf = requestAnimationFrame(tick);
    };

    tick();
  }

  stopCursorLoop() {
    if (this.cursorRaf !== null) {
      cancelAnimationFrame(this.cursorRaf);
      this.cursorRaf = null;
    }
  }

  drawWaveform(name: string, buffer: AudioBuffer) {
    const canvas = document.querySelector<HTMLCanvasElement>(
      `canvas[data-stem="${name}"]`
    );
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let data: Float32Array;
    if (buffer.numberOfChannels > 1) {
      const ch0 = buffer.getChannelData(0);
      const ch1 = buffer.getChannelData(1);
      data = new Float32Array(ch0.length);
      for (let i = 0; i < ch0.length; i++) {
        data[i] = (ch0[i] + ch1[i]) * 0.5;
      }
    } else {
      data = buffer.getChannelData(0);
    }

    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#4caf50';

    const step = Math.max(1, Math.floor(data.length / w));
    const mid = h / 2;

    for (let x = 0; x < w; x++) {
      let min = 1;
      let max = -1;
      for (let i = x * step; i < (x + 1) * step && i < data.length; i++) {
        const v = data[i];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      ctx.fillRect(x, mid + min * mid, 1, Math.max(1, (max - min) * mid));
    }

    this.waveformsDrawn++;
    if (this.waveformsDrawn === this.stems.length) {
      this.waveformsReady = true;
    }
  }

  drawWaveformFromPeaks(name: string, peaks: { min: number; max: number }[]) {
    const canvas = document.querySelector<HTMLCanvasElement>(
      `canvas[data-stem="${name}"]`
    );
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#4caf50';

    const mid = h / 2;
    const xScale = w / peaks.length;

    for (let x = 0; x < peaks.length; x++) {
      const peak = peaks[x];
      const xPos = Math.floor(x * xScale);
      ctx.fillRect(xPos, mid + peak.min * mid, Math.max(1, Math.ceil(xScale)), Math.max(1, (peak.max - peak.min) * mid));
    }

    this.waveformsDrawn++;
    if (this.waveformsDrawn === this.stems.length) {
      this.waveformsReady = true;
    }
  }

  loadScene(scene: Scene) {
    console.log('[MusicPlayer.loadScene] Called from external source', {
      sceneName: scene.name,
      itemCount: scene.items.length,
      isLoading: this.isLoading
    });

    if (this.isLoading) {
      console.warn('[MusicPlayer.loadScene] ⚠️ BLOCKED - Already loading, updating scene reference only');
      // Just update the scene reference, don't load yet
      this.scene = scene;
      this.activeIndex = this.restoreActiveSongIndex(scene);
      return;
    }

    this.scene = scene;
    this.activeIndex = this.restoreActiveSongIndex(scene);
    this.loadFromScene(this.activeIndex);
  }

  seekFromWave(e: MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));

    this.engine.seek(ratio);
    this.cursorPercent = ratio * 100;
  }

  knobDrag(e: MouseEvent, stem: string, param: KnobParam) {
    e.preventDefault();

    const startY = e.clientY;
    const knobs = this.engine.getStemKnobs(stem);
    const startVal = knobs[param];

    const move = (ev: MouseEvent) => {
      const delta = (startY - ev.clientY) / 150;
      const v = Math.min(1, Math.max(0, startVal + delta));
      this.setKnob(stem, param, v);
    };

    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };

    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  resetKnob(stem: string, param: KnobParam) {
    this.engine.resetKnob(stem, param);
    this.persistStemState(stem);
  }

  resetAllKnobs(stem: string) {
    console.log(`[MusicPlayer] Resetting all knobs for stem: ${stem}`);
    this.engine.resetKnob(stem, 'pregain');
    this.engine.resetKnob(stem, 'compression');
    this.engine.resetKnob(stem, 'tone');
    if (this.isDistortable(stem)) {
      this.engine.resetKnob(stem, 'distortion');
    }
    this.engine.resetKnob(stem, 'eqLow');
    this.engine.resetKnob(stem, 'eqMid');
    this.engine.resetKnob(stem, 'eqHigh');
    this.engine.resetKnob(stem, 'reverb');
    this.persistStemState(stem);
  }

  resetAllStemsAllKnobs() {
    console.log('[MusicPlayer] Resetting all knobs for all stems');
    for (const stem of this.stems) {
      this.resetAllKnobs(stem.name);
    }
    console.log('[MusicPlayer] All stems reset complete, auto-save will trigger after 1 second');
  }

  toggleBypassLED(stem: string) {
    this.engine.toggleBypassLED(stem);
    this.persistStemState(stem);
  }

  resetPlayer() {
    console.log('[MusicPlayer.resetPlayer] Resetting player state');
    this.engine.reset();
    this.stopCursorLoop();
    this.cursorPercent = 0;
    this.waveformsDrawn = 0;
    this.waveformsReady = false;
    this.stems = [];
  }

  /* ================= AUTO-SAVE SONG SETTINGS ================= */

  /**
   * Schedule auto-save with 1-second debounce
   * This ensures we only save the final state after user stops making changes
   */
  private scheduleAutoSave(): void {
    // Clear existing timer
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }

    // Schedule new save after 1 second
    this.autoSaveTimer = setTimeout(() => {
      this.autoSaveSongSettings();
    }, 1000);
  }

  /**
   * Auto-save current song settings to the scene
   * Updates only the current song's stem settings in the backend
   */
  private async autoSaveSongSettings(): Promise<void> {
    if (!this.scene || !this.scene.sceneId) {
      console.log('[AutoSave] No scene to save');
      return;
    }

    const currentItem = this.scene.items[this.activeIndex];
    if (!currentItem) {
      console.log('[AutoSave] No current item to save');
      return;
    }

    try {
      console.log('[AutoSave] Saving song settings for:', currentItem.song?.originalName);

      // Capture all current stem settings
      const allSettings = this.engine.getAllStemSettings();
      console.log('[AutoSave] Current stem settings:', allSettings);

      // Update the current item's stems
      if (!currentItem.stems) {
        currentItem.stems = {};
      }
      Object.keys(allSettings).forEach(stemName => {
        currentItem.stems![stemName] = allSettings[stemName];
      });

      console.log('[AutoSave] Updated currentItem.stems:', currentItem.stems);

      // Convert scene items to DTO format
      const itemsDTO = this.scene.items.map((item, index) => ({
        songId: item.song.songId,
        order: index,
        intervalSec: item.intervalSec,
        soundState: {
          originalName: item.song.originalName,
          stems: item.stems || {},
        }
      }));

      console.log('[AutoSave] Sending to backend:', {
        sceneId: this.scene.sceneId,
        currentItemIndex: this.activeIndex,
        soundStateStems: itemsDTO[this.activeIndex].soundState.stems
      });

      // Update the scene with the modified items
      await this.sceneService.updateScene(this.scene.sceneId, {
        items: itemsDTO
      });

      console.log('[AutoSave] ✅ Song settings saved successfully');
    } catch (error) {
      console.error('[AutoSave] ❌ Failed to save song settings:', error);
      // Don't show error to user - it's auto-save, just log it
    }
  }

  /* ================= LOCALSTORAGE PERSISTENCE ================= */

  private restoreActiveSongIndex(scene: Scene): number {
    const storageKey = this.getStorageKey(scene);
    const stored = localStorage.getItem(storageKey);
    if (stored !== null) {
      const index = parseInt(stored, 10);
      if (!isNaN(index) && index >= 0 && index < scene.items.length) {
        console.log(`[STORAGE] Restored activeSongIndex for scene "${scene.name}":`, index);
        return index;
      }
    }
    return 0; // Default to first song
  }

  private saveActiveSongIndex(): void {
    if (!this.scene) return;
    const storageKey = this.getStorageKey(this.scene);
    localStorage.setItem(storageKey, this.activeIndex.toString());
    console.log(`[STORAGE] Saved activeSongIndex for scene "${this.scene.name}":`, this.activeIndex);
  }

  private getStorageKey(scene: Scene): string {
    // Use sceneId to create unique storage key for each scene
    return `${this.STORAGE_KEY_SONG_INDEX}.${scene.sceneId}`;
  }

  /* ================= SCENE PLAYBACK ================= */

  getCurrentSongName(): string {
    if (!this.scene?.items?.[this.activeIndex]) return '';
    const song = this.scene.items[this.activeIndex].song;
    return song.sceneName || song.originalName;
  }

  getNextSongName(): string {
    const nextIndex = this.activeIndex + 1;
    if (!this.scene?.items?.[nextIndex]) return 'End of Scene';
    const song = this.scene.items[nextIndex].song;
    return song.sceneName || song.originalName;
  }

  togglePlayScene() {
    if (this.playingScene) {
      this.stopScenePlayback();
    } else {
      this.startScenePlayback();
    }
  }

  private startScenePlayback() {
    console.log('[MusicPlayer.startScenePlayback] Starting scene playback');
    this.playingScene = true;

    // Start playing current song if not already playing
    if (!this.engine.isPlaying()) {
      this.togglePlay();
    }

    // Monitor for song end
    this.monitorSongEnd();
  }

  private stopScenePlayback() {
    console.log('[MusicPlayer.stopScenePlayback] Stopping scene playback');
    this.playingScene = false;
    if (this.scenePlaybackTimer) {
      clearTimeout(this.scenePlaybackTimer);
      this.scenePlaybackTimer = null;
    }
  }

  private monitorSongEnd() {
    if (!this.playingScene) return;

    const checkEnd = () => {
      if (!this.playingScene) return;

      const currentTime = this.engine.getCurrentTime();
      const duration = this.engine.getMaxDuration();

      // Check if song has finished (with small buffer for timing issues)
      if (currentTime >= duration - 0.1) {
        console.log('[MusicPlayer.monitorSongEnd] Song finished, preparing next song');
        this.advanceToNextSong();
      } else {
        // Check again in 100ms
        this.scenePlaybackTimer = setTimeout(checkEnd, 100);
      }
    };

    checkEnd();
  }

  private async advanceToNextSong() {
    const nextIndex = this.activeIndex + 1;

    if (nextIndex >= this.scene.items.length) {
      console.log('[MusicPlayer.advanceToNextSong] Reached end of scene');
      this.stopScenePlayback();
      if (this.engine.isPlaying()) {
        this.togglePlay();
      }
      return;
    }

    // Get interval delay from current song
    const currentItem = this.scene.items[this.activeIndex];
    const intervalSec = currentItem.intervalSec || 0;

    console.log(`[MusicPlayer.advanceToNextSong] Waiting ${intervalSec}s before loading next song`);

    // Stop current playback
    if (this.engine.isPlaying()) {
      this.togglePlay();
    }

    // Wait for interval
    await new Promise(resolve => setTimeout(resolve, intervalSec * 1000));

    if (!this.playingScene) return; // User stopped scene playback during interval

    // Load next song
    console.log(`[MusicPlayer.advanceToNextSong] Loading song at index ${nextIndex}`);
    await this.loadFromScene(nextIndex);

    // Start playing automatically
    if (!this.engine.isPlaying()) {
      this.togglePlay();
    }

    // Continue monitoring
    this.monitorSongEnd();
  }

  /* ============================================================
   * JAM SESSION HELPERS
   * ============================================================ */
  isMicrophoneEnabled(): boolean {
    // Check both local mic (before jam) and jam session mic
    return this.localMicEnabled || (this.jamSessionComponent?.isMicrophoneEnabled || false);
  }

  getRemoteStreams(): ParticipantAudioStream[] {
    return this.jamSessionComponent?.getRemoteStreamsArray() || [];
  }

  isInJamSession(): boolean {
    return this.jamSessionComponent?.session !== null && this.jamSessionComponent?.session !== undefined;
  }

  isConnectingToJam(): boolean {
    return this.jamSessionComponent?.connecting || false;
  }

  isJammingsScene(): boolean {
    return this.scene?.name === 'Jammings';
  }

  async toggleLocalMicrophone(): Promise<void> {
    try {
      if (this.localMicEnabled) {
        // Stop local microphone
        if (this.localMicStream) {
          this.localMicStream.getTracks().forEach(track => track.stop());
          this.localMicStream = null;
        }
        this.localMicEnabled = false;
      } else {
        // Start local microphone (for waveform visualization only)
        this.localMicStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        this.localMicEnabled = true;
      }
    } catch (error: any) {
      console.error('[MusicPlayer] Failed to toggle local microphone:', error);
      this.localMicEnabled = false;
      this.localMicStream = null;
    }
  }

  getLocalMicStream(): MediaStream | null {
    return this.localMicStream;
  }

  onStartJamming(): void {
    console.log('[MusicPlayer.onStartJamming] Called from Start Jamming button, recorded stems count:', this.recordedMicStems.length);

    // CRITICAL: Stop any existing playback from regular player before starting jam
    if (this.engine.isPlaying()) {
      console.log('[MusicPlayer.onStartJamming] Stopping existing playback');
      this.engine.reset(); // Fully stop all audio sources
      this.stopCursorLoop();
      this.stopScenePlayback();
    }

    // If there are recorded stems, ask user if they want to save them
    if (this.recordedMicStems && this.recordedMicStems.length > 0) {
      console.log('[MusicPlayer.onStartJamming] ⚠️ SHOWING SAVE CONFIRMATION DIALOG - triggered by Start Jamming button');
      console.trace('[MusicPlayer.onStartJamming] Call stack trace:');

      this.confirmationService.confirm({
        message: 'You have unsaved recordings from your previous jam session. Would you like to save them to the "Jammings" scene?',
        header: 'Save Recording?',
        icon: 'pi pi-exclamation-triangle',
        acceptLabel: 'Save',
        rejectLabel: 'Discard',
        accept: async () => {
          console.log('[MusicPlayer] User accepted - saving to Jammings');
          await this.saveToJammingsScene(); // Wait for save to complete
          this.onClearRecordedStems(); // Only clear after save completes
          this.jamSessionComponent?.onStartJamming();
        },
        reject: () => {
          console.log('[MusicPlayer] User rejected - discarding recordings');
          // Just clear without saving
          this.onClearRecordedStems();
          this.jamSessionComponent?.onStartJamming();
        }
      });
    } else {
      console.log('[MusicPlayer] No recorded stems, starting jam session directly');
      // No previous recordings, start jamming directly
      this.jamSessionComponent?.onStartJamming();
    }
  }

  private isSaving = false; // Flag to prevent concurrent saves and track save lifecycle
  private pendingReloadTimeout: any = null; // Track pending reload to cancel if needed

  private async saveToJammingsScene(): Promise<void> {
    // Cancel any pending reload from previous save
    if (this.pendingReloadTimeout) {
      console.log('[MusicPlayer] ⚠️ Cancelling pending reload from previous save');
      clearTimeout(this.pendingReloadTimeout);
      this.pendingReloadTimeout = null;
    }

    // Prevent concurrent saves
    if (this.isSaving) {
      console.warn('[MusicPlayer] ⚠️ Save already in progress, ignoring duplicate call');
      return;
    }

    this.isSaving = true;
    const saveStartTime = Date.now();
    const saveTimestamp = new Date().toISOString();

    console.log('[MusicPlayer] ========================================');
    console.log('[MusicPlayer] 🚀 SAVE START:', saveTimestamp);
    console.log('[MusicPlayer] ========================================');
    console.log('[MusicPlayer] Saving recorded stems to Jammings scene');

    if (!this.scene || !this.scene.sceneId) {
      console.error('[MusicPlayer] ❌ No scene to save to');
      this.isSaving = false;
      this.messageService.add({
        severity: 'error',
        summary: 'Save Failed',
        detail: 'No active scene',
        life: 3000,
      });
      return;
    }

    const currentItem = this.scene.items[this.activeIndex];
    if (!currentItem) {
      console.error('[MusicPlayer] ❌ No current song');
      this.isSaving = false;
      this.messageService.add({
        severity: 'error',
        summary: 'Save Failed',
        detail: 'No active song',
        life: 3000,
      });
      return;
    }

    try {
      this.messageService.add({
        severity: 'info',
        summary: 'Saving Recording',
        detail: 'Uploading recorded stems...',
        life: 3000,
      });

      // Step 1: Collect all stems (original instrumental + recorded mic)
      const allStemUrls: { name: string; url: string }[] = [];

      // Get instrumental stems from the currently playing song
      // NOTE: normalizeSceneItem() already handles both regular songs and jam recordings
      // For regular songs: song.stems comes from Songs table
      // For jam recordings: normalizeSceneItem() creates a fake song with stems from soundState.stems
      let instrumentalStems: { name: string; url: string }[] = [];

      if (currentItem.song && currentItem.song.stems) {
        const rawStems = currentItem.song.stems;

        // Handle both array and object formats (same logic as loadFromScene)
        instrumentalStems = Array.isArray(rawStems)
          ? rawStems.filter(s => s?.name && s?.url)
          : Object.entries(rawStems)
              .filter(([, url]) => typeof url === 'string')
              .map(([name, url]) => ({ name, url: url as string }));

        console.log('[MusicPlayer] Currently playing song:', currentItem.song.originalName);
        console.log('[MusicPlayer] Adding', instrumentalStems.length, 'instrumental stems from song');
        console.log('[MusicPlayer] Instrumental stems:', instrumentalStems.map(s => s.name));
      } else {
        console.warn('[MusicPlayer] No instrumental stems found in currentItem.song.stems');
        console.warn('[MusicPlayer] currentItem:', {
          hasSong: !!currentItem.song,
          songStems: currentItem.song?.stems,
          songId: currentItem.song?.songId,
          songName: currentItem.song?.originalName
        });
      }

      // Add instrumental stems to the collection
      if (instrumentalStems.length > 0) {
        allStemUrls.push(...instrumentalStems);
        console.log('[MusicPlayer] ✅ Added', instrumentalStems.length, 'instrumental stems to save');
      } else {
        console.warn('[MusicPlayer] ⚠️ NO instrumental stems found - jam recording will only have mic stem!');
        console.warn('[MusicPlayer] This might be because:');
        console.warn('[MusicPlayer]   1. currentItem.song is missing');
        console.warn('[MusicPlayer]   2. currentItem.song.stems is empty or invalid');
        console.warn('[MusicPlayer] Current item details:', {
          hasSong: !!currentItem.song,
          songId: currentItem.song?.songId,
          songName: currentItem.song?.originalName,
          stemsType: currentItem.song?.stems ? (Array.isArray(currentItem.song.stems) ? 'array' : 'object') : 'missing',
          stemsCount: currentItem.song?.stems ? (Array.isArray(currentItem.song.stems) ? currentItem.song.stems.length : Object.keys(currentItem.song.stems).length) : 0
        });
      }

      // Upload recorded mic stems (WebM format) to S3
      console.log('[MusicPlayer] Number of recorded mic stems to upload:', this.recordedMicStems.length);
      for (const recordedStem of this.recordedMicStems) {
        console.log('[MusicPlayer] Processing recorded stem:', recordedStem.name);

        // Use the original WebM blob from recording
        const webmBlob = recordedStem.originalBlob;

        // Create S3-safe filename (remove @ . and other special characters)
        const safeName = recordedStem.name.replace(/[@.]/g, '-');
        const fileName = `${safeName}.webm`;
        const file = new File([webmBlob], fileName, { type: 'audio/webm' });

        // Upload to S3
        console.log(`[MusicPlayer] Uploading ${fileName} to S3...`);
        const uploadResponse = await this.musicUploadService.upload(
          file,
          (progress) => {
            console.log(`[MusicPlayer] Upload progress for ${fileName}: ${progress}%`);
          },
          safeName  // Use safe name for S3 key
        );

        console.log('[MusicPlayer] Upload response for', fileName, ':', uploadResponse.data);

        // The upload creates a new songId and uploads to S3
        // We need to construct the S3 URL manually since stems aren't processed yet
        const songId = uploadResponse.data.songId;

        // Construct the S3 URL for the original WebM file
        // Format: https://tunesbasis-files-{accountId}.s3.{region}.amazonaws.com/songs/{songId}/original.webm
        const s3Url = `https://tunesbasis-files-086723604095.s3.us-west-2.amazonaws.com/songs/${songId}/original.webm`;

        console.log('[MusicPlayer] Created mic stem URL:', s3Url);

        // Add the mic stem to our collection
        allStemUrls.push({
          name: recordedStem.name,
          url: s3Url
        });
      }

      console.log('[MusicPlayer] ========== SAVE SUMMARY ==========');
      console.log('[MusicPlayer] Total stems to save:', allStemUrls.length);
      console.log('[MusicPlayer] - Instrumental stems:', instrumentalStems.length);
      console.log('[MusicPlayer] - Recorded mic stems:', this.recordedMicStems.length);
      console.log('[MusicPlayer] All stem names:', allStemUrls.map(s => s.name));
      console.log('[MusicPlayer] ================================');

      // Step 2: Generate unique jam session name with timestamp
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
      const timeStr = now.toISOString().split('T')[1].split('.')[0].replace(/:/g, ''); // HHMMSS
      const groupName = this.groupId || 'solo';

      // Use timestamp to ensure uniqueness even when saving multiple times quickly
      const jamSessionName = `jam_${dateStr}_${timeStr}_${groupName}`;
      console.log('[MusicPlayer] Generated unique jam session name:', jamSessionName);

      // Step 3: Get or create "Jammings" scene
      const scenes = await this.sceneService.listScenes();
      const jammingsScene = scenes.data.find(s => s.name === 'Jammings');
      let jammingsSceneId: string;

      if (jammingsScene) {
        jammingsSceneId = jammingsScene.sceneId;
        console.log('[MusicPlayer] Using existing Jammings scene:', jammingsSceneId);
      } else {
        // Create new Jammings scene
        console.log('[MusicPlayer] Creating new Jammings scene');
        const createResponse = await this.sceneService.createScene({
          name: 'Jammings',
          items: []
        });
        jammingsSceneId = createResponse.data.sceneId;
      }

      // Step 4: Add jam session to Jammings scene
      const existingScene = await this.sceneService.getScene(jammingsSceneId);
      const existingItems = existingScene.data.items || [];

      // Create new scene item with soundState.stems containing ALL stems (instrumental + recorded)
      const newItem = {
        songId: jamSessionName, // Use jam session name as songId
        order: existingItems.length,
        intervalSec: 0,
        soundState: {
          originalName: jamSessionName,
          stems: allStemUrls // Array of {name, url} - includes both instrumental and recorded stems
        }
      };

      console.log('[MusicPlayer] Creating new jam session entry in Jammings scene:');
      console.log('[MusicPlayer] - songId (jam name):', jamSessionName);
      console.log('[MusicPlayer] - soundState.stems count:', allStemUrls.length);
      console.log('[MusicPlayer] - soundState.stems:', allStemUrls);

      console.log('[MusicPlayer] 📤 Calling updateScene API to save jam session...');
      await this.sceneService.updateScene(jammingsSceneId, {
        items: [...existingItems, newItem]
      });

      const saveElapsed = Date.now() - saveStartTime;
      console.log('[MusicPlayer] ✅ updateScene API completed in', saveElapsed, 'ms');
      console.log('[MusicPlayer] ✅ Successfully saved', allStemUrls.length, 'stems to Jammings scene');

      // Wait for backend to persist
      console.log('[MusicPlayer] ⏳ Waiting 500ms for backend persistence...');
      await new Promise(resolve => setTimeout(resolve, 500));

      const totalElapsed = Date.now() - saveStartTime;
      console.log('[MusicPlayer] ========================================');
      console.log('[MusicPlayer] ✅ SAVE COMPLETE:', new Date().toISOString());
      console.log('[MusicPlayer] Total save time:', totalElapsed, 'ms');
      console.log('[MusicPlayer] ========================================');

      this.messageService.add({
        severity: 'success',
        summary: 'Recording Saved',
        detail: `Jam session "${jamSessionName}" saved to Jammings scene. Reloading...`,
        life: 3000,
      });

      // Full page reload to ensure the new jam recording is loaded into session state
      console.log('[MusicPlayer] 🔄 Scheduling page reload in 1 second...');
      this.pendingReloadTimeout = setTimeout(() => {
        console.log('[MusicPlayer] 🔄 RELOADING PAGE NOW');
        window.location.reload();
      }, 1000); // Small delay to let the success message show

    } catch (error: any) {
      this.isSaving = false; // Reset flag on error
      const saveElapsed = Date.now() - saveStartTime;
      console.error('[MusicPlayer] ❌ Save failed after', saveElapsed, 'ms:', error);

      // Show error message with retry option
      this.confirmationService.confirm({
        message: `Failed to save recording: ${error.message || 'Unknown error'}. Would you like to retry?`,
        header: 'Save Failed',
        icon: 'pi pi-exclamation-triangle',
        acceptLabel: 'Retry',
        rejectLabel: 'Cancel',
        accept: async () => {
          console.log('[MusicPlayer] User chose to retry save');
          this.isSaving = false; // Reset flag before retry
          await this.saveToJammingsScene(); // Retry the save
        },
        reject: () => {
          console.log('[MusicPlayer] User cancelled retry');
          this.messageService.add({
            severity: 'warn',
            summary: 'Save Cancelled',
            detail: 'Recording was not saved. You can try again later.',
            life: 5000,
          });
        }
      });
    }
  }

  onJamPlaybackStateChanged(isPlaying: boolean): void {
    console.log('[MusicPlayer.onJamPlaybackStateChanged] Playback state:', isPlaying);

    // When jam session playback starts/stops, manage cursor loop
    if (isPlaying) {
      this.startCursorLoop();
    } else {
      this.stopCursorLoop();
    }

    // Emit recording state to disable/enable tabs during recording
    this.recordingStateChanged.emit(isPlaying);
  }

  onRecordedStemsReady(recordedStems: RecordedStem[]): void {
    console.log('[MusicPlayer] onRecordedStemsReady called with', recordedStems.length, 'stems');

    // Guard against duplicate calls - check if we already have these exact stems
    if (this.recordedMicStems.length > 0 && recordedStems.length > 0) {
      const isSame = this.recordedMicStems.length === recordedStems.length &&
                     this.recordedMicStems.every((stem, i) => stem.name === recordedStems[i].name);
      if (isSame) {
        console.log('[MusicPlayer] Duplicate call detected (same stems), ignoring');
        return;
      }
    }

    console.log('[MusicPlayer] Recorded stems data:', recordedStems.map(s => ({
      name: s.name,
      userName: s.userName,
      userId: s.userId,
      duration: s.duration,
      bufferLength: s.audioBuffer?.length
    })));

    this.recordedMicStems = recordedStems;
    this.showingLiveMics = false; // Switch to recorded view

    console.log('[MusicPlayer] Mode switched - showingLiveMics:', this.showingLiveMics);
    console.log('[MusicPlayer] Waveforms component will receive:', {
      mode: this.showingLiveMics ? 'live' : 'recorded',
      recordedStemsCount: this.recordedMicStems.length,
      containerVisible: `(groupId:${!!this.groupId} && scene:${!!this.scene?.sceneId}) || recordedStems:${this.recordedMicStems.length > 0}`
    });

    // Add recorded stems to player engine for playback/control
    for (const stem of recordedStems) {
      // Check if stem already exists in player
      const existingStem = this.stems.find(s => s.name === stem.name);
      if (existingStem) {
        console.log('[MusicPlayer] Stem already exists, skipping:', stem.name);
        continue;
      }

      this.playerEngine.addRecordedStem(stem);
      this.stems.push({ name: stem.name, url: '' });
      console.log('[MusicPlayer] Added stem to player:', stem.name);
    }

    console.log('[MusicPlayer] Total stems in player now:', this.stems.length);
    console.log('[MusicPlayer] recordedMicStems array now has:', this.recordedMicStems.length, 'items');
  }

  onClearRecordedStems(): void {
    console.log('[MusicPlayer] Clearing recorded mic stems');
    console.trace('[MusicPlayer] Stack trace for clear:');

    // Remove recorded mic stems from player
    for (const stem of this.recordedMicStems) {
      this.playerEngine.removeRecordedStem(stem.name);
      const index = this.stems.findIndex(s => s.name === stem.name);
      if (index !== -1) {
        this.stems.splice(index, 1);
      }
    }

    // Clear state
    this.recordedMicStems = [];
    this.showingLiveMics = true; // Switch back to live view

    console.log('[MusicPlayer] Cleared all recorded mic stems');
  }

  onLeaveJamRequested(): void {
    console.log('[MusicPlayer.onLeaveJamRequested] Called from Leave button, recorded stems count:', this.recordedMicStems.length);

    // If there are recorded stems, ask user if they want to save them
    if (this.recordedMicStems && this.recordedMicStems.length > 0) {
      console.log('[MusicPlayer.onLeaveJamRequested] ⚠️ SHOWING SAVE CONFIRMATION DIALOG - triggered by Leave button');
      console.trace('[MusicPlayer.onLeaveJamRequested] Call stack trace:');

      this.confirmationService.confirm({
        message: 'You have unsaved recordings from this jam session. Would you like to save them to the "Jammings" scene before leaving?',
        header: 'Save Recording?',
        icon: 'pi pi-exclamation-triangle',
        acceptLabel: 'Save',
        rejectLabel: 'Discard',
        accept: async () => {
          console.log('[MusicPlayer] User accepted - saving to Jammings before leaving');
          await this.saveToJammingsScene(); // Wait for save to complete
          this.onClearRecordedStems(); // Clear after save
          this.jamSessionComponent?.disconnectFromSession(); // Actually leave
        },
        reject: () => {
          console.log('[MusicPlayer] User rejected - discarding recordings and leaving');
          this.onClearRecordedStems(); // Clear without saving
          this.jamSessionComponent?.disconnectFromSession(); // Actually leave
        },
      });
    } else {
      console.log('[MusicPlayer] No recorded stems, leaving immediately');
      // No recordings to save, leave immediately
      this.jamSessionComponent?.disconnectFromSession();
    }
  }
}
