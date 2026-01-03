import { Injectable, NgZone } from '@angular/core';
import { Subject } from 'rxjs';
import { Socket } from 'socket.io-client';

/**
 * Participant Audio Stream
 */
export interface ParticipantAudioStream {
  userId: string;
  userName: string;
  stream: MediaStream;
  audioElement: HTMLAudioElement;
  analyser: AnalyserNode;
  dataArray: Uint8Array;
}

/**
 * WebRTC Audio Service
 *
 * Handles peer-to-peer audio streaming for live instruments/vocals.
 * Uses mesh topology (each peer connects to every other peer).
 */
@Injectable({
  providedIn: 'root',
})
export class WebRTCAudioService {
  private localStream: MediaStream | null = null;
  private localAnalyser: AnalyserNode | null = null;
  private localDataArray: Uint8Array | null = null;
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private remoteStreams: Map<string, ParticipantAudioStream> = new Map();
  private socket: Socket | null = null;
  private sessionId: string | null = null;
  private audioContext: AudioContext | null = null;

  // ICE server configuration (using free STUN servers)
  private readonly iceServers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  };

  // Observable for remote stream updates
  private remoteStreamsSubject = new Subject<Map<string, ParticipantAudioStream>>();
  public remoteStreams$ = this.remoteStreamsSubject.asObservable();

  constructor(private zone: NgZone) {}

  /**
   * Initialize WebRTC and start broadcasting audio
   */
  async startBroadcasting(
    socket: Socket,
    sessionId: string,
    audioContext: AudioContext,
  ): Promise<void> {
    this.socket = socket;
    this.sessionId = sessionId;
    this.audioContext = audioContext;

    // Get user's microphone/audio input
    try {
      console.log('[WebRTC] Requesting microphone access...');

      // Check if mediaDevices is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Browser does not support audio input');
      }

      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      console.log('[WebRTC] Local stream acquired:', {
        id: this.localStream.id,
        tracks: this.localStream.getAudioTracks().map(t => ({
          label: t.label,
          enabled: t.enabled,
          muted: t.muted,
        })),
      });

      // Create analyser for local stream waveform visualization
      this.localAnalyser = this.audioContext.createAnalyser();
      this.localAnalyser.fftSize = 2048;
      this.localAnalyser.smoothingTimeConstant = 0.8;
      const bufferLength = this.localAnalyser.frequencyBinCount;
      this.localDataArray = new Uint8Array(bufferLength);

      // Connect local stream to analyser
      const source = this.audioContext.createMediaStreamSource(this.localStream);
      source.connect(this.localAnalyser);

      console.log('[WebRTC] Local analyser created and connected');

      // Set up WebRTC signaling listeners
      this.setupSignalingListeners();

      // Notify other participants that we're ready
      this.socket.emit('webrtc-ready', { sessionId });
    } catch (error: any) {
      console.error('[WebRTC] Failed to get user media:', error);

      // Provide specific error message based on error type
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        throw new Error('Microphone access denied. Please allow microphone access in your browser settings.');
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        throw new Error('No microphone found. Please connect a microphone and try again.');
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        throw new Error('Microphone is already in use by another application.');
      } else {
        throw new Error(error.message || 'Microphone access failed');
      }
    }
  }

  /**
   * Stop broadcasting and close all connections
   */
  stopBroadcasting(): void {
    console.log('[WebRTC] Stopping broadcast');

    // Stop local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    // Clean up local analyser
    this.localAnalyser = null;
    this.localDataArray = null;

    // Close all peer connections
    this.peerConnections.forEach((pc) => pc.close());
    this.peerConnections.clear();

    // Clean up remote streams
    this.remoteStreams.forEach((stream) => {
      stream.audioElement.pause();
      stream.audioElement.srcObject = null;
    });
    this.remoteStreams.clear();

    this.zone.run(() => {
      this.remoteStreamsSubject.next(this.remoteStreams);
    });
  }

  /**
   * Set up WebRTC signaling listeners
   */
  private setupSignalingListeners(): void {
    if (!this.socket) return;

    // Another peer is ready - initiate connection as offerer
    this.socket.on('webrtc-peer-ready', async (data: { userId: string; userName: string }) => {
      console.log('[WebRTC] Peer ready:', data.userId);
      await this.createPeerConnection(data.userId, data.userName, true);
    });

    // Received offer from peer
    this.socket.on('webrtc-offer', async (data: { from: string; userName: string; offer: RTCSessionDescriptionInit }) => {
      console.log('[WebRTC] Received offer from:', data.from);
      await this.handleOffer(data.from, data.userName, data.offer);
    });

    // Received answer from peer
    this.socket.on('webrtc-answer', async (data: { from: string; answer: RTCSessionDescriptionInit }) => {
      console.log('[WebRTC] Received answer from:', data.from);
      await this.handleAnswer(data.from, data.answer);
    });

    // Received ICE candidate
    this.socket.on('webrtc-ice-candidate', async (data: { from: string; candidate: RTCIceCandidateInit }) => {
      console.log('[WebRTC] Received ICE candidate from:', data.from);
      await this.handleIceCandidate(data.from, data.candidate);
    });

    // Peer disconnected
    this.socket.on('webrtc-peer-disconnected', (data: { userId: string }) => {
      console.log('[WebRTC] Peer disconnected:', data.userId);
      this.removePeerConnection(data.userId);
    });
  }

  /**
   * Create peer connection (as offerer or answerer)
   */
  private async createPeerConnection(
    userId: string,
    userName: string,
    isOfferer: boolean,
  ): Promise<void> {
    if (this.peerConnections.has(userId)) {
      console.log('[WebRTC] Connection already exists for:', userId);
      return;
    }

    const pc = new RTCPeerConnection(this.iceServers);
    this.peerConnections.set(userId, pc);

    // Add local stream tracks to connection
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    }

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && this.socket) {
        this.socket.emit('webrtc-ice-candidate', {
          sessionId: this.sessionId,
          to: userId,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    // Handle incoming tracks
    pc.ontrack = (event) => {
      console.log('[WebRTC] Received remote track from:', userId);
      this.handleRemoteTrack(userId, userName, event.streams[0]);
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log('[WebRTC] Connection state with', userId, ':', pc.connectionState);
    };

    // If we're the offerer, create and send offer
    if (isOfferer) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      if (this.socket) {
        this.socket.emit('webrtc-offer', {
          sessionId: this.sessionId,
          to: userId,
          offer: pc.localDescription!.toJSON(),
        });
      }
    }
  }

  /**
   * Handle incoming offer
   */
  private async handleOffer(
    userId: string,
    userName: string,
    offer: RTCSessionDescriptionInit,
  ): Promise<void> {
    await this.createPeerConnection(userId, userName, false);

    const pc = this.peerConnections.get(userId);
    if (!pc) return;

    await pc.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    if (this.socket) {
      this.socket.emit('webrtc-answer', {
        sessionId: this.sessionId,
        to: userId,
        answer: pc.localDescription!.toJSON(),
      });
    }
  }

  /**
   * Handle incoming answer
   */
  private async handleAnswer(userId: string, answer: RTCSessionDescriptionInit): Promise<void> {
    const pc = this.peerConnections.get(userId);
    if (!pc) return;

    await pc.setRemoteDescription(new RTCSessionDescription(answer));
  }

  /**
   * Handle incoming ICE candidate
   */
  private async handleIceCandidate(userId: string, candidate: RTCIceCandidateInit): Promise<void> {
    const pc = this.peerConnections.get(userId);
    if (!pc) return;

    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  }

  /**
   * Handle remote track/stream
   */
  private handleRemoteTrack(userId: string, userName: string, stream: MediaStream): void {
    if (!this.audioContext) return;

    // Create audio element for playback
    const audioElement = new Audio();
    audioElement.srcObject = stream;
    audioElement.play().catch((err) => console.error('[WebRTC] Playback failed:', err));

    // Create analyser for waveform visualization
    const analyser = this.audioContext.createAnalyser();
    analyser.fftSize = 2048;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    // Connect stream to analyser
    const source = this.audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    // Store participant stream
    const participantStream: ParticipantAudioStream = {
      userId,
      userName,
      stream,
      audioElement,
      analyser,
      dataArray,
    };

    this.remoteStreams.set(userId, participantStream);

    // Notify subscribers
    this.zone.run(() => {
      this.remoteStreamsSubject.next(this.remoteStreams);
    });
  }

  /**
   * Remove peer connection
   */
  private removePeerConnection(userId: string): void {
    const pc = this.peerConnections.get(userId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(userId);
    }

    const stream = this.remoteStreams.get(userId);
    if (stream) {
      stream.audioElement.pause();
      stream.audioElement.srcObject = null;
      this.remoteStreams.delete(userId);

      this.zone.run(() => {
        this.remoteStreamsSubject.next(this.remoteStreams);
      });
    }
  }

  /**
   * Get all remote streams
   */
  getRemoteStreams(): Map<string, ParticipantAudioStream> {
    return this.remoteStreams;
  }

  /**
   * Get local stream
   */
  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  /**
   * Check if broadcasting
   */
  isBroadcasting(): boolean {
    return this.localStream !== null;
  }

  /**
   * Get the AudioContext being used for analysis
   */
  getAudioContext(): AudioContext | null {
    return this.audioContext;
  }

  /**
   * Get local analyser for waveform visualization
   */
  getLocalAnalyser(): { analyser: AnalyserNode; dataArray: Uint8Array } | null {
    if (!this.localAnalyser || !this.localDataArray) {
      return null;
    }
    return {
      analyser: this.localAnalyser,
      dataArray: this.localDataArray,
    };
  }
}
