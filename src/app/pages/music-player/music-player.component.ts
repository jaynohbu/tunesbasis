import {
  Component,
  Input,
  OnInit,
  OnChanges,
  SimpleChanges
} from '@angular/core';
import { Scene, SceneSong, StemSettings } from 'src/app/model/scene';

interface StemInfo {
  name: string;
  url: string;
}

type KnobParam = 'pregain' | 'compression' | 'tone' | 'distortion';

@Component({
  selector: 'music-player',
  templateUrl: './music-player.component.html',
  styleUrls: ['./music-player.component.scss']
})
export class MusicPlayerComponent implements OnInit, OnChanges {

  @Input() scene!: Scene;
  @Input() activeIndex = 0;

  stems: StemInfo[] = [];

  private readonly STEM_ORDER = [
    'drums',
    'bass',
    'guitar',
    'piano',
    'vocals',
    'other'
  ];

  audioCtx = new AudioContext();
  masterGain = this.audioCtx.createGain();

  buffers: Record<string, AudioBuffer> = {};
  sources: Record<string, AudioBufferSourceNode | null> = {};

  pregainNodes: Record<string, GainNode> = {};
  compressorNodes: Record<string, DynamicsCompressorNode> = {};
  toneNodes: Record<string, BiquadFilterNode> = {};
  stemGains: Record<string, GainNode> = {};
  distortionNodes: Record<string, WaveShaperNode | null> = {};

  globalVolume = 1;

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

  cursorPercent = 0;
  cursorRaf: number | null = null;

  private maxDuration = 0;

  waveformsDrawn = 0;
  waveformsReady = false;

  private isRestoring = false;

  constructor() {
    this.masterGain.connect(this.audioCtx.destination);
  }

  ngOnInit() {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes['scene'] && this.scene?.items?.length) {
      this.activeIndex = 0;
      this.loadFromScene(0);
    }
  }

  private normalizeSceneItem(item: any) {
    if (!item.stems && item.soundState) {
      item.stems = item.soundState;
    }
  }

  async loadFromScene(index = 0) {
    if (!this.scene?.items?.length) return;

    const item = this.scene.items[index];
    this.normalizeSceneItem(item);

    const song = item.song;

    if (!song?.stems || typeof song.stems !== 'object') {
      console.error('Invalid stems:', song?.stems);
      return;
    }

    this.resetPlayer();

    const rawStems = song.stems;

    const stemList: StemInfo[] = Array.isArray(rawStems)
      ? rawStems.filter(s => s?.name && s?.url).map(s => ({ name: s.name, url: s.url }))
      : Object.entries(rawStems)
          .filter(([, url]) => typeof url === 'string')
          .map(([name, url]) => ({ name, url }));

    this.stems = stemList.sort(
      (a, b) =>
        this.STEM_ORDER.indexOf(a.name) -
        this.STEM_ORDER.indexOf(b.name)
    );

    await this.loadBuffers();

    if (item.stems) {
      this.restoreStemSettings(item.stems);
    }
  }

  restoreStemSettings(settings: Record<string, StemSettings>) {
    this.isRestoring = true;

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

      this.stemGains[stem].gain.value =
        cfg.muted ? 0 : cfg.volume;

      this.pregainNodes[stem].gain.value =
        0.2 + cfg.pregain * 3.8;

      const c = this.compressorNodes[stem];
      c.threshold.value = -60 + cfg.compression * 60;
      c.ratio.value = 1 + cfg.compression * 19;

      this.toneNodes[stem].frequency.value =
        300 + cfg.tone * 9700;

      if (this.isDistortable(stem)) {
        let ws = this.distortionNodes[stem];
        if (!ws) {
          ws = this.audioCtx.createWaveShaper();
          this.distortionNodes[stem] = ws;
          this.toneNodes[stem].disconnect();
          this.toneNodes[stem].connect(ws);
          ws.connect(this.stemGains[stem]);
        }
        ws.curve = this.makeDistortionCurve(cfg.distortion * 50);
      }
    });

    this.isRestoring = false;
  }

  persistStemState(stem: string) {
    if (this.isRestoring) return;

    const item = this.scene.items[this.activeIndex];
    if (!item.stems) item.stems = {};

    item.stems[stem] = {
      volume: this.stemVolumes[stem],
      muted: this.stemMuted[stem],
      pregain: this.stemKnobs[stem].pregain,
      compression: this.stemKnobs[stem].compression,
      tone: this.stemKnobs[stem].tone,
      distortion: this.stemKnobs[stem].distortion
    };
  }

  captureCurrentSceneState(): Scene {
    return JSON.parse(JSON.stringify(this.scene));
  }

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

      requestAnimationFrame(() =>
        this.drawWaveform(stem.name, buffer)
      );
    }
  }

  togglePlay() {
    this.playing ? this.pause() : this.play();
  }

  play() {
    if (!Object.keys(this.buffers).length) return;

    const now = this.audioCtx.currentTime;
    this.startTime = now;
    this.playing = true;

    this.startCursorLoop();

    for (const name of Object.keys(this.buffers)) {
      const src = this.audioCtx.createBufferSource();
      src.buffer = this.buffers[name];
      src.connect(this.pregainNodes[name]);
      src.start(now, Math.min(this.offset, this.buffers[name].duration));
      this.sources[name] = src;
    }
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
    this.globalVolume = Number(v);
    this.masterGain.gain.value = this.globalVolume;
  }

  setStemVolume(name: string, v: number) {
    const value = Number(v);
    this.stemVolumes[name] = value;
    this.stemGains[name].gain.value =
      this.stemMuted[name] ? 0 : value;

    this.persistStemState(name);
  }

  toggleMute(name: string) {
    this.stemMuted[name] = !this.stemMuted[name];
    this.stemGains[name].gain.value =
      this.stemMuted[name] ? 0 : this.stemVolumes[name];

    this.persistStemState(name);
  }

  isDistortable(name: string) {
    return name === 'guitar' || name === 'piano';
  }

  setKnob(stem: string, param: KnobParam, value: number) {
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
        ws.curve = this.makeDistortionCurve(value * 50);
        break;
    }

    this.persistStemState(stem);
  }

  startCursorLoop() {
    const tick = () => {
      if (!this.playing) return;

      const elapsed =
        this.offset + (this.audioCtx.currentTime - this.startTime);

      this.cursorPercent =
        Math.min(100, (elapsed / this.maxDuration) * 100);

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

  makeDistortionCurve(amount: number) {
    const n = 44100;
    const curve = new Float32Array(n);
    const deg = Math.PI / 180;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] =
        ((3 + amount) * x * 20 * deg) /
        (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }

  loadScene(scene: Scene) {
    this.scene = scene;
    this.activeIndex = 0;
    this.loadFromScene(0);
  }

  seekFromWave(e: MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const ratio =
      Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));

    this.offset = ratio * this.maxDuration;
    this.cursorPercent = ratio * 100;

    if (this.playing) {
      this.stopSources();
      this.play();
    }
  }

  knobDrag(e: MouseEvent, stem: string, param: KnobParam) {
    e.preventDefault();

    const startY = e.clientY;
    const startVal = this.stemKnobs[stem][param];

    const move = (ev: MouseEvent) => {
      const delta = (startY - ev.clientY) / 150;
      const v = Math.min(1, Math.max(0, startVal + delta));
      this.setKnob(stem, param, v);
      this.persistStemState(stem);
    };

    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };

    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  resetKnob(stem: string, param: KnobParam) {
    const defaults = {
      pregain: 0.3,
      compression: 0,
      tone: 0.7,
      distortion: 0
    };

    this.setKnob(stem, param, defaults[param]);
    this.persistStemState(stem);
  }

  toggleBypassLED(stem: string) {
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

    this.persistStemState(stem);
  }

  resetPlayer() {
    this.stopSources();
    this.stopCursorLoop();

    this.playing = false;
    this.startTime = 0;
    this.offset = 0;
    this.cursorPercent = 0;

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
    this.waveformsDrawn = 0;
    this.waveformsReady = false;
  }
}
