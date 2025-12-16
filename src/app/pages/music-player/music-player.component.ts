import { Component } from '@angular/core';
import { MusicUploadService } from 'src/app/services/music-upload.service';

interface StemInfo {
  name: string;
  url: string;
}

type ProgressMode = 'upload' | 'processing' | 'done';

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

  readonly PROCESSING_TIME_MS = 5 * 60 * 1000; // 5 minutes

  /* ================= AUDIO ================= */

  audioCtx = new AudioContext();
  masterGain = this.audioCtx.createGain();
  buffers: Record<string, AudioBuffer> = {};
  stemGains: Record<string, GainNode> = {};
  sources: Record<string, AudioBufferSourceNode | null> = {};

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
        p => {
          // Cap upload at 90%
          this.progress = Math.min(90, p * 0.9);
        }
      );

      // Upload done → processing phase
      this.startProcessingProgress();

      this.stems = res.data.stems;
      await this.loadBuffers();

      this.finishProgress();

    } catch (err) {
      console.error(err);
      this.resetProgress();
    }
  }

  /* ================= PROCESSING PROGRESS ================= */

  startProcessingProgress() {
    this.progressMode = 'processing';

    const start = Date.now();
    this.progressTimer = setInterval(() => {
      const elapsed = Date.now() - start;
      const ratio = elapsed / this.PROCESSING_TIME_MS;

      // Progress 90 → 99
      this.progress = Math.min(99, 90 + ratio * 9);

    }, 500);
  }

  finishProgress() {
    clearInterval(this.progressTimer);
    this.progressMode = 'done';
    this.loading = false;

    // hide bar after short delay
    setTimeout(() => {
      this.progress = 0;
    }, 500);
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

      const g = this.audioCtx.createGain();
      g.gain.value = 1;
      g.connect(this.masterGain);
      this.stemGains[stem.name] = g;

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
      src.connect(this.stemGains[name]);
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

  toggleMute(name: string) {
    const g = this.stemGains[name];
    g.gain.value = g.gain.value > 0 ? 0 : 1;
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
