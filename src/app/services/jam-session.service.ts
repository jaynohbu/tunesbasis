import { Injectable, NgZone } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

/* ================= TYPES ================= */

export interface JamSessionParticipant {
  userId: string;
  userName: string;
  joinedAt: number;
  recordingEnabled: boolean;
  syncOffset: number;
  lastHeartbeat: number;
}

export type JamSessionStatus = 'waiting' | 'playing' | 'paused' | 'stopped';

export interface JamSession {
  sessionId: string;
  groupId: string;
  sceneId: string;
  leaderId: string;
  status: JamSessionStatus;
  startTimestamp: number;
  currentPosition: number;
  lastUpdateTime: number;
  participants: JamSessionParticipant[];
  webrtcRoomId: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlaybackStartedEvent {
  startTimestamp: number;
  position: number;
  leaderId: string;
}

export interface PlaybackPausedEvent {
  pauseTimestamp: number;
  position: number;
}

export interface PlaybackSeekedEvent {
  position: number;
  timestamp: number;
}

export interface ParticipantJoinedEvent {
  userId: string;
  userName: string;
  timestamp: number;
}

/**
 * Jam Session Service
 *
 * Manages collaborative jam sessions via WebSocket connection.
 * Handles session creation, joining, playback control, and real-time state sync.
 */
@Injectable({
  providedIn: 'root',
})
export class JamSessionService {
  private socket: Socket | null = null;
  private currentSession: JamSession | null = null;

  // Observables for state and events
  private sessionStateSubject = new BehaviorSubject<JamSession | null>(null);
  public sessionState$: Observable<JamSession | null> =
    this.sessionStateSubject.asObservable();

  private playbackStartedSubject = new Subject<PlaybackStartedEvent>();
  public playbackStarted$: Observable<PlaybackStartedEvent> =
    this.playbackStartedSubject.asObservable();

  private playbackPausedSubject = new Subject<PlaybackPausedEvent>();
  public playbackPaused$: Observable<PlaybackPausedEvent> =
    this.playbackPausedSubject.asObservable();

  private playbackSeekedSubject = new Subject<PlaybackSeekedEvent>();
  public playbackSeeked$: Observable<PlaybackSeekedEvent> =
    this.playbackSeekedSubject.asObservable();

  private participantJoinedSubject = new Subject<ParticipantJoinedEvent>();
  public participantJoined$: Observable<ParticipantJoinedEvent> =
    this.participantJoinedSubject.asObservable();

  private heartbeatInterval: any = null;

  constructor(
    private zone: NgZone,
    private authService: AuthService,
  ) {}

  /* ============================================================
   * CONNECTION
   * ============================================================ */
  async connect(): Promise<void> {
    if (this.socket?.connected) {
      console.log('[JamSession] Already connected');
      return;
    }

    const token = await this.authService.getIdToken();
    if (!token) {
      throw new Error('No authentication token available');
    }

    return new Promise((resolve, reject) => {
      this.socket = io(`${environment.syncServerUrl}/jam-control`, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        auth: {
          token,
        },
      });

      this.socket.on('connect', () => {
        console.log('[JamSession] Connected to server');
        this.setupEventListeners();
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('[JamSession] Connection error:', error);
        reject(error);
      });

      this.socket.on('disconnect', (reason) => {
        console.log('[JamSession] Disconnected:', reason);
        this.stopHeartbeat();
      });
    });
  }

  disconnect(): void {
    this.stopHeartbeat();
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.currentSession = null;
    this.zone.run(() => {
      this.sessionStateSubject.next(null);
    });
  }

  /* ============================================================
   * EVENT LISTENERS
   * ============================================================ */
  private setupEventListeners(): void {
    if (!this.socket) return;

    // IMPORTANT: Remove all previous listeners to prevent duplicates
    this.socket.off('playback-started');
    this.socket.off('playback-paused');
    this.socket.off('playback-seeked');
    this.socket.off('participant-joined');

    this.socket.on('playback-started', (event: PlaybackStartedEvent) => {
      console.log('[JamSession] Playback started:', event);
      this.zone.run(() => {
        this.playbackStartedSubject.next(event);
      });
    });

    this.socket.on('playback-paused', (event: PlaybackPausedEvent) => {
      console.log('[JamSession] Playback paused:', event);
      this.zone.run(() => {
        this.playbackPausedSubject.next(event);
      });
    });

    this.socket.on('playback-seeked', (event: PlaybackSeekedEvent) => {
      console.log('[JamSession] Playback seeked:', event);
      this.zone.run(() => {
        this.playbackSeekedSubject.next(event);
      });
    });

    this.socket.on('participant-joined', (event: ParticipantJoinedEvent) => {
      console.log('[JamSession] Participant joined:', event);
      this.zone.run(() => {
        this.participantJoinedSubject.next(event);
      });
    });
  }

  /* ============================================================
   * SESSION MANAGEMENT
   * ============================================================ */
  async createSession(
    groupId: string,
    sceneId: string,
  ): Promise<JamSession> {
    if (!this.socket?.connected) {
      throw new Error('Socket not connected');
    }

    return new Promise((resolve, reject) => {
      this.socket!.emit(
        'create-session',
        { groupId, sceneId },
        (response: { success: boolean; session?: JamSession; error?: string }) => {
          if (response.success && response.session) {
            this.currentSession = response.session;
            this.zone.run(() => {
              this.sessionStateSubject.next(response.session!);
            });
            this.startHeartbeat(response.session.sessionId);
            resolve(response.session);
          } else {
            reject(new Error(response.error || 'Failed to create session'));
          }
        },
      );
    });
  }

  async joinSession(sessionId: string): Promise<JamSession> {
    if (!this.socket?.connected) {
      throw new Error('Socket not connected');
    }

    return new Promise((resolve, reject) => {
      this.socket!.emit(
        'join-session',
        { sessionId },
        (response: { success: boolean; session?: JamSession; error?: string }) => {
          if (response.success && response.session) {
            this.currentSession = response.session;
            this.zone.run(() => {
              this.sessionStateSubject.next(response.session!);
            });
            this.startHeartbeat(sessionId);
            resolve(response.session);
          } else {
            reject(new Error(response.error || 'Failed to join session'));
          }
        },
      );
    });
  }

  /* ============================================================
   * PLAYBACK CONTROL
   * ============================================================ */
  async startPlayback(position: number): Promise<number> {
    if (!this.socket?.connected) {
      throw new Error('Socket not connected');
    }

    if (!this.currentSession) {
      throw new Error('No active session');
    }

    return new Promise((resolve, reject) => {
      this.socket!.emit(
        'start-playback',
        { sessionId: this.currentSession!.sessionId, position },
        (response: { success: boolean; startTimestamp?: number; error?: string }) => {
          if (response.success && response.startTimestamp !== undefined) {
            resolve(response.startTimestamp);
          } else {
            reject(new Error(response.error || 'Failed to start playback'));
          }
        },
      );
    });
  }

  async pausePlayback(position: number): Promise<void> {
    if (!this.socket?.connected) {
      throw new Error('Socket not connected');
    }

    if (!this.currentSession) {
      throw new Error('No active session');
    }

    return new Promise((resolve, reject) => {
      this.socket!.emit(
        'pause-playback',
        { sessionId: this.currentSession!.sessionId, position },
        (response: { success: boolean; error?: string }) => {
          if (response.success) {
            resolve();
          } else {
            reject(new Error(response.error || 'Failed to pause playback'));
          }
        },
      );
    });
  }

  async seek(position: number): Promise<void> {
    if (!this.socket?.connected) {
      throw new Error('Socket not connected');
    }

    if (!this.currentSession) {
      throw new Error('No active session');
    }

    return new Promise((resolve, reject) => {
      this.socket!.emit(
        'seek',
        { sessionId: this.currentSession!.sessionId, position },
        (response: { success: boolean; error?: string }) => {
          if (response.success) {
            resolve();
          } else {
            reject(new Error(response.error || 'Failed to seek'));
          }
        },
      );
    });
  }

  /* ============================================================
   * HEARTBEAT
   * ============================================================ */
  private startHeartbeat(sessionId: string): void {
    this.stopHeartbeat();

    this.heartbeatInterval = setInterval(() => {
      if (this.socket?.connected) {
        this.socket.emit('heartbeat', { sessionId });
      }
    }, 5000); // Every 5 seconds
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /* ============================================================
   * GETTERS
   * ============================================================ */
  getCurrentSession(): JamSession | null {
    return this.currentSession;
  }

  async isLeader(): Promise<boolean> {
    if (!this.currentSession) return false;
    const userId = await this.authService.getCurrentUserId();
    return this.currentSession.leaderId === userId;
  }

  /**
   * Calculate current playback position for late joins
   * If session is playing, calculate position based on server time
   */
  calculateCurrentPosition(serverTime: number): number {
    if (!this.currentSession || this.currentSession.status !== 'playing') {
      return this.currentSession?.currentPosition || 0;
    }

    const elapsedMs = serverTime - this.currentSession.startTimestamp;
    const elapsedSec = elapsedMs / 1000;

    return this.currentSession.currentPosition + elapsedSec;
  }

  /**
   * Get socket for WebRTC signaling
   */
  getSocket(): Socket | null {
    return this.socket;
  }
}
