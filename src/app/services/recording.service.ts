import { Injectable, NgZone } from '@angular/core';
import { Subject } from 'rxjs';

/**
 * Recording Quality Presets
 */
export enum RecordingQuality {
  MEDIUM = 96000,   // 96 kbps (~7 MB for 10 min)
  HIGH = 128000,    // 128 kbps (~10 MB for 10 min) - default
  VERY_HIGH = 192000 // 192 kbps (~14 MB for 10 min)
}

/**
 * Recording Metadata
 */
export interface RecordingMetadata {
  sessionId: string;
  userId: string;
  userName: string;
  startServerTime: number;
  startLocalTime: number;
  duration: number;
  quality: RecordingQuality;
  fileSize: number;
}

/**
 * Recording Service
 *
 * Records jam session audio with strict 10-minute limit.
 * Captures user's personal mix (what they hear) with timestamp correlation.
 *
 * Features:
 * - Auto-stop at 10 minutes
 * - Warning at 9 minutes
 * - Live duration tracking
 * - Automatic download on stop
 * - WebM/Opus compression (~1 MB per minute)
 */
@Injectable({
  providedIn: 'root',
})
export class RecordingService {
  private readonly MAX_DURATION_MS = 10 * 60 * 1000; // 10 minutes
  private readonly WARN_DURATION_MS = 9 * 60 * 1000; // 9 minutes

  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private recordingStartTime: number = 0;
  private autoStopTimer: any = null;
  private warnTimer: any = null;
  private durationInterval: any = null;

  private metadata: Partial<RecordingMetadata> = {};

  // Observable for recording state
  private recordingStateSubject = new Subject<{
    isRecording: boolean;
    duration: number;
    estimatedSize: number;
  }>();
  public recordingState$ = this.recordingStateSubject.asObservable();

  // Observable for warnings
  private warningSubject = new Subject<string>();
  public warning$ = this.warningSubject.asObservable();

  constructor(private zone: NgZone) {}

  /**
   * Start recording jam session
   *
   * @param audioContext - Web Audio API context
   * @param masterGainNode - Master gain node to tap audio from
   * @param sessionId - Jam session ID
   * @param userId - Current user ID
   * @param userName - Current user name
   * @param serverStartTime - Server timestamp when playback started
   * @param quality - Recording quality preset
   */
  async startRecording(
    audioContext: AudioContext,
    masterGainNode: GainNode,
    sessionId: string,
    userId: string,
    userName: string,
    serverStartTime: number,
    quality: RecordingQuality = RecordingQuality.HIGH,
  ): Promise<void> {
    // If already recording, stop and discard the current recording
    if (this.mediaRecorder) {
      console.log('[Recording] Stopping existing recording to start new one');
      this.discardRecording();
    }

    try {
      // Create media stream destination from audio context
      const dest = audioContext.createMediaStreamDestination();

      // Connect master gain node to our recorder
      // This captures what the user hears (their mix)
      masterGainNode.connect(dest);

      // Check if browser supports the codec
      const mimeType = this.getSupportedMimeType();
      if (!mimeType) {
        throw new Error('Browser does not support WebM/Opus recording');
      }

      // Create media recorder with quality settings
      const options = {
        mimeType,
        audioBitsPerSecond: quality,
      };

      this.mediaRecorder = new MediaRecorder(dest.stream, options);
      this.audioChunks = [];
      this.recordingStartTime = Date.now();

      // Store metadata
      this.metadata = {
        sessionId,
        userId,
        userName,
        startServerTime: serverStartTime,
        startLocalTime: this.recordingStartTime,
        quality,
      };

      // Handle data chunks
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      // Handle recording stop
      this.mediaRecorder.onstop = () => {
        this.onRecordingStopped();
      };

      // Start recording
      this.mediaRecorder.start();

      // Set up auto-stop timer (10 minutes)
      this.autoStopTimer = setTimeout(() => {
        console.log('[Recording] Max duration reached, auto-stopping');
        this.zone.run(() => {
          this.warningSubject.next('Maximum recording duration reached (10 minutes)');
        });
        this.stopRecording();
      }, this.MAX_DURATION_MS);

      // Set up warning timer (9 minutes)
      this.warnTimer = setTimeout(() => {
        console.log('[Recording] Warning: 1 minute remaining');
        this.zone.run(() => {
          this.warningSubject.next('Recording will stop in 1 minute');
        });
      }, this.WARN_DURATION_MS);

      // Update duration every second
      this.startDurationTracking(quality);

      console.log('[Recording] Started:', {
        sessionId,
        quality,
        maxDuration: '10 minutes',
      });
    } catch (error) {
      console.error('[Recording] Failed to start:', error);
      this.cleanup();
      throw error;
    }
  }

  /**
   * Stop recording and download file
   */
  stopRecording(): void {
    if (!this.mediaRecorder) {
      console.warn('[Recording] No active recording to stop');
      return;
    }

    console.log('[Recording] Stopping...');
    this.mediaRecorder.stop();
    this.cleanup();
  }

  /**
   * Discard current recording without saving
   * Used when restarting a recording
   */
  private discardRecording(): void {
    if (!this.mediaRecorder) {
      return;
    }

    console.log('[Recording] Discarding current recording');

    // Remove the onstop handler to prevent download
    this.mediaRecorder.onstop = null;

    // Stop the recorder
    if (this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }

    // Clear data
    this.audioChunks = [];
    this.metadata = {};
    this.mediaRecorder = null;
    this.recordingStartTime = 0;

    // Cleanup timers
    this.cleanup();

    // Emit stopped state
    this.zone.run(() => {
      this.recordingStateSubject.next({
        isRecording: false,
        duration: 0,
        estimatedSize: 0,
      });
    });
  }

  /**
   * Check if currently recording
   */
  isRecording(): boolean {
    return this.mediaRecorder !== null && this.mediaRecorder.state === 'recording';
  }

  /**
   * Get current recording duration in seconds
   */
  getCurrentDuration(): number {
    if (!this.recordingStartTime) return 0;
    return Math.floor((Date.now() - this.recordingStartTime) / 1000);
  }

  /**
   * Handle recording stopped event
   */
  private onRecordingStopped(): void {
    const duration = this.getCurrentDuration();

    // Create blob from chunks
    const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
    const fileSize = blob.size;

    console.log('[Recording] Stopped:', {
      duration: `${duration}s`,
      size: `${(fileSize / 1024 / 1024).toFixed(2)} MB`,
    });

    // Complete metadata
    const completeMetadata: RecordingMetadata = {
      ...this.metadata as RecordingMetadata,
      duration,
      fileSize,
    };

    // Download file
    this.downloadRecording(blob, completeMetadata);

    // Reset state
    this.audioChunks = [];
    this.metadata = {};
    this.mediaRecorder = null;
    this.recordingStartTime = 0;

    // Emit final state
    this.zone.run(() => {
      this.recordingStateSubject.next({
        isRecording: false,
        duration: 0,
        estimatedSize: 0,
      });
    });
  }

  /**
   * Download recording file
   */
  private downloadRecording(blob: Blob, metadata: RecordingMetadata): void {
    // Create filename
    const timestamp = new Date(metadata.startLocalTime).toISOString().replace(/[:.]/g, '-');
    const filename = `jam-${metadata.sessionId.substring(0, 8)}-${timestamp}.webm`;

    // Create download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Also download metadata as JSON
    this.downloadMetadata(metadata, filename.replace('.webm', '-metadata.json'));

    console.log('[Recording] Downloaded:', filename);
  }

  /**
   * Download metadata JSON
   */
  private downloadMetadata(metadata: RecordingMetadata, filename: string): void {
    const json = JSON.stringify(metadata, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Start tracking duration for UI updates
   */
  private startDurationTracking(quality: RecordingQuality): void {
    this.durationInterval = setInterval(() => {
      const duration = this.getCurrentDuration();
      const estimatedSize = this.estimateFileSize(duration, quality);

      this.zone.run(() => {
        this.recordingStateSubject.next({
          isRecording: true,
          duration,
          estimatedSize,
        });
      });
    }, 1000);
  }

  /**
   * Estimate file size based on duration and quality
   */
  private estimateFileSize(durationSeconds: number, quality: RecordingQuality): number {
    // Bitrate in bytes per second
    const bytesPerSecond = quality / 8;
    return durationSeconds * bytesPerSecond;
  }

  /**
   * Get supported MIME type for recording
   */
  private getSupportedMimeType(): string | null {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return null;
  }

  /**
   * Cleanup timers and state
   */
  private cleanup(): void {
    if (this.autoStopTimer) {
      clearTimeout(this.autoStopTimer);
      this.autoStopTimer = null;
    }

    if (this.warnTimer) {
      clearTimeout(this.warnTimer);
      this.warnTimer = null;
    }

    if (this.durationInterval) {
      clearInterval(this.durationInterval);
      this.durationInterval = null;
    }
  }

  /**
   * Format duration for display (MM:SS)
   */
  formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes: number): string {
    const mb = bytes / 1024 / 1024;
    return `${mb.toFixed(1)} MB`;
  }
}
