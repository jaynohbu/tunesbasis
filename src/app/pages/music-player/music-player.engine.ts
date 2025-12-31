import { AudioCacheService, CachedSong } from 'src/app/services/audio-cache.service';

export interface StemInfo {
  name: string;
  url: string;
}

export type KnobParam = 'pregain' | 'compression' | 'tone' | 'distortion';

export interface StemSettings {
  volume: number;
  muted: boolean;
  pregain: number;
  compression: number;
  tone: number;
  distortion: number;
}

export class MusicPlayerEngine {

  private audioCtx: AudioContext;
  private masterGain: GainNode;

  private buffers: Record<string, AudioBuffer> = {};
  private sources: Record<string, AudioBufferSourceNode | null> = {};

  private pregainNodes: Record<string, GainNode> = {};
  private compressorNodes: Record<string, DynamicsCompressorNode> = {};
  private toneNodes: Record<string, BiquadFilterNode> = {};
  private stemGains: Record<string, GainNode> = {};
  private distortionNodes: Record<string, WaveShaperNode | null> = {};

  private stemVolumes: Record<string, number> = {};
  private stemMuted: Record<string, boolean> = {};
  private stemBypassLED: Record<string, boolean> = {};
  private stemKnobs: Record<string, {
    pregain: number;
    compression: number;
    tone: number;
    distortion: number;
  }> = {};

  private playing = false;
  private startTime = 0;
  private offset = 0;
  private maxDuration = 0;

  constructor() {
    this.audioCtx = new AudioContext();
    this.masterGain = this.audioCtx.createGain();
    this.masterGain.connect(this.audioCtx.destination);
  }

  // ================= GETTERS =================

  getAudioContext(): AudioContext {
    return this.audioCtx;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  getMaxDuration(): number {
    return this.maxDuration;
  }

  getCurrentTime(): number {
    return this.offset + (this.audioCtx.currentTime - this.startTime);
  }

  getStemVolume(stem: string): number {
    return this.stemVolumes[stem] ?? 1;
  }

  isStemMuted(stem: string): boolean {
    return this.stemMuted[stem] ?? false;
  }

  getStemBypassLED(stem: string): boolean {
    return this.stemBypassLED[stem] ?? false;
  }

  getStemKnobs(stem: string) {
    return this.stemKnobs[stem];
  }

  getAllStemSettings(): Record<string, StemSettings> {
    const settings: Record<string, StemSettings> = {};
    for (const stem of Object.keys(this.stemKnobs)) {
      settings[stem] = {
        volume: this.stemVolumes[stem],
        muted: this.stemMuted[stem],
        pregain: this.stemKnobs[stem].pregain,
        compression: this.stemKnobs[stem].compression,
        tone: this.stemKnobs[stem].tone,
        distortion: this.stemKnobs[stem].distortion
      };
    }
    return settings;
  }

  // ================= BUFFER LOADING =================

  async loadBuffers(stems: StemInfo[], songId?: string, songName?: string): Promise<CachedSong | null> {
    this.reset();
    this.maxDuration = 0;

    console.log('[MusicPlayerEngine] Loading buffers for stems:', stems.map(s => s.name));

    // Check cache if songId is provided
    let cachedSong: CachedSong | null = null;
    if (songId) {
      console.log(`[MusicPlayerEngine] Checking cache for song: ${songId}`);
      cachedSong = await AudioCacheService.getCached(songId);
    }

    if (cachedSong) {
      console.log(`[MusicPlayerEngine] 🚀 Loading from cache (${cachedSong.stems.length} stems)`);

      // Load compressed buffers from cache first (fast path)
      for (const cachedStem of cachedSong.stems) {
        try {
          console.log(`[MusicPlayerEngine] Reconstructing ${cachedStem.name} from cache...`);
          const buffer = AudioCacheService.reconstructBuffer(cachedStem, this.audioCtx);

          this.buffers[cachedStem.name] = buffer;
          this.maxDuration = Math.max(this.maxDuration, buffer.duration);

          // Create audio nodes
          this.createAudioNodesForStem(cachedStem.name);

          console.log(`[MusicPlayerEngine] ✅ Loaded ${cachedStem.name} from cache (${buffer.duration.toFixed(2)}s)`);
        } catch (error) {
          console.error(`[MusicPlayerEngine] Failed to load ${cachedStem.name} from cache:`, error);
        }
      }

      console.log(`[MusicPlayerEngine] Cache load complete. Loaded ${Object.keys(this.buffers).length} stems`);

      // Return cached data so component can use waveform peaks
      return cachedSong;

    } else {
      // No cache - load from network with retry logic
      console.log('[MusicPlayerEngine] No cache found, loading from network...');

      for (const stem of stems) {
        await this.loadStemWithRetry(stem, 3); // Retry up to 3 times
      }

      const loadedStems = Object.keys(this.buffers);
      console.log(`[MusicPlayerEngine] Loading complete. Successfully loaded ${loadedStems.length}/${stems.length} stems:`, loadedStems);
      console.log(`[MusicPlayerEngine] Max duration: ${this.maxDuration.toFixed(2)}s`);

      // Cache the loaded buffers
      if (songId && songName && loadedStems.length > 0) {
        console.log('[MusicPlayerEngine] Caching loaded buffers...');
        AudioCacheService.cacheSong(songId, songName, this.buffers);
      }

      return null;
    }
  }

  /**
   * Upgrade compressed buffers to full quality in background
   * This allows seamless quality improvement while playing
   */
  async upgradeToFullQuality(stems: StemInfo[]): Promise<void> {
    console.log('[MusicPlayerEngine] 📡 Starting background upgrade to full quality...');

    const wasPlaying = this.playing;
    const currentTime = wasPlaying ? this.getCurrentTime() : 0;

    for (const stem of stems) {
      try {
        console.log(`[MusicPlayerEngine] Upgrading ${stem.name} to full quality...`);
        const arr = await fetch(stem.url).then(r => r.arrayBuffer());
        const buffer = await this.audioCtx.decodeAudioData(arr);

        // Replace the compressed buffer with full quality
        this.buffers[stem.name] = buffer;
        this.maxDuration = Math.max(this.maxDuration, buffer.duration);

        console.log(`[MusicPlayerEngine] ✅ Upgraded ${stem.name} to full quality (${buffer.duration.toFixed(2)}s)`);

        // If playing, restart playback with new buffer to seamlessly swap
        if (wasPlaying) {
          this.pause();
          this.offset = currentTime;
          this.play();
        }
      } catch (error) {
        console.error(`[MusicPlayerEngine] Failed to upgrade ${stem.name}:`, error);
      }
    }

    console.log('[MusicPlayerEngine] ✨ Background upgrade complete');
  }

  /**
   * Load a single stem with retry logic
   */
  private async loadStemWithRetry(stem: StemInfo, maxRetries: number): Promise<void> {
    let lastError: any = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[MusicPlayerEngine] Fetching ${stem.name}... (attempt ${attempt}/${maxRetries})`);
        const arr = await fetch(stem.url).then(r => r.arrayBuffer());
        console.log(`[MusicPlayerEngine] Decoding ${stem.name}... (${arr.byteLength} bytes)`);
        const buffer = await this.audioCtx.decodeAudioData(arr);
        console.log(`[MusicPlayerEngine] Successfully loaded ${stem.name} (${buffer.duration.toFixed(2)}s)`);

        this.buffers[stem.name] = buffer;
        this.maxDuration = Math.max(this.maxDuration, buffer.duration);

        // Create audio nodes
        this.createAudioNodesForStem(stem.name);
        return; // Success - exit retry loop
      } catch (error) {
        lastError = error;
        console.error(`[MusicPlayerEngine] ❌ Failed to load "${stem.name}" (attempt ${attempt}/${maxRetries}):`, error);

        if (attempt < maxRetries) {
          // Wait before retrying (exponential backoff: 1s, 2s)
          const delayMs = Math.pow(2, attempt - 1) * 1000;
          console.log(`[MusicPlayerEngine] ⏳ Retrying ${stem.name} in ${delayMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }

    // All retries failed
    console.error(`[MusicPlayerEngine] ❌ Failed to load "${stem.name}" after ${maxRetries} attempts`);
    console.error(`[MusicPlayerEngine] URL: ${stem.url}`);
    console.error(`[MusicPlayerEngine] Last error:`, lastError);
  }

  /**
   * Create audio nodes for a stem (extracted for reuse)
   */
  private createAudioNodesForStem(stemName: string): void {
    const pregain = this.audioCtx.createGain();
    const comp = this.audioCtx.createDynamicsCompressor();
    const tone = this.audioCtx.createBiquadFilter();
    const gain = this.audioCtx.createGain();

    pregain.connect(comp);
    comp.connect(tone);
    tone.connect(gain);
    gain.connect(this.masterGain);

    this.pregainNodes[stemName] = pregain;
    this.compressorNodes[stemName] = comp;
    this.toneNodes[stemName] = tone;
    this.stemGains[stemName] = gain;
    this.distortionNodes[stemName] = null;

    // Initialize default values
    this.stemVolumes[stemName] = 1;
    this.stemMuted[stemName] = false;
    this.stemBypassLED[stemName] = false;

    this.stemKnobs[stemName] = {
      pregain: 0.3,
      compression: 0,
      tone: 0.7,
      distortion: 0
    };
  }

  getBuffer(stem: string): AudioBuffer | undefined {
    return this.buffers[stem];
  }

  // ================= PLAYBACK CONTROLS =================

  play(): void {
    if (!Object.keys(this.buffers).length) return;

    const now = this.audioCtx.currentTime;
    this.startTime = now;
    this.playing = true;

    for (const name of Object.keys(this.buffers)) {
      const src = this.audioCtx.createBufferSource();
      src.buffer = this.buffers[name];
      src.connect(this.pregainNodes[name]);
      src.start(now, Math.min(this.offset, this.buffers[name].duration));
      this.sources[name] = src;
    }
  }

  pause(): void {
    this.offset += this.audioCtx.currentTime - this.startTime;
    this.stopSources();
    this.playing = false;
  }

  togglePlay(): void {
    this.playing ? this.pause() : this.play();
  }

  seek(ratio: number): void {
    this.offset = ratio * this.maxDuration;

    if (this.playing) {
      this.stopSources();
      this.play();
    }
  }

  private stopSources(): void {
    Object.values(this.sources).forEach(s => {
      try { s?.stop(); } catch {}
    });
    this.sources = {};
  }

  // ================= VOLUME CONTROLS =================

  setGlobalVolume(value: number): void {
    this.masterGain.gain.value = value;
  }

  setStemVolume(name: string, value: number): void {
    this.stemVolumes[name] = value;
    this.stemGains[name].gain.value = this.stemMuted[name] ? 0 : value;
  }

  toggleMute(name: string): void {
    this.stemMuted[name] = !this.stemMuted[name];
    this.stemGains[name].gain.value = this.stemMuted[name] ? 0 : this.stemVolumes[name];
  }

  // ================= EFFECTS / KNOBS =================

  isDistortable(name: string): boolean {
    return name === 'guitar' || name === 'piano';
  }

  setKnob(stem: string, param: KnobParam, value: number): void {
    this.stemKnobs[stem][param] = value;

    switch (param) {
      case 'pregain':
        this.pregainNodes[stem].gain.value = 0.2 + value * 3.8;
        break;
      case 'compression':
        const c = this.compressorNodes[stem];
        c.threshold.value = -60 + value * 60;
        c.ratio.value = 1 + value * 19;
        break;
      case 'tone':
        this.toneNodes[stem].frequency.value = 300 + value * 9700;
        break;
      case 'distortion':
        if (!this.isDistortable(stem)) return;
        let ws = this.distortionNodes[stem];
        if (!ws) {
          ws = this.audioCtx.createWaveShaper();
          this.distortionNodes[stem] = ws;
          this.toneNodes[stem].disconnect();
          this.toneNodes[stem].connect(ws);
          ws.connect(this.stemGains[stem]);
        }
        ws.curve = this.makeDistortionCurve(value * 50) as any;
        break;
    }
  }

  resetKnob(stem: string, param: KnobParam): void {
    const defaults = {
      pregain: 0.3,
      compression: 0,
      tone: 0.7,
      distortion: 0
    };
    this.setKnob(stem, param, defaults[param]);
  }

  toggleBypassLED(stem: string): void {
    const bypass = !this.stemBypassLED[stem];
    this.stemBypassLED[stem] = bypass;

    if (bypass) {
      this.pregainNodes[stem].gain.value = 1;
      this.compressorNodes[stem].ratio.value = 1;
      this.toneNodes[stem].frequency.value = 20000;
    } else {
      const k = this.stemKnobs[stem];
      this.setKnob(stem, 'pregain', k.pregain);
      this.setKnob(stem, 'compression', k.compression);
      this.setKnob(stem, 'tone', k.tone);
      this.setKnob(stem, 'distortion', k.distortion);
    }
  }

  // ================= STEM SETTINGS RESTORE =================

  restoreStemSettings(settings: Record<string, StemSettings>): void {
    Object.entries(settings).forEach(([stem, cfg]) => {
      if (!this.stemKnobs[stem]) return;

      this.stemVolumes[stem] = cfg.volume;
      this.stemMuted[stem] = cfg.muted;

      this.stemKnobs[stem] = {
        pregain: cfg.pregain,
        compression: cfg.compression,
        tone: cfg.tone,
        distortion: cfg.distortion
      };

      this.stemGains[stem].gain.value = cfg.muted ? 0 : cfg.volume;
      this.pregainNodes[stem].gain.value = 0.2 + cfg.pregain * 3.8;

      const c = this.compressorNodes[stem];
      c.threshold.value = -60 + cfg.compression * 60;
      c.ratio.value = 1 + cfg.compression * 19;

      this.toneNodes[stem].frequency.value = 300 + cfg.tone * 9700;

      if (this.isDistortable(stem)) {
        let ws = this.distortionNodes[stem];
        if (!ws) {
          ws = this.audioCtx.createWaveShaper();
          this.distortionNodes[stem] = ws;
          this.toneNodes[stem].disconnect();
          this.toneNodes[stem].connect(ws);
          ws.connect(this.stemGains[stem]);
        }
        ws.curve = this.makeDistortionCurve(cfg.distortion * 50) as any;
      }
    });
  }

  // ================= HELPERS =================

  private makeDistortionCurve(amount: number): Float32Array {
    const n = 44100;
    const curve = new Float32Array(n);
    const deg = Math.PI / 180;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }

  reset(): void {
    this.stopSources();

    this.playing = false;
    this.startTime = 0;
    this.offset = 0;

    this.buffers = {};
    this.sources = {};
    this.pregainNodes = {};
    this.compressorNodes = {};
    this.toneNodes = {};
    this.stemGains = {};
    this.distortionNodes = {};

    this.stemVolumes = {};
    this.stemMuted = {};
    this.stemBypassLED = {};
    this.stemKnobs = {};

    this.maxDuration = 0;
  }

  destroy(): void {
    this.stopSources();

    // Close the audio context to free resources
    if (this.audioCtx.state !== 'closed') {
      this.audioCtx.close();
    }
  }
}