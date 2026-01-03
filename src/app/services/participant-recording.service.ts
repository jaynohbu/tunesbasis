import { Injectable, NgZone } from '@angular/core';
import { Subject } from 'rxjs';
import { ParticipantAudioStream } from './webrtc-audio.service';

/**
 * Per-Participant Recording
 *
 * Represents a single participant's microphone recording
 */
export interface ParticipantRecording {
  userId: string;
  userName: string;
  sessionId: string;
  startServerTime: number;
  startLocalTime: number;
  duration: number;
  audioBlob: Blob;
  fileSize: number;
}

/**
 * Recording State for UI
 */
export interface RecordingState {
  isRecording: boolean;
  activeRecordings: Map<string, {
    userId: string;
    userName: string;
    duration: number;
    estimatedSize: number;
  }>;
}

/**
 * Participant Recording Service
 *
 * Records individual participant microphones during jam sessions.
 * Each participant (including local user) gets their own recording track.
 * When playback stops, recordings are converted to aligned stems.
 *
 * Features:
 * - Individual microphone recording per participant
 * - Timestamp-based alignment with playback stems
 * - Auto-stop at playback end
 * - Convert recordings to stems with participant names
 */
@Injectable({
  providedIn: 'root',
})
export class ParticipantRecordingService {
  private readonly MAX_DURATION_MS = 10 * 60 * 1000; // 10 minutes

  // Map of userId -> MediaRecorder
  private recorders: Map<string, MediaRecorder> = new Map();

  // Map of userId -> audio chunks
  private audioChunks: Map<string, Blob[]> = new Map();

  // Map of userId -> recording metadata
  private recordingMetadata: Map<string, Partial<ParticipantRecording>> = new Map();

  // Completed recordings ready to be converted to stems
  private completedRecordings: ParticipantRecording[] = [];

  // Recording state observable
  private recordingStateSubject = new Subject<RecordingState>();
  public recordingState$ = this.recordingStateSubject.asObservable();

  // Observable for completed recordings
  private recordingsCompletedSubject = new Subject<ParticipantRecording[]>();
  public recordingsCompleted$ = this.recordingsCompletedSubject.asObservable();

  // Timers
  private durationInterval: any = null;

  constructor(private zone: NgZone) {}

  /**
   * Start recording all participant microphones
   *
   * @param sessionId - Jam session ID
   * @param serverStartTime - Server timestamp when recording started
   * @param localStream - Local user's microphone stream
   * @param localUserId - Local user ID
   * @param localUserName - Local user name
   * @param remoteStreams - Remote participants' streams
   */
  async startRecording(
    sessionId: string,
    serverStartTime: number,
    localStream: MediaStream | null,
    localUserId: string,
    localUserName: string,
    remoteStreams: Map<string, ParticipantAudioStream>,
  ): Promise<void> {
    // Stop any existing recordings
    if (this.recorders.size > 0) {
      console.log('[ParticipantRecording] Stopping existing recordings');
      this.stopRecording();
    }

    const startLocalTime = Date.now();

    console.log('[ParticipantRecording] Starting recordings:', {
      hasLocalStream: !!localStream,
      localStreamTracks: localStream?.getTracks().map(t => ({
        kind: t.kind,
        enabled: t.enabled,
        muted: t.muted,
        readyState: t.readyState,
      })),
      remoteStreamCount: remoteStreams.size,
    });

    // Record local microphone
    if (localStream) {
      await this.startParticipantRecording(
        localUserId,
        localUserName,
        sessionId,
        serverStartTime,
        startLocalTime,
        localStream,
      );
    } else {
      console.warn('[ParticipantRecording] No local stream provided - local microphone will not be recorded');
    }

    // Record each remote participant
    for (const [userId, participantStream] of remoteStreams) {
      await this.startParticipantRecording(
        userId,
        participantStream.userName,
        sessionId,
        serverStartTime,
        startLocalTime,
        participantStream.stream,
      );
    }

    // Start duration tracking
    this.startDurationTracking();

    console.log('[ParticipantRecording] Started recording for', this.recorders.size, 'participants');

    if (this.recorders.size === 0) {
      console.error('[ParticipantRecording] WARNING: No recorders were started! Check microphone permissions and streams.');
    }
  }

  /**
   * Start recording for a single participant
   */
  private async startParticipantRecording(
    userId: string,
    userName: string,
    sessionId: string,
    serverStartTime: number,
    startLocalTime: number,
    stream: MediaStream,
  ): Promise<void> {
    try {
      console.log(`[ParticipantRecording] Setting up recorder for ${userName}:`, {
        streamId: stream.id,
        tracks: stream.getTracks().map(t => ({
          kind: t.kind,
          enabled: t.enabled,
          muted: t.muted,
          readyState: t.readyState,
        })),
      });

      // Check codec support
      const mimeType = this.getSupportedMimeType();
      if (!mimeType) {
        throw new Error('Browser does not support WebM/Opus recording');
      }

      // Create media recorder
      const options = {
        mimeType,
        audioBitsPerSecond: 128000, // 128 kbps
      };

      console.log(`[ParticipantRecording] Creating MediaRecorder for ${userName} with:`, {
        mimeType,
        audioBitsPerSecond: options.audioBitsPerSecond,
      });

      const recorder = new MediaRecorder(stream, options);
      this.recorders.set(userId, recorder);
      this.audioChunks.set(userId, []);

      // Store metadata
      this.recordingMetadata.set(userId, {
        userId,
        userName,
        sessionId,
        startServerTime: serverStartTime,
        startLocalTime,
      });

      // Handle data chunks
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          const chunks = this.audioChunks.get(userId) || [];
          chunks.push(event.data);
          this.audioChunks.set(userId, chunks);

          // Log first chunk to verify recording is working
          if (chunks.length === 1) {
            console.log(`[ParticipantRecording] First chunk received for ${userName}: ${event.data.size} bytes`);
          }
        }
      };

      // Handle recording stop
      recorder.onstop = () => {
        this.onParticipantRecordingStopped(userId);
      };

      // Start recording with timeslice to prevent clipping
      // Request data every 100ms to ensure smooth recording
      recorder.start(100);

      console.log(`[ParticipantRecording] Started recording for ${userName} (${userId})`);
    } catch (error) {
      console.error(`[ParticipantRecording] Failed to start recording for ${userName}:`, error);
    }
  }

  /**
   * Stop all recordings
   */
  stopRecording(): void {
    console.log('[ParticipantRecording] Stopping all recordings');

    // Stop all recorders
    for (const [userId, recorder] of this.recorders) {
      if (recorder.state === 'recording') {
        recorder.stop();
      }
    }

    // Stop duration tracking
    this.cleanup();
  }

  /**
   * Handle individual participant recording stopped
   */
  private onParticipantRecordingStopped(userId: string): void {
    const chunks = this.audioChunks.get(userId) || [];
    const metadata = this.recordingMetadata.get(userId);

    if (!metadata) {
      console.error(`[ParticipantRecording] No metadata for ${userId}`);
      return;
    }

    // Create blob
    const blob = new Blob(chunks, { type: 'audio/webm' });
    const duration = Math.floor((Date.now() - metadata.startLocalTime!) / 1000);

    // Create completed recording
    const recording: ParticipantRecording = {
      userId: metadata.userId!,
      userName: metadata.userName!,
      sessionId: metadata.sessionId!,
      startServerTime: metadata.startServerTime!,
      startLocalTime: metadata.startLocalTime!,
      duration,
      audioBlob: blob,
      fileSize: blob.size,
    };

    this.completedRecordings.push(recording);

    console.log(`[ParticipantRecording] Completed recording for ${metadata.userName}:`, {
      duration: `${duration}s`,
      size: `${(blob.size / 1024 / 1024).toFixed(2)} MB`,
    });

    // Clean up
    this.recorders.delete(userId);
    this.audioChunks.delete(userId);
    this.recordingMetadata.delete(userId);

    // If all recordings are done, emit completed event
    if (this.recorders.size === 0) {
      this.zone.run(() => {
        this.recordingsCompletedSubject.next(this.completedRecordings);
        this.completedRecordings = []; // Reset
      });
    }
  }

  /**
   * Start tracking duration for UI updates
   */
  private startDurationTracking(): void {
    this.durationInterval = setInterval(() => {
      const activeRecordings = new Map<string, {
        userId: string;
        userName: string;
        duration: number;
        estimatedSize: number;
      }>();

      for (const [userId, metadata] of this.recordingMetadata) {
        const duration = Math.floor((Date.now() - metadata.startLocalTime!) / 1000);
        const estimatedSize = duration * (128000 / 8); // 128 kbps

        activeRecordings.set(userId, {
          userId: metadata.userId!,
          userName: metadata.userName!,
          duration,
          estimatedSize,
        });
      }

      this.zone.run(() => {
        this.recordingStateSubject.next({
          isRecording: this.recorders.size > 0,
          activeRecordings,
        });
      });
    }, 1000);
  }

  /**
   * Cleanup timers
   */
  private cleanup(): void {
    if (this.durationInterval) {
      clearInterval(this.durationInterval);
      this.durationInterval = null;
    }
  }

  /**
   * Get supported MIME type
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
   * Check if currently recording
   */
  isRecording(): boolean {
    return this.recorders.size > 0;
  }

  /**
   * Download all completed recordings
   * (For debugging/testing - normally these would be converted to stems)
   */
  downloadRecordings(recordings: ParticipantRecording[]): void {
    for (const recording of recordings) {
      const timestamp = new Date(recording.startLocalTime).toISOString().replace(/[:.]/g, '-');
      const filename = `mic-${recording.userName}-${timestamp}.webm`;

      const url = URL.createObjectURL(recording.audioBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }
}
