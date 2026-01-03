import {
  Component,
  Input,
  OnInit,
  OnDestroy,
  OnChanges,
  SimpleChanges,
  ViewChildren,
  QueryList,
  ElementRef,
  AfterViewInit,
} from '@angular/core';
import { ParticipantAudioStream } from 'src/app/services/webrtc-audio.service';
import { WebRTCAudioService } from 'src/app/services/webrtc-audio.service';
import { RecordedStem } from 'src/app/services/recording-to-stem.service';

/**
 * Participant Waveforms Component
 *
 * Displays live waveform visualization for:
 * - Local user's microphone (if enabled)
 * - Remote participants' audio streams
 *
 * Uses Web Audio API AnalyserNode to get frequency/time data
 * and renders waveforms on canvas elements.
 */
@Component({
  selector: 'app-participant-waveforms',
  templateUrl: './participant-waveforms.component.html',
  styleUrls: ['./participant-waveforms.component.scss'],
})
export class ParticipantWaveformsComponent
  implements OnInit, OnDestroy, OnChanges, AfterViewInit
{
  @Input() mode: 'live' | 'recorded' = 'live';
  @Input() localEnabled = false;
  @Input() localStream: MediaStream | null = null; // For local mic before jam session
  @Input() remoteStreams: ParticipantAudioStream[] = [];
  @Input() recordedStems: RecordedStem[] = [];

  @ViewChildren('waveformCanvas') canvases!: QueryList<
    ElementRef<HTMLCanvasElement>
  >;

  private animationFrameId: number | null = null;
  private localAnalyser: AnalyserNode | null = null;
  private localDataArray: Uint8Array | null = null;
  private localAudioContext: AudioContext | null = null;

  constructor(private webrtcAudioService: WebRTCAudioService) {}

  ngOnInit(): void {
    // Get local analyser if microphone is enabled
    if (this.localEnabled) {
      this.setupLocalAnalyser();
    }
  }

  ngAfterViewInit(): void {
    // Start animation loop only in live mode
    if (this.mode === 'live') {
      this.startAnimation();
    } else {
      // In recorded mode, draw once
      setTimeout(() => this.drawRecordedWaveforms(), 0);
    }
  }

  ngOnDestroy(): void {
    this.stopAnimation();

    // Don't close AudioContext - it's owned by WebRTC service
    // Just clear our references
    this.localAudioContext = null;
    this.localAnalyser = null;
    this.localDataArray = null;
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Only handle changes after view is initialized
    if (!this.canvases) {
      return;
    }

    // Handle localEnabled changes - setup analyser when mic is turned on
    if (changes['localEnabled']) {
      if (this.localEnabled && !this.localAnalyser) {
        this.setupLocalAnalyser();
      }
    }

    // Handle mode changes
    if (this.mode === 'live') {
      // Switch to live mode - start animation
      if (this.animationFrameId === null) {
        this.startAnimation();
      }
    } else {
      // Switch to recorded mode - stop animation and draw once
      this.stopAnimation();
      setTimeout(() => this.drawRecordedWaveforms(), 0);
    }
  }

  private async setupLocalAnalyser(): Promise<void> {
    // IMPORTANT: Get analyser from WebRTC service instead of creating our own
    // The WebRTC service already created a MediaStreamSource for the local stream
    // Creating a second MediaStreamSource from the same stream causes issues
    const localAnalyserData = this.webrtcAudioService.getLocalAnalyser();

    if (!localAnalyserData) {
      // Retry after a short delay if analyser not available yet
      setTimeout(() => this.setupLocalAnalyser(), 100);
      return;
    }

    this.localAnalyser = localAnalyserData.analyser;
    this.localDataArray = localAnalyserData.dataArray;
  }

  private startAnimation(): void {
    const animate = () => {
      this.drawWaveforms();
      this.animationFrameId = requestAnimationFrame(animate);
    };

    animate();
  }

  private stopAnimation(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private drawWaveforms(): void {
    if (this.mode === 'live') {
      this.drawLiveWaveforms();
    } else {
      this.drawRecordedWaveforms();
    }
  }

  private drawLiveWaveforms(): void {
    if (!this.canvases) {
      return;
    }

    const canvasArray = this.canvases.toArray();
    let canvasIndex = 0;

    // Draw local waveform
    if (this.localEnabled && this.localAnalyser && this.localDataArray) {
      if (canvasIndex < canvasArray.length) {
        this.drawLiveWaveform(
          canvasArray[canvasIndex].nativeElement,
          this.localAnalyser,
          this.localDataArray,
          '#4CAF50', // Green for local
        );
        canvasIndex++;
      }
    } else if (this.localEnabled) {
      console.log('[ParticipantWaveforms] Local enabled but analyser not ready:', {
        localEnabled: this.localEnabled,
        hasAnalyser: !!this.localAnalyser,
        hasDataArray: !!this.localDataArray
      });
    }

    // Draw remote waveforms
    for (const stream of this.remoteStreams) {
      if (canvasIndex < canvasArray.length) {
        this.drawLiveWaveform(
          canvasArray[canvasIndex].nativeElement,
          stream.analyser,
          stream.dataArray,
          '#2196F3', // Blue for remote
        );
        canvasIndex++;
      }
    }
  }

  private drawRecordedWaveforms(): void {
    const canvasArray = this.canvases.toArray();

    for (let i = 0; i < this.recordedStems.length; i++) {
      if (i < canvasArray.length) {
        this.drawStaticWaveform(
          canvasArray[i].nativeElement,
          this.recordedStems[i].audioBuffer,
          this.recordedStems[i].userId === 'local' ? '#4CAF50' : '#2196F3',
        );
      }
    }
  }

  private drawLiveWaveform(
    canvas: HTMLCanvasElement,
    analyser: AnalyserNode,
    dataArray: Uint8Array,
    color: string,
  ): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Get time domain data
    analyser.getByteTimeDomainData(dataArray);

    // Clear canvas
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw waveform
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.beginPath();

    const sliceWidth = (canvas.width * 1.0) / dataArray.length;
    let x = 0;

    for (let i = 0; i < dataArray.length; i++) {
      const v = dataArray[i] / 128.0;
      const y = (v * canvas.height) / 2;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }

      x += sliceWidth;
    }

    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();
  }

  private drawStaticWaveform(
    canvas: HTMLCanvasElement,
    buffer: AudioBuffer,
    color: string,
  ): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Setup canvas with device pixel ratio
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;

    // Mix stereo to mono
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

    // Clear canvas
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = color;

    // Draw vertical bars
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
  }

  getParticipantLabel(index: number): string {
    if (this.mode === 'recorded') {
      if (index >= 0 && index < this.recordedStems.length) {
        return this.recordedStems[index].userName;
      }
      return 'Unknown';
    }

    // Live mode
    if (index === 0 && this.localEnabled) {
      return 'You (Local)';
    }

    const remoteIndex = this.localEnabled ? index - 1 : index;
    if (remoteIndex >= 0 && remoteIndex < this.remoteStreams.length) {
      return this.remoteStreams[remoteIndex].userName;
    }

    return 'Unknown';
  }

  getTotalParticipants(): number {
    if (this.mode === 'recorded') {
      return this.recordedStems.length;
    }

    let count = 0;
    if (this.localEnabled) count++;
    count += this.remoteStreams.length;
    return count;
  }
}
