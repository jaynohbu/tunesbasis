import { Component } from '@angular/core';
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
export class MusicPlayerComponent {

  file!: File;
  stems: StemInfo[] = [];

  cursorPercent = 0;
  cursorRaf: number | null = null;

  loading = false;
  progress = 0;
  progressMode: ProgressMode = 'upload';
  progressTimer: any = null;
  readonly PROCESSING_TIME_MS = 5 * 60 * 1000;

  audioCtx = new AudioContext();
  masterGain = this.audioCtx.createGain();

  buffers: Record<string, AudioBuffer> = {};
  sources: Record<string, AudioBufferSourceNode | null> = {};

  pregainNodes: Record<string, GainNode> = {};
  compressorNodes: Record<string, DynamicsCompressorNode> = {};
  toneNodes: Record<string, BiquadFilterNode> = {};
  stemGains: Record<string, GainNode> = {};
  distortionNodes: Record<string, WaveShaperNode | null> = {};

  stemVolumes: Record<string, number> = {};
  stemMuted: Record<string, boolean> = {};
  stemBypassLED: Record<string, boolean> = {};

  stemKnobs: Record<string, {
    pregain: number;
    compression: number;
    tone: number;
    distortion: number;
  }> = {};

  playing = false;
  startTime = 0;
  offset = 0;
  globalVolume = 1;

  constructor(private uploadService: MusicUploadService) {
    this.masterGain.connect(this.audioCtx.destination);
  }

  onFileSelected(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files?.length) this.file = input.files[0];
  }

  async upload() {
    if (!this.file || this.loading) return;

    this.loading = true;
    this.progress = 0;
    this.progressMode = 'upload';

    try {
      const res = await this.uploadService.upload(
        this.file,
        p => (this.progress = Math.min(90, p * 0.9))
      );

      this.startProcessingProgress();
      this.stems = res.data.stems;
      await this.loadBuffers();
      this.finishProgress();
    } catch {
      this.resetProgress();
    }
  }

  startProcessingProgress() {
    this.progressMode = 'processing';
    const start = Date.now();

    this.progressTimer = setInterval(() => {
      const ratio = (Date.now() - start) / this.PROCESSING_TIME_MS;
      this.progress = Math.min(99, 90 + ratio * 9);
    }, 500);
  }

  finishProgress() {
    clearInterval(this.progressTimer);
    this.loading = false;
    this.progressMode = 'done';
    setTimeout(() => (this.progress = 0), 600);
  }

  resetProgress() {
    clearInterval(this.progressTimer);
    this.loading = false;
    this.progress = 0;
    this.progressMode = 'upload';
  }

  async loadBuffers() {
    for (const stem of this.stems) {
      const arr = await fetch(stem.url).then(r => r.arrayBuffer());
      const buffer = await this.audioCtx.decodeAudioData(arr);
      this.buffers[stem.name] = buffer;

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

      this.stemVolumes[stem.name] = 1;
      this.stemMuted[stem.name] = false;
      this.stemBypassLED[stem.name] = false;

      this.stemKnobs[stem.name] = {
        pregain: 0.3,
        compression: 0,
        tone: 0.7,
        distortion: 0
      };

      requestAnimationFrame(() =>
        this.drawWaveform(stem.name, buffer)
      );
    }
  }

  togglePlay() {
    this.playing ? this.pause() : this.play();
  }

  play() {
    this.startTime = this.audioCtx.currentTime;
    this.playing = true;
    this.startCursorLoop();

    Object.keys(this.buffers).forEach(name => {
      const src = this.audioCtx.createBufferSource();
      src.buffer = this.buffers[name];
      src.connect(this.pregainNodes[name]);
      src.start(0, this.offset);
      this.sources[name] = src;
    });
  }

  pause() {
    this.offset += this.audioCtx.currentTime - this.startTime;
    this.stopSources();
    this.stopCursorLoop();
    this.playing = false;
  }

  stopSources() {
    Object.values(this.sources).forEach(s => {
      try { s?.stop(); } catch {}
    });
    this.sources = {};
  }

  setGlobalVolume(v: number) {
    this.globalVolume = v;
    this.masterGain.gain.value = v;
  }

  setStemVolume(name: string, v: number) {
    this.stemVolumes[name] = v;
    this.stemGains[name].gain.value = v;
  }

  toggleMute(name: string) {
    this.stemMuted[name] = !this.stemMuted[name];
    this.stemGains[name].gain.value =
      this.stemMuted[name] ? 0 : this.stemVolumes[name];
  }

  isDistortable(name: string) {
    return name === 'guitar' || name === 'piano';
  }

  setKnob(stem: string, param: KnobParam, value: number) {
    this.stemKnobs[stem][param] = value;

    if (param === 'pregain') {
      this.pregainNodes[stem].gain.value = 1 + value * 10;
    }

    if (param === 'compression') {
      const c = this.compressorNodes[stem];
      if (value === 0) {
        c.threshold.value = 0;
        c.ratio.value = 1;
      } else {
        c.threshold.value = -20 - value * 20;
        c.ratio.value = 1 + value * 7;
      }
    }

    if (param === 'tone') {
      this.toneNodes[stem].frequency.value = 500 + value * 8000;
    }

    if (param === 'distortion') {
      if (!this.isDistortable(stem)) return;
      if (value === 0) {
        this.distortionNodes[stem] = null;
        return;
      }
      const ws = this.audioCtx.createWaveShaper();
      ws.curve = this.makeDistortionCurve(60 + value * 300);
      ws.oversample = '4x';
      this.distortionNodes[stem] = ws;
    }
  }

  resetKnob(stem: string, param: KnobParam) {
    const defaults = {
      pregain: 0.3,
      compression: 0,
      tone: 0.7,
      distortion: 0
    };
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

  makeDistortionCurve(amount: number) {
    const n = 44100;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = Math.tanh(amount * x);
    }
    return curve;
  }

  startCursorLoop() {
    const duration = this.getDuration();
    const tick = () => {
      if (!this.playing) return;
      const t = this.offset + (this.audioCtx.currentTime - this.startTime);
      this.cursorPercent = Math.min(100, (t / duration) * 100);
      this.cursorRaf = requestAnimationFrame(tick);
    };
    tick();
  }

  stopCursorLoop() {
    if (this.cursorRaf) cancelAnimationFrame(this.cursorRaf);
    this.cursorRaf = null;
  }

  seekFromWave(e: MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    this.offset = ratio * this.getDuration();
    if (this.playing) {
      this.stopSources();
      this.play();
    }
  }

  getDuration(): number {
    const first = Object.values(this.buffers)[0];
    return first ? first.duration : 1;
  }

  drawWaveform(name: string, buffer: AudioBuffer) {
    const canvas = document.querySelector(
      `canvas[data-stem="${name}"]`
    ) as HTMLCanvasElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d')!;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    const data = buffer.getChannelData(0);
    const step = Math.ceil(data.length / w);
    const amp = h / 2;

    ctx.clearRect(0, 0, w, h);
    ctx.beginPath();

    for (let i = 0; i < w; i++) {
      let min = 1, max = -1;
      for (let j = 0; j < step; j++) {
        const v = data[i * step + j] || 0;
        min = Math.min(min, v);
        max = Math.max(max, v);
      }
      ctx.moveTo(i, (1 + min) * amp);
      ctx.lineTo(i, (1 + max) * amp);
    }

    ctx.strokeStyle = '#4caf50';
    ctx.stroke();
  }
}
