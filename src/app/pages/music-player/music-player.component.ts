import { Component, OnInit } from '@angular/core';
import { MusicUploadService } from 'src/app/services/music-upload.service';

interface StemInfo {
  name: string;
  url: string;
}

type ProgressMode = 'upload' | 'processing' | 'done';
type KnobParam = 'pregain' | 'compression' | 'tone' | 'distortion';

@Component({
  selector: 'app-music-player',
  templateUrl: './music-player.component.html',
  styleUrls: ['./music-player.component.scss']
})
export class MusicPlayerComponent implements OnInit {
  private readonly STEM_ORDER = [
    'drums',
    'bass',
    'guitar',
    'piano',
    'vocals',
    'other'
  ];
  onStemsReady(stems: { name: string; url: string }[]) {
    this.resetPlayer();

    this.stems = stems
      .slice()
      .sort(
        (a, b) =>
          this.STEM_ORDER.indexOf(a.name) -
          this.STEM_ORDER.indexOf(b.name)
      );

    this.loadBuffers();
  }

  waveformsDrawn = 0;
  waveformsReady = false;

  /* ================= FILE / STEM ================= */

  file!: File;
  stems: StemInfo[] = [];



  /* ================= AUDIO ================= */

  audioCtx = new AudioContext();
  masterGain = this.audioCtx.createGain();

  buffers: Record<string, AudioBuffer> = {};
  sources: Record<string, AudioBufferSourceNode | null> = {};

  pregainNodes: Record<string, GainNode> = {};
  compressorNodes: Record<string, DynamicsCompressorNode> = {};
  toneNodes: Record<string, BiquadFilterNode> = {};
  stemGains: Record<string, GainNode> = {};
  distortionNodes: Record<string, WaveShaperNode | null> = {};

  /* ================= UI STATE ================= */

  stemVolumes: Record<string, number> = {};
  stemMuted: Record<string, boolean> = {};
  stemBypassLED: Record<string, boolean> = {};

  stemKnobs: Record<string, {
    pregain: number;
    compression: number;
    tone: number;
    distortion: number;
  }> = {};

  /* ================= TRANSPORT ================= */

  playing = false;
  startTime = 0;
  offset = 0;
  globalVolume = 1;

  cursorPercent = 0;
  cursorRaf: number | null = null;

  // Cached maximum duration across all stems
  private maxDuration = 0;

  constructor(private uploadService: MusicUploadService) {
    this.masterGain.connect(this.audioCtx.destination);
  }

  /* ================= INIT ================= */

  async ngOnInit() {
    await this.loadLatestSavedSong();
  }

  async loadLatestSavedSong() {
    try {
      const res = await this.uploadService.listSongs();
      const songs = res?.data ?? [];
      if (!songs.length) return;

      const latest = songs[songs.length - 1];
      if (!Array.isArray(latest.stems)) return;

      this.resetPlayer();
      this.stems = latest.stems
        .slice()
        .sort((a: any, b: any) =>
          this.STEM_ORDER.indexOf(a.name) -
          this.STEM_ORDER.indexOf(b.name)
        )
        .map((s: any) => ({
          name: s.name,
          url: s.url
        }));

      await this.loadBuffers();
    } catch (e) {
      console.error('Failed to load saved song', e);
    }
  }

  resetPlayer() {
    this.stopSources();
    this.buffers = {};
    this.pregainNodes = {};
    this.compressorNodes = {};
    this.toneNodes = {};
    this.stemGains = {};
    this.distortionNodes = {};
    this.stemVolumes = {};
    this.stemMuted = {};
    this.stemBypassLED = {};
    this.stemKnobs = {};
    this.offset = 0;
    this.cursorPercent = 0;
    this.maxDuration = 0;
  }

  /* ================= FILE ================= */

  onFileSelected(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files?.length) this.file = input.files[0];
  }

  /* ================= UPLOAD ================= */



  /* ================= LOAD AUDIO ================= */

  async loadBuffers() {
    this.maxDuration = 0;

    for (const stem of this.stems) {
      const arr = await fetch(stem.url).then(r => r.arrayBuffer());
      const buffer = await this.audioCtx.decodeAudioData(arr);
      this.buffers[stem.name] = buffer;

      this.maxDuration = Math.max(this.maxDuration, buffer.duration);

      const pregain = this.audioCtx.createGain();
      const comp = this.audioCtx.createDynamicsCompressor();
      const tone = this.audioCtx.createBiquadFilter();
      const gain = this.audioCtx.createGain();

      comp.threshold.value = 0;
      comp.ratio.value = 1;
      tone.type = 'lowpass';
      tone.frequency.value = 6000;

      pregain.connect(comp);
      comp.connect(tone);
      tone.connect(gain);
      gain.connect(this.masterGain);

      this.pregainNodes[stem.name] = pregain;
      this.compressorNodes[stem.name] = comp;
      this.toneNodes[stem.name] = tone;
      this.stemGains[stem.name] = gain;
      this.distortionNodes[stem.name] = null;

      this.stemVolumes[stem.name] = 1;
      this.stemMuted[stem.name] = false;
      this.stemBypassLED[stem.name] = false;

      this.stemKnobs[stem.name] = {
        pregain: 0.3,
        compression: 0,
        tone: 0.7,
        distortion: 0
      };

      requestAnimationFrame(() => this.drawWaveform(stem.name, buffer));
    }

    console.log('Max duration:', this.maxDuration.toFixed(3) + 's');
  }

  /* ================= PLAYBACK ================= */

  togglePlay() {
    this.playing ? this.pause() : this.play();
  }

  // play() {
  //   if (this.maxDuration === 0 || Object.keys(this.buffers).length === 0) return;

  //   const now = this.audioCtx.currentTime;
  //   this.startTime = now;
  //   this.playing = true;
  //   this.startCursorLoop();

  //   Object.keys(this.buffers).forEach(name => {
  //     const src = this.audioCtx.createBufferSource();
  //     src.buffer = this.buffers[name];
  //     src.connect(this.pregainNodes[name]);

  //     const startOffset = Math.min(this.offset, this.buffers[name].duration);
  //     src.start(now, startOffset);

  //     this.sources[name] = src;
  //   });
  // }
  play() {
    if (this.maxDuration === 0 || Object.keys(this.buffers).length === 0) return;

    const now = this.audioCtx.currentTime;
    this.startTime = now;
    this.playing = true;

    // 🔧 FORCE cursor sync at audio start
    this.cursorPercent = (this.offset / this.maxDuration) * 100;

    this.startCursorLoop();

    Object.keys(this.buffers).forEach(name => {
      const src = this.audioCtx.createBufferSource();
      src.buffer = this.buffers[name];
      src.connect(this.pregainNodes[name]);

      const startOffset = Math.min(this.offset, this.buffers[name].duration);
      src.start(now, startOffset);

      this.sources[name] = src;
    });
  }

  pause() {
    this.offset += this.audioCtx.currentTime - this.startTime;
    this.offset = Math.min(this.offset, this.maxDuration);

    this.stopSources();
    this.stopCursorLoop();
    this.playing = false;
  }

  stopSources() {
    Object.values(this.sources).forEach(s => {
      try { s?.stop(); } catch { }
    });
    this.sources = {};
  }

  /* ================= CURSOR ================= */

  startCursorLoop() {
    if (this.maxDuration === 0) return;

    const tick = () => {
      if (!this.playing) return;

      const elapsed = this.offset + (this.audioCtx.currentTime - this.startTime);
      const ratio = elapsed / this.maxDuration;
      this.cursorPercent = Math.min(100, Math.max(0, ratio * 100));

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

  seekFromWave(e: MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));

    this.offset = ratio * this.maxDuration;
    this.cursorPercent = ratio * 100;

    if (this.playing) {
      this.stopSources();
      this.play();
    }
  }

  getDuration(): number {
    return this.maxDuration || 1;
  }

  /* ================= MIX ================= */

  setGlobalVolume(v: number) {
    this.globalVolume = v;
    this.masterGain.gain.value = v;
  }

  setStemVolume(name: string, v: number) {
    this.stemVolumes[name] = v;
    this.stemGains[name].gain.value = this.stemMuted[name] ? 0 : v;
  }

  toggleMute(name: string) {
    this.stemMuted[name] = !this.stemMuted[name];
    this.stemGains[name].gain.value = this.stemMuted[name] ? 0 : this.stemVolumes[name];
  }

  /* ================= KNOBS ================= */

  isDistortable(name: string) {
    return name === 'guitar' || name === 'piano';
  }

  setKnob(stem: string, param: KnobParam, value: number) {
    this.stemKnobs[stem][param] = value;
  }

  resetKnob(stem: string, param: KnobParam) {
    const defaults = { pregain: 0.3, compression: 0, tone: 0.7, distortion: 0 };
    this.setKnob(stem, param, defaults[param]);
  }

  toggleBypassLED(stem: string) {
    this.stemBypassLED[stem] = !this.stemBypassLED[stem];
  }

  knobDrag(e: MouseEvent, stem: string, param: KnobParam) {
    e.preventDefault();
    const startY = e.clientY;
    const startVal = this.stemKnobs[stem][param];

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

  /* ================= WAVEFORM - BOLD & PROFESSIONAL ================= */

  drawWaveform(name: string, buffer: AudioBuffer) {
    const canvas = document.querySelector(
      `canvas[data-stem="${name}"]`
    ) as HTMLCanvasElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Ensure canvas resolution matches displayed size
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;

    if (cssWidth === 0 || cssHeight === 0) return;

    // Handle HiDPI / scaling correctly
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(cssWidth * dpr);
    canvas.height = Math.floor(cssHeight * dpr);
    ctx.scale(dpr, dpr);

    const width = cssWidth;
    const height = cssHeight;
    const centerY = height / 2;

    // --- Mix to mono (time-accurate) ---
    let data: Float32Array;

    if (buffer.numberOfChannels > 1) {
      const ch0 = buffer.getChannelData(0);
      const ch1 = buffer.getChannelData(1);
      const len = ch0.length;

      data = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        data[i] = (ch0[i] + ch1[i]) * 0.5;
      }
    } else {
      data = buffer.getChannelData(0);
    }

    const totalSamples = data.length;

    // 🔴 CRITICAL: never allow blockSize = 0
    const samplesPerPixel = Math.max(
      1,
      Math.floor(totalSamples / width)
    );

    // --- Clear ---
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#4caf50';

    // --- Draw waveform ---
    for (let x = 0; x < width; x++) {
      const start = x * samplesPerPixel;
      const end = Math.min(start + samplesPerPixel, totalSamples);

      let min = 1.0;
      let max = -1.0;

      for (let i = start; i < end; i++) {
        const v = data[i];
        if (v < min) min = v;
        if (v > max) max = v;
      }

      const yTop = centerY + min * centerY;
      const yBottom = centerY + max * centerY;

      ctx.fillRect(x, yTop, 1, Math.max(1, yBottom - yTop));
    }

    // --- Waveform readiness tracking ---
    this.waveformsDrawn++;

    if (this.waveformsDrawn === this.stems.length) {
      this.waveformsReady = true;
    }
  }


}