import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  SimpleChanges,
  OnDestroy,
  ViewChild
} from '@angular/core';
import { Scene, SceneSong, StemSettings } from 'src/app/model/scene';
import { MusicPlayerEngine, StemInfo, KnobParam } from './music-player.engine';
import { CachedSong } from 'src/app/services/audio-cache.service';
import { AuthService } from 'src/app/services/auth.service';
import { JamSessionComponent } from 'src/app/components/jam-session/jam-session.component';
import { ParticipantAudioStream } from 'src/app/services/webrtc-audio.service';
import { RecordedStem } from 'src/app/services/recording-to-stem.service';

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
  recordedMicStems: RecordedStem[] = [];
  showingLiveMics = true;

  // Local microphone (before joining jam session)
  localMicEnabled = false;
  private localMicStream: MediaStream | null = null;

  constructor(private authService: AuthService) {}

  async ngOnInit() {
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
      if (this.engine.isPlaying()) {
        console.log(`[MusicPlayer.ngOnChanges] Stopping playback`);
        this.engine.togglePlay();
        this.stopCursorLoop();
      }
      // Clear stems so that when tab becomes active again, ngOnChanges will reload
      console.log(`[MusicPlayer.ngOnChanges] Clearing stems to allow reload on reactivation`);
      this.stems = [];
      this.waveformsDrawn = 0;
      this.waveformsReady = false;
    }
  }

  ngOnDestroy() {
    this.stopCursorLoop();
    this.stopScenePlayback();
    // Note: Don't call engine.destroy() here because Angular might reuse the component
    // The engine will clean up audio nodes in reset() when loading new scenes
  }

  private normalizeSceneItem(item: any) {
    if (!item.stems && item.soundState) {
      item.stems = item.soundState;
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
    const tick = () => {
      if (!this.engine.isPlaying()) return;

      const elapsed = this.engine.getCurrentTime();
      this.cursorPercent = Math.min(100, (elapsed / this.engine.getMaxDuration()) * 100);

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
    for (const stem of this.stems) {
      this.resetAllKnobs(stem.name);
    }
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
    this.jamSessionComponent?.onStartJamming();
  }

  onJamPlaybackStateChanged(isPlaying: boolean): void {
    // When jam session playback starts/stops, manage cursor loop
    if (isPlaying) {
      this.startCursorLoop();
    } else {
      this.stopCursorLoop();
    }
  }

  onRecordedStemsReady(recordedStems: RecordedStem[]): void {
    console.log('[MusicPlayer] Received recorded stems:', recordedStems);

    this.recordedMicStems = recordedStems;
    this.showingLiveMics = false; // Switch to recorded view

    // Add recorded stems to player engine for playback/control
    for (const stem of recordedStems) {
      this.playerEngine.addRecordedStem(stem);
      this.stems.push({ name: stem.name, url: '' });
    }

    console.log('[MusicPlayer] Added', recordedStems.length, 'recorded mic stems to player');
  }

  onClearRecordedStems(): void {
    console.log('[MusicPlayer] Clearing recorded mic stems');

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
}
