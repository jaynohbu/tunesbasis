import { Component, OnInit, OnDestroy, Input, Output, EventEmitter } from '@angular/core';
import { Subscription } from 'rxjs';
import { JamSessionService, JamSession } from 'src/app/services/jam-session.service';
import { ClockSyncService } from 'src/app/services/clock-sync.service';
import { SynchronizedPlayerService } from 'src/app/services/synchronized-player.service';
import { RecordingService, RecordingQuality } from 'src/app/services/recording.service';
import { WebRTCAudioService, ParticipantAudioStream } from 'src/app/services/webrtc-audio.service';
import { ParticipantRecordingService, ParticipantRecording } from 'src/app/services/participant-recording.service';
import { RecordingToStemService, RecordedStem } from 'src/app/services/recording-to-stem.service';
import { MusicPlayerEngine } from 'src/app/pages/music-player/music-player.engine';
import { MessageService } from 'primeng/api';
import { AuthService } from 'src/app/services/auth.service';

/**
 * Jam Session Component
 *
 * UI for collaborative jam sessions. Handles:
 * - Session creation and joining
 * - Leader playback controls
 * - Follower sync status
 * - Participant list
 * - Connection monitoring
 */
@Component({
  selector: 'app-jam-session',
  templateUrl: './jam-session.component.html',
  styleUrls: ['./jam-session.component.scss'],
})
export class JamSessionComponent implements OnInit, OnDestroy {
  @Input() groupId!: string;
  @Input() sceneId!: string;
  @Input() playerEngine!: MusicPlayerEngine;

  @Output() recordedStemsReady = new EventEmitter<RecordedStem[]>();
  @Output() playbackStateChanged = new EventEmitter<boolean>();
  @Output() clearRecordedStems = new EventEmitter<void>();

  /* ================= STATE ================= */
  session: JamSession | null = null;
  isLeader = false;
  connecting = false;
  error: string | null = null;
  syncStatus = 'Not Connected';
  clockOffset = 0;
  clockRtt = 0;

  /* ================= RECORDING STATE ================= */
  isRecording = false;
  recordingDuration = '0:00';
  recordingProgress = 0;
  estimatedSizeMB = 0;
  recordingQuality = RecordingQuality.HIGH;
  RecordingQuality = RecordingQuality; // For template access

  /* ================= WEBRTC STATE ================= */
  isMicrophoneEnabled = false;
  remoteStreams = new Map<string, ParticipantAudioStream>();

  /* ================= PARTICIPANT RECORDING STATE ================= */
  isRecordingParticipants = false;
  recordingParticipantCount = 0;

  /* ================= SUBSCRIPTIONS ================= */
  private subscriptions: Subscription[] = [];
  private playbackStartServerTime: number = 0;

  constructor(
    private jamSessionService: JamSessionService,
    private clockSyncService: ClockSyncService,
    private synchronizedPlayerService: SynchronizedPlayerService,
    private recordingService: RecordingService,
    private webrtcAudioService: WebRTCAudioService,
    private participantRecordingService: ParticipantRecordingService,
    private recordingToStemService: RecordingToStemService,
    private authService: AuthService,
    private messageService: MessageService,
  ) {}

  async ngOnInit(): Promise<void> {
    // Subscribe to clock sync status
    const clockSub = this.clockSyncService.syncStatus$.subscribe((status) => {
      this.clockOffset = status.offset;
      this.clockRtt = status.rtt;

      if (status.synced) {
        if (Math.abs(status.offset) > 50 || status.rtt > 100) {
          this.syncStatus = 'Poor Sync';
        } else {
          this.syncStatus = 'Synced';
        }
      } else {
        this.syncStatus = 'Not Synced';
      }
    });

    // Subscribe to session state
    const sessionSub = this.jamSessionService.sessionState$.subscribe(
      async (session) => {
        this.session = session;
        this.isLeader = await this.jamSessionService.isLeader();
      },
    );

    // Subscribe to playback events
    const playbackStartedSub =
      this.jamSessionService.playbackStarted$.subscribe(async (event) => {
        console.log('[JamSession] Received playback-started event:', event);

        if (!this.isLeader) {
          // Follower: start recording participant microphones
          await this.startParticipantRecording(event.startTimestamp);

          // Follower: schedule synchronized playback
          this.synchronizedPlayerService.schedulePlay(
            this.playerEngine,
            event.startTimestamp,
            event.position,
            false,
          );

          // Emit playback state change
          this.playbackStateChanged.emit(true);

          this.messageService.add({
            severity: 'info',
            summary: 'Playback Started',
            detail: `Leader started playback at ${event.position.toFixed(1)}s`,
            life: 3000,
          });
        }
      });

    const playbackPausedSub =
      this.jamSessionService.playbackPaused$.subscribe((event) => {
        console.log('[JamSession] Received playback-paused event:', event);

        if (!this.isLeader) {
          // Follower: stop participant recording
          this.stopParticipantRecording();

          // Follower: schedule synchronized pause
          this.synchronizedPlayerService.schedulePause(
            this.playerEngine,
            event.pauseTimestamp,
          );

          // Emit playback state change
          this.playbackStateChanged.emit(false);

          this.messageService.add({
            severity: 'info',
            summary: 'Playback Paused',
            detail: `Leader paused at ${event.position.toFixed(1)}s`,
            life: 3000,
          });
        }
      });

    const playbackSeekedSub =
      this.jamSessionService.playbackSeeked$.subscribe((event) => {
        console.log('[JamSession] Received playback-seeked event:', event);

        if (!this.isLeader) {
          // Follower: schedule synchronized seek
          this.synchronizedPlayerService.scheduleSeek(
            this.playerEngine,
            event.timestamp,
            event.position,
          );

          this.messageService.add({
            severity: 'info',
            summary: 'Position Changed',
            detail: `Leader seeked to ${event.position.toFixed(1)}s`,
            life: 3000,
          });
        }
      });

    const participantJoinedSub =
      this.jamSessionService.participantJoined$.subscribe((event) => {
        console.log('[JamSession] Participant joined:', event);

        this.messageService.add({
          severity: 'success',
          summary: 'Participant Joined',
          detail: `${event.userName} joined the session`,
          life: 3000,
        });
      });

    // Subscribe to recording state
    const recordingSub = this.recordingService.recordingState$.subscribe(
      (state) => {
        this.isRecording = state.isRecording;
        this.recordingDuration = this.recordingService.formatDuration(
          state.duration,
        );
        this.recordingProgress = (state.duration / 600) * 100; // 600s = 10min
        this.estimatedSizeMB = state.estimatedSize / 1024 / 1024;
      },
    );

    // Subscribe to recording warnings
    const recordingWarnSub = this.recordingService.warning$.subscribe(
      (warning) => {
        this.messageService.add({
          severity: 'warn',
          summary: 'Recording Warning',
          detail: warning,
          life: 5000,
        });
      },
    );

    // Subscribe to WebRTC remote streams
    const remoteStreamsSub = this.webrtcAudioService.remoteStreams$.subscribe(
      (streams) => {
        this.remoteStreams = streams;
        console.log('[JamSession] Remote streams updated:', streams.size);
      },
    );

    // Subscribe to participant recording completion
    const participantRecordingsSub = this.participantRecordingService.recordingsCompleted$.subscribe(
      async (recordings) => {
        await this.onParticipantRecordingsCompleted(recordings);
      },
    );

    // Subscribe to participant recording state
    const participantRecordingStateSub = this.participantRecordingService.recordingState$.subscribe(
      (state) => {
        this.isRecordingParticipants = state.isRecording;
        this.recordingParticipantCount = state.activeRecordings.size;
      },
    );

    this.subscriptions.push(
      clockSub,
      sessionSub,
      playbackStartedSub,
      playbackPausedSub,
      playbackSeekedSub,
      participantJoinedSub,
      recordingSub,
      recordingWarnSub,
      remoteStreamsSub,
      participantRecordingsSub,
      participantRecordingStateSub,
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
    this.synchronizedPlayerService.cancelScheduledPlay();

    // Stop recording if active
    if (this.isRecording) {
      this.recordingService.stopRecording();
    }

    // Stop WebRTC if active
    if (this.isMicrophoneEnabled) {
      this.webrtcAudioService.stopBroadcasting();
    }
  }

  /* ============================================================
   * SESSION MANAGEMENT
   * ============================================================ */
  async onStartJamming(): Promise<void> {
    this.connecting = true;
    this.error = null;

    try {
      // Step 1: Connect to clock sync
      console.log('[JamSession] Connecting to clock sync...');
      await this.clockSyncService.connect();

      // Step 2: Connect to jam session server
      console.log('[JamSession] Connecting to jam session server...');
      await this.jamSessionService.connect();

      // Step 3: Create session
      console.log('[JamSession] Creating session...');
      const session = await this.jamSessionService.createSession(
        this.groupId,
        this.sceneId,
      );

      console.log('[JamSession] Session created:', session);

      this.messageService.add({
        severity: 'success',
        summary: 'Jam Session Started',
        detail: 'You are the session leader',
        life: 5000,
      });
    } catch (error: any) {
      console.error('[JamSession] Failed to start jamming:', error);
      this.error = error.message || 'Failed to start jam session';

      this.messageService.add({
        severity: 'error',
        summary: 'Connection Failed',
        detail: this.error || 'Unknown error',
        life: 5000,
      });
    } finally {
      this.connecting = false;
    }
  }

  async onJoinSession(sessionId: string): Promise<void> {
    this.connecting = true;
    this.error = null;

    try {
      // Step 1: Connect to clock sync
      await this.clockSyncService.connect();

      // Step 2: Connect to jam session server
      await this.jamSessionService.connect();

      // Step 3: Join session
      const session = await this.jamSessionService.joinSession(sessionId);

      console.log('[JamSession] Joined session:', session);

      this.messageService.add({
        severity: 'success',
        summary: 'Joined Session',
        detail: `Joined ${session.sessionId}`,
        life: 5000,
      });
    } catch (error: any) {
      console.error('[JamSession] Failed to join session:', error);
      this.error = error.message || 'Failed to join session';

      this.messageService.add({
        severity: 'error',
        summary: 'Join Failed',
        detail: this.error || 'Unknown error',
        life: 5000,
      });
    } finally {
      this.connecting = false;
    }
  }

  onLeaveSession(): void {
    this.jamSessionService.disconnect();
    this.clockSyncService.disconnect();
    this.synchronizedPlayerService.cancelScheduledPlay();

    this.messageService.add({
      severity: 'info',
      summary: 'Left Session',
      detail: 'Disconnected from jam session',
      life: 3000,
    });
  }

  /* ============================================================
   * PLAYBACK CONTROL (LEADER ONLY)
   * ============================================================ */
  async onPlayClicked(): Promise<void> {
    if (!this.isLeader || !this.session) return;

    try {
      // Clear any recorded stems from previous session
      this.clearRecordedStems.emit();

      // Ensure socket is connected before starting playback
      const socket = this.jamSessionService.getSocket();
      if (!socket || !socket.connected) {
        console.log('[JamSession] Socket not connected, reconnecting...');
        await this.jamSessionService.connect();
      }

      const currentPosition = this.playerEngine.getCurrentTime();

      // Request playback start from server (returns server timestamp)
      const serverStartTime = await this.jamSessionService.startPlayback(
        currentPosition,
      );

      // Start recording participant microphones
      await this.startParticipantRecording(serverStartTime);

      // Leader plays immediately with scheduled timing
      this.synchronizedPlayerService.schedulePlay(
        this.playerEngine,
        serverStartTime,
        currentPosition,
        true,
      );

      // Emit playback state change
      this.playbackStateChanged.emit(true);

      console.log('[JamSession] Leader started playback:', {
        serverStartTime,
        currentPosition,
      });
    } catch (error: any) {
      console.error('[JamSession] Failed to start playback:', error);

      this.messageService.add({
        severity: 'error',
        summary: 'Playback Failed',
        detail: error.message,
        life: 3000,
      });
    }
  }

  async onPauseClicked(): Promise<void> {
    if (!this.isLeader || !this.session) return;

    try {
      const currentPosition = this.playerEngine.getCurrentTime();

      await this.jamSessionService.pausePlayback(currentPosition);

      // Stop participant recording
      this.stopParticipantRecording();

      // Leader pauses immediately
      this.playerEngine.pause();

      // Emit playback state change
      this.playbackStateChanged.emit(false);

      console.log('[JamSession] Leader paused playback');
    } catch (error: any) {
      console.error('[JamSession] Failed to pause playback:', error);

      this.messageService.add({
        severity: 'error',
        summary: 'Pause Failed',
        detail: error.message,
        life: 3000,
      });
    }
  }

  async onRestartClicked(): Promise<void> {
    if (!this.isLeader || !this.session) return;

    try {
      // Pause if currently playing
      if (this.playerEngine.isPlaying()) {
        await this.onPauseClicked();
      }

      // Clear recorded stems
      this.clearRecordedStems.emit();

      // Seek to beginning
      this.playerEngine.seek(0);

      console.log('[JamSession] Restarted - cleared recordings and reset to beginning');

      this.messageService.add({
        severity: 'info',
        summary: 'Restarted',
        detail: 'Playback reset, recordings cleared',
        life: 3000,
      });
    } catch (error: any) {
      console.error('[JamSession] Failed to restart:', error);

      this.messageService.add({
        severity: 'error',
        summary: 'Restart Failed',
        detail: error.message,
        life: 3000,
      });
    }
  }

  /* ============================================================
   * COMBINED PLAY & RECORD
   * ============================================================ */
  async onPlayAndRecordClicked(): Promise<void> {
    // Start playback first
    await this.onPlayClicked();

    // Small delay to ensure playback started
    setTimeout(async () => {
      // Then start recording
      await this.onStartRecording();
    }, 100);
  }

  /* ============================================================
   * RECORDING CONTROL
   * ============================================================ */
  async onStartRecording(): Promise<void> {
    if (!this.session) {
      this.messageService.add({
        severity: 'error',
        summary: 'Cannot Record',
        detail: 'No active jam session',
        life: 3000,
      });
      return;
    }

    try {
      const userId = await this.authService.getCurrentUserId();
      const userName = this.authService.currentUserValue?.email || 'Unknown';
      const serverTime = this.clockSyncService.getServerTime();

      await this.recordingService.startRecording(
        this.playerEngine.getAudioContext(),
        this.playerEngine.getMasterGainNode(),
        this.session.sessionId,
        userId,
        userName,
        serverTime,
        this.recordingQuality,
      );

      this.messageService.add({
        severity: 'success',
        summary: 'Recording Started',
        detail: 'Max 10 minutes (~10 MB)',
        life: 3000,
      });
    } catch (error: any) {
      console.error('[JamSession] Failed to start recording:', error);

      this.messageService.add({
        severity: 'error',
        summary: 'Recording Failed',
        detail: error.message || 'Unknown error',
        life: 5000,
      });
    }
  }

  onStopRecording(): void {
    this.recordingService.stopRecording();

    this.messageService.add({
      severity: 'info',
      summary: 'Recording Stopped',
      detail: 'File downloaded to your computer',
      life: 3000,
    });
  }

  /* ============================================================
   * GETTERS
   * ============================================================ */
  getSyncStatusColor(): string {
    if (this.syncStatus === 'Synced') return 'green';
    if (this.syncStatus === 'Poor Sync') return 'orange';
    return 'gray';
  }

  getParticipantCount(): number {
    return this.session?.participants.length || 0;
  }

  isPlaying(): boolean {
    return this.playerEngine?.isPlaying() || false;
  }

  /**
   * Should show restart button: only when paused AND position > 0
   */
  shouldShowRestart(): boolean {
    if (!this.playerEngine || this.isPlaying()) {
      return false;
    }
    const currentTime = this.playerEngine.getCurrentTime();
    return currentTime > 0;
  }

  /* ============================================================
   * WEBRTC MICROPHONE CONTROL
   * ============================================================ */
  async toggleMicrophone(): Promise<void> {
    if (!this.session) {
      this.messageService.add({
        severity: 'error',
        summary: 'Cannot Enable Microphone',
        detail: 'No active jam session',
        life: 3000,
      });
      return;
    }

    try {
      if (this.isMicrophoneEnabled) {
        // Stop broadcasting
        this.webrtcAudioService.stopBroadcasting();
        this.isMicrophoneEnabled = false;

        this.messageService.add({
          severity: 'info',
          summary: 'Microphone Disabled',
          detail: 'Other participants cannot hear you',
          life: 3000,
        });
      } else {
        // Start broadcasting
        const socket = this.jamSessionService.getSocket();
        if (!socket) {
          throw new Error('Not connected to jam session');
        }

        await this.webrtcAudioService.startBroadcasting(
          socket,
          this.session.sessionId,
          this.playerEngine.getAudioContext(),
        );

        this.isMicrophoneEnabled = true;

        this.messageService.add({
          severity: 'success',
          summary: 'Microphone Enabled',
          detail: 'Other participants can now hear you',
          life: 3000,
        });
      }
    } catch (error: any) {
      console.error('[JamSession] Failed to toggle microphone:', error);

      this.messageService.add({
        severity: 'error',
        summary: 'Microphone Error',
        detail: error.message || 'Unknown error',
        life: 5000,
      });
    }
  }

  getRemoteStreamsArray(): ParticipantAudioStream[] {
    return Array.from(this.remoteStreams.values());
  }

  async testMicrophone(): Promise<void> {
    try {
      console.log('[JamSession] Testing microphone access...');

      // Check if mediaDevices is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Browser does not support audio input');
      }

      // List available devices
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(d => d.kind === 'audioinput');

      console.log('[JamSession] Available audio inputs:', audioInputs.map(d => ({
        deviceId: d.deviceId,
        label: d.label || '(unlabeled)',
        groupId: d.groupId,
      })));

      // Try to get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      console.log('[JamSession] Microphone test successful:', {
        id: stream.id,
        tracks: stream.getAudioTracks().map(t => ({
          label: t.label,
          enabled: t.enabled,
          muted: t.muted,
          settings: t.getSettings(),
        })),
      });

      // Stop the test stream
      stream.getTracks().forEach(track => track.stop());

      this.messageService.add({
        severity: 'success',
        summary: 'Microphone Test Passed',
        detail: `Found ${audioInputs.length} audio input(s). Microphone is working!`,
        life: 5000,
      });
    } catch (error: any) {
      console.error('[JamSession] Microphone test failed:', error);

      let errorDetail = 'Unknown error';
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        errorDetail = 'Permission denied. Check browser settings.';
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        errorDetail = 'No microphone found. Please connect a microphone.';
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        errorDetail = 'Microphone is in use by another application.';
      } else {
        errorDetail = error.message;
      }

      this.messageService.add({
        severity: 'error',
        summary: 'Microphone Test Failed',
        detail: errorDetail,
        life: 10000,
      });
    }
  }

  /* ============================================================
   * PARTICIPANT RECORDING (MICROPHONES AS STEMS)
   * ============================================================ */
  async startParticipantRecording(serverStartTime: number): Promise<void> {
    if (!this.session) return;

    try {
      const userId = await this.authService.getCurrentUserId();
      const userName = this.authService.currentUserValue?.email || 'You';

      // Get local stream if microphone is enabled
      const localStream = this.isMicrophoneEnabled ? this.webrtcAudioService.getLocalStream() : null;

      console.log('[JamSession] Starting participant recording:', {
        isMicrophoneEnabled: this.isMicrophoneEnabled,
        hasLocalStream: !!localStream,
        remoteStreamCount: this.remoteStreams.size,
      });

      // Start recording all participant microphones
      await this.participantRecordingService.startRecording(
        this.session.sessionId,
        serverStartTime,
        localStream,
        userId,
        userName,
        this.remoteStreams,
      );

      this.playbackStartServerTime = serverStartTime;

      const participantCount = (this.isMicrophoneEnabled ? 1 : 0) + this.remoteStreams.size;

      this.messageService.add({
        severity: 'info',
        summary: 'Recording Microphones',
        detail: `Recording ${participantCount} participant${participantCount > 1 ? 's' : ''}`,
        life: 3000,
      });
    } catch (error: any) {
      console.error('[JamSession] Failed to start participant recording:', error);
    }
  }

  stopParticipantRecording(): void {
    if (this.participantRecordingService.isRecording()) {
      this.participantRecordingService.stopRecording();
    }
  }

  async onParticipantRecordingsCompleted(recordings: ParticipantRecording[]): Promise<void> {
    if (recordings.length === 0) return;

    console.log('[JamSession] Converting', recordings.length, 'participant recordings to stems');

    try {
      // Convert recordings to aligned stems
      const stems = await this.recordingToStemService.convertRecordingsToStems(
        recordings,
        this.playbackStartServerTime,
        this.playerEngine.getAudioContext(),
      );

      console.log('[JamSession] Created', stems.length, 'recorded stems');

      // Emit to parent (music player)
      this.recordedStemsReady.emit(stems);

      this.messageService.add({
        severity: 'success',
        summary: 'Mic Recordings Ready',
        detail: `${stems.length} microphone track${stems.length > 1 ? 's' : ''} added as stems`,
        life: 5000,
      });
    } catch (error: any) {
      console.error('[JamSession] Failed to convert recordings to stems:', error);

      this.messageService.add({
        severity: 'error',
        summary: 'Recording Conversion Failed',
        detail: error.message || 'Unknown error',
        life: 5000,
      });
    }
  }
}
