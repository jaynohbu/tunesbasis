import { AudioCacheService, CachedSong } from 'src/app/services/audio-cache.service';

export interface StemInfo {
  name: string;
  url: string;
}

export type KnobParam = 'pregain' | 'compression' | 'tone' | 'distortion' | 'eqLow' | 'eqMid' | 'eqHigh' | 'reverb';

export interface StemSettings {
  volume: number;
  muted: boolean;
  pregain: number;
  compression: number;
  tone: number;
  distortion: number;
  eqLow: number;
  eqMid: number;
  eqHigh: number;
  reverb: number;
}

export type PlaybackMode = 'PREVIEW' | 'STREAMING';

export class MusicPlayerEngine {

  private audioCtx: AudioContext;
  private masterGain: GainNode;

  // Dual playback architecture
  private playbackMode: PlaybackMode = 'PREVIEW';

  // Cache-based (preview) sources
  private buffers: Record<string, AudioBuffer> = {};
  private sources: Record<string, AudioBufferSourceNode | null> = {};
  private cacheGains: Record<string, GainNode> = {};

  // Stream-based (high-quality) sources
  private streamAudioElements: Record<string, HTMLAudioElement> = {};
  private streamMediaSources: Record<string, MediaElementAudioSourceNode> = {};
  private streamGains: Record<string, GainNode> = {};
  private streamUrls: Record<string, string> = {};

  private pregainNodes: Record<string, GainNode> = {};
  private compressorNodes: Record<string, DynamicsCompressorNode> = {};
  private toneNodes: Record<string, BiquadFilterNode> = {};
  private eqLowNodes: Record<string, BiquadFilterNode> = {};
  private eqMidNodes: Record<string, BiquadFilterNode> = {};
  private eqHighNodes: Record<string, BiquadFilterNode> = {};
  private reverbNodes: Record<string, ConvolverNode> = {};
  private reverbGainNodes: Record<string, GainNode> = {};
  private dryGainNodes: Record<string, GainNode> = {};
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
    eqLow: number;
    eqMid: number;
    eqHigh: number;
    reverb: number;
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
        distortion: this.stemKnobs[stem].distortion,
        eqLow: this.stemKnobs[stem].eqLow,
        eqMid: this.stemKnobs[stem].eqMid,
        eqHigh: this.stemKnobs[stem].eqHigh,
        reverb: this.stemKnobs[stem].reverb
      };
    }
    return settings;
  }

  // ================= BUFFER LOADING =================

  async loadBuffers(stems: StemInfo[], songId?: string, songName?: string): Promise<CachedSong | null> {
    this.reset();
    this.maxDuration = 0;

    console.log('[MusicPlayerEngine] Loading buffers for stems:', stems.map(s => s.name));

    // Store stream URLs for later high-quality playback
    stems.forEach(stem => {
      this.streamUrls[stem.name] = stem.url;
    });

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
   * Upgrade to streaming mode (high-quality HTML5 Audio)
   * Uses seamless crossfade to switch from cached to streamed audio
   */
  private async upgradeToStreaming(): Promise<void> {
    if (this.playbackMode === 'STREAMING') {
      console.log('[MusicPlayerEngine] Already in streaming mode');
      return;
    }

    console.log('[MusicPlayerEngine] 📡 Starting streaming upgrade...');

    const targetTime = this.getCurrentTime();
    const allAudioElements: HTMLAudioElement[] = [];

    // Create all audio elements first
    for (const [name, url] of Object.entries(this.streamUrls)) {
      try {
        const audio = new Audio(url);
        audio.crossOrigin = 'anonymous';
        audio.preload = 'auto';

        this.streamAudioElements[name] = audio;
        allAudioElements.push(audio);
      } catch (error) {
        console.error(`[MusicPlayerEngine] Failed to create audio element for ${name}:`, error);
      }
    }

    // Wait for all audio to be ready to play
    await Promise.all(
      allAudioElements.map(audio =>
        new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            audio.removeEventListener('canplaythrough', onReady);
            audio.removeEventListener('error', onError);
            reject(new Error('Audio load timeout'));
          }, 10000); // 10 second timeout

          const onReady = () => {
            clearTimeout(timeout);
            audio.removeEventListener('canplaythrough', onReady);
            audio.removeEventListener('error', onError);
            resolve();
          };

          const onError = () => {
            clearTimeout(timeout);
            audio.removeEventListener('canplaythrough', onReady);
            audio.removeEventListener('error', onError);
            reject(new Error('Audio load error'));
          };

          audio.addEventListener('canplaythrough', onReady);
          audio.addEventListener('error', onError);
        })
      )
    );

    // All audio ready - now set time and connect in sync
    for (const [name, audio] of Object.entries(this.streamAudioElements)) {
      try {
        // Set playback position AFTER loading
        audio.currentTime = targetTime;

        // Create Web Audio source
        const mediaSource = this.audioCtx.createMediaElementSource(audio);
        mediaSource.connect(this.streamGains[name]);
        this.streamMediaSources[name] = mediaSource;

        console.log(`[MusicPlayerEngine] ✅ Stream ready for ${name} at ${targetTime.toFixed(2)}s`);
      } catch (error) {
        console.error(`[MusicPlayerEngine] Failed to setup stream for ${name}:`, error);
      }
    }

    // Start all streams together if playing
    if (this.playing) {
      // Use Promise.all to start all at the exact same time
      await Promise.all(
        Object.values(this.streamAudioElements).map(audio => audio.play())
      );
    }

    // Perform seamless crossfade (80ms)
    this.crossfadeToStreaming();
  }

  /**
   * Seamless crossfade from cache to stream
   * No clicks, no gaps, time-aligned
   */
  private crossfadeToStreaming(): void {
    const now = this.audioCtx.currentTime;
    const fadeDuration = 0.08; // 80ms

    console.log('[MusicPlayerEngine] 🎚️ Crossfading cache → stream...');

    for (const name of Object.keys(this.cacheGains)) {
      // Fade out cache
      this.cacheGains[name].gain.linearRampToValueAtTime(0, now + fadeDuration);

      // Fade in stream
      this.streamGains[name].gain.linearRampToValueAtTime(1, now + fadeDuration);
    }

    this.playbackMode = 'STREAMING';
    console.log('[MusicPlayerEngine] ✨ Now in STREAMING mode');
  }

  /**
   * Crossfade back to cache (for scrubbing)
   */
  private crossfadeToPreview(): void {
    const now = this.audioCtx.currentTime;
    const fadeDuration = 0.05; // 50ms (faster for scrubbing)

    console.log('[MusicPlayerEngine] 🎚️ Crossfading stream → cache...');

    for (const name of Object.keys(this.cacheGains)) {
      // Fade in cache
      this.cacheGains[name].gain.linearRampToValueAtTime(1, now + fadeDuration);

      // Fade out stream
      this.streamGains[name].gain.linearRampToValueAtTime(0, now + fadeDuration);
    }

    this.playbackMode = 'PREVIEW';
    console.log('[MusicPlayerEngine] ✨ Now in PREVIEW mode');
  }

  /**
   * OLD: Upgrade compressed buffers to full quality (DEPRECATED - use streaming instead)
   */
  async upgradeToFullQuality(stems: StemInfo[]): Promise<void> {
    console.log('[MusicPlayerEngine] ⚠️ upgradeToFullQuality is deprecated, use streaming mode');
    // Keep for backward compatibility but don't use
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
   *
   * Signal flow (dual-playback with EQ and reverb):
   *
   * CachedSource ──> cacheGain ──┐
   *                               ├──> pregain ──> comp ──> tone ──> eqLow ──> eqMid ──> eqHigh ──┬──> dryGain ──┐
   * StreamSource ──> streamGain ──┘                                                                │              ├──> stemGain ──> masterGain
   *                                                                                                 └──> reverb ──> reverbGain ──┘
   */
  private createAudioNodesForStem(stemName: string): void {
    // Create effect chain
    const pregain = this.audioCtx.createGain();
    const comp = this.audioCtx.createDynamicsCompressor();
    const tone = this.audioCtx.createBiquadFilter();

    // Create 3-band EQ
    const eqLow = this.audioCtx.createBiquadFilter();
    eqLow.type = 'lowshelf';
    eqLow.frequency.value = 200;

    const eqMid = this.audioCtx.createBiquadFilter();
    eqMid.type = 'peaking';
    eqMid.frequency.value = 1000;
    eqMid.Q.value = 1;

    const eqHigh = this.audioCtx.createBiquadFilter();
    eqHigh.type = 'highshelf';
    eqHigh.frequency.value = 3000;

    // Create reverb (convolver) with dry/wet mix
    const reverb = this.audioCtx.createConvolver();
    const reverbGain = this.audioCtx.createGain();
    const dryGain = this.audioCtx.createGain();
    const gain = this.audioCtx.createGain();

    // Generate simple reverb impulse response
    reverb.buffer = this.createReverbImpulse(2, 2);

    // Create dual-source gains
    const cacheGain = this.audioCtx.createGain();
    const streamGain = this.audioCtx.createGain();

    // Connect dual sources to effect chain
    cacheGain.connect(pregain);
    streamGain.connect(pregain);

    // Connect effect chain: pregain -> comp -> tone -> EQ chain -> dry/wet split
    pregain.connect(comp);
    comp.connect(tone);
    tone.connect(eqLow);
    eqLow.connect(eqMid);
    eqMid.connect(eqHigh);

    // Dry/wet split for reverb
    eqHigh.connect(dryGain);
    eqHigh.connect(reverb);
    reverb.connect(reverbGain);

    // Mix dry and wet
    dryGain.connect(gain);
    reverbGain.connect(gain);
    gain.connect(this.masterGain);

    // Initialize preview mode (cache active, stream silent)
    cacheGain.gain.value = 1;
    streamGain.gain.value = 0;

    // Initialize dry/wet mix (100% dry, 0% wet initially)
    dryGain.gain.value = 1;
    reverbGain.gain.value = 0;

    this.cacheGains[stemName] = cacheGain;
    this.streamGains[stemName] = streamGain;
    this.pregainNodes[stemName] = pregain;
    this.compressorNodes[stemName] = comp;
    this.toneNodes[stemName] = tone;
    this.eqLowNodes[stemName] = eqLow;
    this.eqMidNodes[stemName] = eqMid;
    this.eqHighNodes[stemName] = eqHigh;
    this.reverbNodes[stemName] = reverb;
    this.reverbGainNodes[stemName] = reverbGain;
    this.dryGainNodes[stemName] = dryGain;
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
      distortion: 0,
      eqLow: 0.5,
      eqMid: 0.5,
      eqHigh: 0.5,
      reverb: 0
    };
  }

  /**
   * Create a simple reverb impulse response
   */
  private createReverbImpulse(duration: number, decay: number): AudioBuffer {
    const sampleRate = this.audioCtx.sampleRate;
    const length = sampleRate * duration;
    const impulse = this.audioCtx.createBuffer(2, length, sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const n = length - i;
      left[i] = (Math.random() * 2 - 1) * Math.pow(n / length, decay);
      right[i] = (Math.random() * 2 - 1) * Math.pow(n / length, decay);
    }

    return impulse;
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

    // Start cached sources (PREVIEW mode)
    for (const name of Object.keys(this.buffers)) {
      const src = this.audioCtx.createBufferSource();
      src.buffer = this.buffers[name];
      src.connect(this.cacheGains[name]); // Connect to cache path
      src.start(now, Math.min(this.offset, this.buffers[name].duration));
      this.sources[name] = src;
    }

    // Resume streaming sources if they exist and sync them
    if (Object.keys(this.streamAudioElements).length > 0) {
      Object.values(this.streamAudioElements).forEach(audio => {
        audio.currentTime = this.offset;
        audio.play();
      });
    }

    // Start streaming sources in background if user plays for >500ms
    this.scheduleStreamUpgrade();
  }

  /**
   * Schedule background upgrade to streaming mode
   */
  private scheduleStreamUpgrade(): void {
    // Only upgrade if we don't already have streams
    if (Object.keys(this.streamAudioElements).length > 0) {
      console.log('[MusicPlayerEngine] Streams already exist, skipping upgrade');
      return;
    }

    setTimeout(() => {
      if (this.playing && this.playbackMode === 'PREVIEW' && Object.keys(this.streamAudioElements).length === 0) {
        console.log('[MusicPlayerEngine] 🎵 Initiating stream upgrade...');
        this.upgradeToStreaming();
      }
    }, 500);
  }

  pause(): void {
    this.offset += this.audioCtx.currentTime - this.startTime;
    this.stopSources();
    this.playing = false;

    // Pause streaming sources
    Object.values(this.streamAudioElements).forEach(audio => {
      audio.pause();
    });
  }

  togglePlay(): void {
    this.playing ? this.pause() : this.play();
  }

  seek(ratio: number): void {
    this.offset = ratio * this.maxDuration;

    const wasInStreamingMode = this.playbackMode === 'STREAMING';

    // Switch to preview mode for instant seeking
    if (wasInStreamingMode) {
      this.crossfadeToPreview();
    }

    // Sync streaming sources to new position
    Object.values(this.streamAudioElements).forEach(audio => {
      audio.currentTime = this.offset;
    });

    if (this.playing) {
      this.stopSources();
      this.play();

      // If we were in streaming mode, switch back after a brief moment
      if (wasInStreamingMode) {
        setTimeout(() => {
          if (this.playing) {
            this.crossfadeToStreaming();
          }
        }, 100); // 100ms delay to let seek stabilize
      }
    }
  }

  private stopSources(): void {
    // Stop cached sources
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
          ws.connect(this.eqLowNodes[stem]);
        }
        ws.curve = this.makeDistortionCurve(value * 50) as any;
        break;
      case 'eqLow':
        // Map 0-1 to -12dB to +12dB
        this.eqLowNodes[stem].gain.value = (value - 0.5) * 24;
        break;
      case 'eqMid':
        // Map 0-1 to -12dB to +12dB
        this.eqMidNodes[stem].gain.value = (value - 0.5) * 24;
        break;
      case 'eqHigh':
        // Map 0-1 to -12dB to +12dB
        this.eqHighNodes[stem].gain.value = (value - 0.5) * 24;
        break;
      case 'reverb':
        // Crossfade between dry and wet (0 = 100% dry, 1 = 50% wet / 50% dry for natural mix)
        this.dryGainNodes[stem].gain.value = 1 - (value * 0.5);
        this.reverbGainNodes[stem].gain.value = value * 0.5;
        break;
    }
  }

  resetKnob(stem: string, param: KnobParam): void {
    const defaults = {
      pregain: 0.3,
      compression: 0,
      tone: 0.7,
      distortion: 0,
      eqLow: 0.5,
      eqMid: 0.5,
      eqHigh: 0.5,
      reverb: 0
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
        distortion: cfg.distortion,
        eqLow: cfg.eqLow ?? 0.5,
        eqMid: cfg.eqMid ?? 0.5,
        eqHigh: cfg.eqHigh ?? 0.5,
        reverb: cfg.reverb ?? 0
      };

      this.stemGains[stem].gain.value = cfg.muted ? 0 : cfg.volume;
      this.pregainNodes[stem].gain.value = 0.2 + cfg.pregain * 3.8;

      const c = this.compressorNodes[stem];
      c.threshold.value = -60 + cfg.compression * 60;
      c.ratio.value = 1 + cfg.compression * 19;

      this.toneNodes[stem].frequency.value = 300 + cfg.tone * 9700;

      // Restore EQ settings
      this.eqLowNodes[stem].gain.value = ((cfg.eqLow ?? 0.5) - 0.5) * 24;
      this.eqMidNodes[stem].gain.value = ((cfg.eqMid ?? 0.5) - 0.5) * 24;
      this.eqHighNodes[stem].gain.value = ((cfg.eqHigh ?? 0.5) - 0.5) * 24;

      // Restore reverb settings
      const reverbVal = cfg.reverb ?? 0;
      this.dryGainNodes[stem].gain.value = 1 - (reverbVal * 0.5);
      this.reverbGainNodes[stem].gain.value = reverbVal * 0.5;

      if (this.isDistortable(stem)) {
        let ws = this.distortionNodes[stem];
        if (!ws) {
          ws = this.audioCtx.createWaveShaper();
          this.distortionNodes[stem] = ws;
          this.toneNodes[stem].disconnect();
          this.toneNodes[stem].connect(ws);
          ws.connect(this.eqLowNodes[stem]);
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

    // Clean up streaming sources
    Object.values(this.streamAudioElements).forEach(audio => {
      audio.pause();
      audio.src = '';
    });

    this.playing = false;
    this.startTime = 0;
    this.offset = 0;
    this.playbackMode = 'PREVIEW';

    this.buffers = {};
    this.sources = {};
    this.cacheGains = {};
    this.streamAudioElements = {};
    this.streamMediaSources = {};
    this.streamGains = {};
    this.streamUrls = {};

    this.pregainNodes = {};
    this.compressorNodes = {};
    this.toneNodes = {};
    this.eqLowNodes = {};
    this.eqMidNodes = {};
    this.eqHighNodes = {};
    this.reverbNodes = {};
    this.reverbGainNodes = {};
    this.dryGainNodes = {};
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

    // Clean up streaming sources
    Object.values(this.streamAudioElements).forEach(audio => {
      audio.pause();
      audio.src = '';
    });

    // Close the audio context to free resources
    if (this.audioCtx.state !== 'closed') {
      this.audioCtx.close();
    }
  }

  getPlaybackMode(): PlaybackMode {
    return this.playbackMode;
  }
}