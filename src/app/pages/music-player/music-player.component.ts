import { Component } from '@angular/core';
import { MusicUploadService } from 'src/app/services/music-upload.service';

interface StemInfo {
  name: string;
  url: string;
}

type ProgressMode = 'upload' | 'processing' | 'done';
type DistortionType = 'none' | 'light' | 'medium' | 'heavy';

@Component({
  selector: 'app-music-player',
  templateUrl: './music-player.component.html',
  styleUrls: ['./music-player.component.scss']
})
export class MusicPlayerComponent {

  file!: File;
  stems: StemInfo[] = [];

  /* ================= PROGRESS ================= */

  loading = false;
  progress = 0;
  progressMode: ProgressMode = 'upload';
  progressTimer: any = null;
  readonly PROCESSING_TIME_MS = 5 * 60 * 1000;

  /* ================= AUDIO ================= */

  audioCtx = new AudioContext();
  masterGain = this.audioCtx.createGain();

  buffers: Record<string, AudioBuffer> = {};
  stemGains: Record<string, GainNode> = {};
  sources: Record<string, AudioBufferSourceNode | null> = {};

  /** ✅ NEW */
  stemVolumes: Record<string, number> = {};
  distortionNodes: Record<string, WaveShaperNode | null> = {};
  stemDistortion: Record<string, DistortionType> = {};

  playing = false;
  startTime = 0;
  offset = 0;
  globalVolume = 1;

  constructor(private uploadService: MusicUploadService) {
    this.masterGain.connect(this.audioCtx.destination);
  }

  /* ================= FILE ================= */

  onFileSelected(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files?.length) this.file = input.files[0];
  }

  /* ================= UPLOAD ================= */

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
    } catch (e) {
      console.error(e);
      this.resetProgress();
    }
  }

  /* ================= PROCESSING BAR ================= */

  startProcessingProgress() {
    this.progressMode = 'processing';
    const start = Date.now();

    this.progressTimer = setInterval(() => {
      const elapsed = Date.now() - start;
      const ratio = elapsed / this.PROCESSING_TIME_MS;
      this.progress = Math.min(99, 90 + ratio * 9);
    }, 500);
  }

  finishProgress() {
    clearInterval(this.progressTimer);
    this.loading = false;
    this.progressMode = 'done';
    setTimeout(() => (this.progress = 0), 500);
  }

  resetProgress() {
    clearInterval(this.progressTimer);
    this.loading = false;
    this.progress = 0;
    this.progressMode = 'upload';
  }

  /* ================= AUDIO LOAD ================= */

  async loadBuffers() {
    for (const stem of this.stems) {
      const arr = await fetch(stem.url).then(r => r.arrayBuffer());
      const buffer = await this.audioCtx.decodeAudioData(arr);
      this.buffers[stem.name] = buffer;

      const gain = this.audioCtx.createGain();
      gain.gain.value = 1;
      gain.connect(this.masterGain);

      this.stemGains[stem.name] = gain;
      this.stemVolumes[stem.name] = 1;

      /** ✅ NEW */
      this.distortionNodes[stem.name] = null;
      this.stemDistortion[stem.name] = 'none';

      requestAnimationFrame(() =>
        this.drawWaveform(stem.name, buffer)
      );
    }
  }

  /* ================= PLAYBACK ================= */

  togglePlay() {
    this.playing ? this.pause() : this.play();
  }

  play() {
    this.startTime = this.audioCtx.currentTime;
    this.playing = true;

    Object.keys(this.buffers).forEach(name => {
      const src = this.audioCtx.createBufferSource();
      src.buffer = this.buffers[name];

      const dist = this.distortionNodes[name];
      if (dist) {
        src.connect(dist);
        dist.connect(this.stemGains[name]);
      } else {
        src.connect(this.stemGains[name]);
      }

      src.start(0, this.offset);
      this.sources[name] = src;
    });
  }

  pause() {
    this.offset += this.audioCtx.currentTime - this.startTime;
    this.stopSources();
    this.playing = false;
  }

  stopSources() {
    Object.values(this.sources).forEach(s => {
      try { s?.stop(); } catch {}
    });
    this.sources = {};
  }

  /* ================= VOLUME ================= */

  setGlobalVolume(v: number) {
    this.globalVolume = v;
    this.masterGain.gain.value = v;
  }

  setStemVolume(name: string, v: number) {
    this.stemVolumes[name] = v;
    this.stemGains[name].gain.value = v;
  }

  toggleMute(name: string) {
    const g = this.stemGains[name];
    g.gain.value = g.gain.value > 0 ? 0 : this.stemVolumes[name];
  }

  /* ================= DISTORTION ================= */

  isDistortable(name: string) {
    return name === 'guitar' || name === 'piano';
  }

  setDistortion(name: string, type: DistortionType) {
    this.stemDistortion[name] = type;

    if (type === 'none') {
      this.distortionNodes[name] = null;
      return;
    }

    const ws = this.audioCtx.createWaveShaper();
    ws.curve = this.makeDistortionCurve(
      type === 'light' ? 50 :
      type === 'medium' ? 150 : 400
    );
    ws.oversample = '4x';
    this.distortionNodes[name] = ws;
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

  /* ================= WAVEFORM ================= */

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
