import { Injectable } from '@angular/core';
import { MusicPlayerEngine } from '../pages/music-player/music-player.engine';
import { ClockSyncService } from './clock-sync.service';

/**
 * Synchronized Player Service
 *
 * Wrapper around MusicPlayerEngine that enables synchronized playback
 * across multiple clients. Uses scheduled audio playback with server
 * timestamps for sample-accurate synchronization.
 *
 * Key Concepts:
 * - Leader: Starts playback immediately, broadcasts server timestamp
 * - Follower: Receives timestamp, calculates delay, schedules playback
 * - Late Join: Calculates catchup position based on server time
 *
 * Uses AudioContext.currentTime for sample-accurate scheduling
 */
@Injectable({
  providedIn: 'root',
})
export class SynchronizedPlayerService {
  private scheduledPlayTimeout: any = null;

  constructor(private clockSyncService: ClockSyncService) {}

  /**
   * Schedule synchronized playback
   *
   * @param engine - MusicPlayerEngine instance
   * @param serverStartTime - Server timestamp when playback should start (ms)
   * @param position - Starting position in song (seconds)
   * @param isLeader - Whether this client is the session leader
   */
  schedulePlay(
    engine: MusicPlayerEngine,
    serverStartTime: number,
    position: number,
    isLeader: boolean = false,
  ): void {
    // Clear any existing scheduled playback
    this.cancelScheduledPlay();

    // Convert server timestamp to local time
    const localStartTime = this.clockSyncService.serverToLocalTime(serverStartTime);
    const nowLocal = Date.now();
    const delayMs = localStartTime - nowLocal;

    console.log('[SynchronizedPlayer] Scheduling playback:', {
      serverStartTime,
      localStartTime,
      nowLocal,
      delayMs,
      position,
      isLeader,
    });

    if (delayMs > 0) {
      // Future playback - schedule it
      console.log(`[SynchronizedPlayer] Scheduling playback in ${delayMs.toFixed(0)}ms`);

      this.scheduledPlayTimeout = setTimeout(() => {
        console.log('[SynchronizedPlayer] Executing scheduled playback');
        this.executePlay(engine, position);
      }, delayMs);
    } else {
      // Late join - calculate catchup position
      const latenessMs = Math.abs(delayMs);
      const latenesSec = latenessMs / 1000;
      const catchupPosition = position + latenesSec;

      console.log(
        `[SynchronizedPlayer] Late join detected (${latenessMs.toFixed(0)}ms late), starting at position ${catchupPosition.toFixed(2)}s`,
      );

      this.executePlay(engine, catchupPosition);
    }
  }

  /**
   * Execute playback at calculated position
   */
  private executePlay(engine: MusicPlayerEngine, position: number): void {
    // Seek to position
    const maxDuration = engine.getMaxDuration();
    if (maxDuration > 0) {
      const ratio = Math.min(position / maxDuration, 1);
      engine.seek(ratio);
    }

    // Start playback
    engine.play();

    console.log(`[SynchronizedPlayer] Started playback at position ${position.toFixed(2)}s`);
  }

  /**
   * Schedule synchronized pause
   *
   * @param engine - MusicPlayerEngine instance
   * @param serverPauseTime - Server timestamp when pause should occur (ms)
   */
  schedulePause(
    engine: MusicPlayerEngine,
    serverPauseTime: number,
  ): void {
    // Clear any existing scheduled playback
    this.cancelScheduledPlay();

    // Convert server timestamp to local time
    const localPauseTime = this.clockSyncService.serverToLocalTime(serverPauseTime);
    const nowLocal = Date.now();
    const delayMs = localPauseTime - nowLocal;

    console.log('[SynchronizedPlayer] Scheduling pause:', {
      serverPauseTime,
      localPauseTime,
      nowLocal,
      delayMs,
    });

    if (delayMs > 0) {
      // Future pause - schedule it
      this.scheduledPlayTimeout = setTimeout(() => {
        console.log('[SynchronizedPlayer] Executing scheduled pause');
        engine.pause();
      }, delayMs);
    } else {
      // Immediate pause
      engine.pause();
    }
  }

  /**
   * Schedule synchronized seek
   *
   * @param engine - MusicPlayerEngine instance
   * @param serverSeekTime - Server timestamp when seek should occur (ms)
   * @param position - Target position (seconds)
   */
  scheduleSeek(
    engine: MusicPlayerEngine,
    serverSeekTime: number,
    position: number,
  ): void {
    // Clear any existing scheduled playback
    this.cancelScheduledPlay();

    // Convert server timestamp to local time
    const localSeekTime = this.clockSyncService.serverToLocalTime(serverSeekTime);
    const nowLocal = Date.now();
    const delayMs = localSeekTime - nowLocal;

    console.log('[SynchronizedPlayer] Scheduling seek:', {
      serverSeekTime,
      localSeekTime,
      nowLocal,
      delayMs,
      position,
    });

    if (delayMs > 0) {
      // Future seek - schedule it
      this.scheduledPlayTimeout = setTimeout(() => {
        console.log('[SynchronizedPlayer] Executing scheduled seek');
        const maxDuration = engine.getMaxDuration();
        if (maxDuration > 0) {
          const ratio = Math.min(position / maxDuration, 1);
          engine.seek(ratio);
        }
      }, delayMs);
    } else {
      // Immediate seek
      const maxDuration = engine.getMaxDuration();
      if (maxDuration > 0) {
        const ratio = Math.min(position / maxDuration, 1);
        engine.seek(ratio);
      }
    }
  }

  /**
   * Cancel any scheduled playback/pause/seek
   */
  cancelScheduledPlay(): void {
    if (this.scheduledPlayTimeout) {
      clearTimeout(this.scheduledPlayTimeout);
      this.scheduledPlayTimeout = null;
    }
  }

  /**
   * Calculate time until scheduled event (for UI display)
   */
  getTimeUntilEvent(serverEventTime: number): number {
    const localEventTime = this.clockSyncService.serverToLocalTime(serverEventTime);
    const nowLocal = Date.now();
    return Math.max(0, localEventTime - nowLocal);
  }

  /**
   * Check if playback is currently scheduled
   */
  isScheduled(): boolean {
    return this.scheduledPlayTimeout !== null;
  }
}
