import { Injectable, NgZone } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/**
 * Clock Synchronization Service
 *
 * Implements NTP-like clock synchronization with the server for precise timing
 * in collaborative jam sessions. Uses median of multiple ping measurements with
 * RTT compensation to calculate server time offset.
 *
 * Algorithm:
 * 1. Send 5 ping messages to server
 * 2. Measure RTT for each ping
 * 3. Calculate offset for each: serverTime - clientTime - (RTT/2)
 * 4. Take median offset to reject outliers
 * 5. Re-sync periodically every 30 seconds
 *
 * Target accuracy: <20ms offset, <10ms std deviation
 */
@Injectable({
  providedIn: 'root',
})
export class ClockSyncService {
  private socket: Socket | null = null;
  private offsetMs = 0; // Server time offset in milliseconds
  private rttMs = 0; // Round-trip time in milliseconds
  private syncInProgress = false;
  private resyncInterval: any = null;

  // Observable state for UI monitoring
  private syncStatusSubject = new BehaviorSubject<{
    synced: boolean;
    offset: number;
    rtt: number;
    lastSyncTime: number;
  }>({
    synced: false,
    offset: 0,
    rtt: 0,
    lastSyncTime: 0,
  });

  public syncStatus$: Observable<{
    synced: boolean;
    offset: number;
    rtt: number;
    lastSyncTime: number;
  }> = this.syncStatusSubject.asObservable();

  constructor(private zone: NgZone) {}

  /**
   * Connect to clock sync server and perform initial synchronization
   */
  async connect(): Promise<void> {
    if (this.socket?.connected) {
      console.log('[ClockSync] Already connected');
      return;
    }

    return new Promise((resolve, reject) => {
      this.socket = io(`${environment.syncServerUrl}/clock-sync`, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      this.socket.on('connect', async () => {
        console.log('[ClockSync] Connected to server');

        try {
          await this.performSync();
          this.startResyncInterval();
          resolve();
        } catch (error) {
          console.error('[ClockSync] Initial sync failed:', error);
          reject(error);
        }
      });

      this.socket.on('connect_error', (error) => {
        console.error('[ClockSync] Connection error:', error);
        reject(error);
      });

      this.socket.on('disconnect', (reason) => {
        console.log('[ClockSync] Disconnected:', reason);
        this.updateSyncStatus(false, 0, 0);
        this.stopResyncInterval();
      });
    });
  }

  /**
   * Disconnect from clock sync server
   */
  disconnect(): void {
    this.stopResyncInterval();
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.updateSyncStatus(false, 0, 0);
  }

  /**
   * Perform clock synchronization with server
   * Sends 5 pings and takes median offset
   */
  private async performSync(): Promise<void> {
    if (this.syncInProgress) {
      console.warn('[ClockSync] Sync already in progress');
      return;
    }

    if (!this.socket?.connected) {
      throw new Error('Socket not connected');
    }

    this.syncInProgress = true;

    try {
      const measurements: { offset: number; rtt: number }[] = [];

      // Perform 5 ping measurements
      for (let i = 0; i < 5; i++) {
        const measurement = await this.singlePing();
        measurements.push(measurement);

        // Small delay between pings to avoid network congestion
        if (i < 4) {
          await this.delay(100);
        }
      }

      // Calculate median offset (more robust than mean)
      const offsets = measurements.map((m) => m.offset).sort((a, b) => a - b);
      const rtts = measurements.map((m) => m.rtt).sort((a, b) => a - b);

      this.offsetMs = offsets[Math.floor(offsets.length / 2)];
      this.rttMs = rtts[Math.floor(rtts.length / 2)];

      console.log(
        `[ClockSync] Sync complete: offset=${this.offsetMs.toFixed(2)}ms, rtt=${this.rttMs.toFixed(2)}ms`,
      );
      console.log('[ClockSync] All measurements:', measurements);

      // Notify server of sync completion (for monitoring)
      this.socket.emit('sync-complete', {
        offset: this.offsetMs,
        rtt: this.rttMs,
      });

      this.updateSyncStatus(true, this.offsetMs, this.rttMs);
    } catch (error) {
      console.error('[ClockSync] Sync failed:', error);
      throw error;
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Perform a single ping measurement
   */
  private async singlePing(): Promise<{ offset: number; rtt: number }> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket not connected'));
        return;
      }

      const t0 = Date.now(); // Client send time

      this.socket.emit('ping', t0, (response: any) => {
        const t3 = Date.now(); // Client receive time
        const { serverTime, clientTime } = response;

        // Validate response
        if (clientTime !== t0) {
          reject(new Error('Mismatched client time in response'));
          return;
        }

        // Calculate RTT and offset
        const rtt = t3 - t0;
        const offset = serverTime - t0 - rtt / 2;

        resolve({ offset, rtt });
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        reject(new Error('Ping timeout'));
      }, 5000);
    });
  }

  /**
   * Start periodic re-sync (every 30 seconds)
   */
  private startResyncInterval(): void {
    this.stopResyncInterval();
    this.resyncInterval = setInterval(() => {
      console.log('[ClockSync] Performing periodic re-sync');
      this.performSync().catch((error) => {
        console.error('[ClockSync] Re-sync failed:', error);
      });
    }, 30000); // 30 seconds
  }

  /**
   * Stop periodic re-sync
   */
  private stopResyncInterval(): void {
    if (this.resyncInterval) {
      clearInterval(this.resyncInterval);
      this.resyncInterval = null;
    }
  }

  /**
   * Update sync status observable (run in NgZone for change detection)
   */
  private updateSyncStatus(
    synced: boolean,
    offset: number,
    rtt: number,
  ): void {
    this.zone.run(() => {
      this.syncStatusSubject.next({
        synced,
        offset,
        rtt,
        lastSyncTime: Date.now(),
      });
    });
  }

  /**
   * Get current server time in milliseconds
   * @returns Estimated server timestamp
   */
  getServerTime(): number {
    return Date.now() + this.offsetMs;
  }

  /**
   * Convert server timestamp to local time
   * @param serverTime Server timestamp in milliseconds
   * @returns Local timestamp in milliseconds
   */
  serverToLocalTime(serverTime: number): number {
    return serverTime - this.offsetMs;
  }

  /**
   * Convert local timestamp to server time
   * @param localTime Local timestamp in milliseconds
   * @returns Server timestamp in milliseconds
   */
  localToServerTime(localTime: number): number {
    return localTime + this.offsetMs;
  }

  /**
   * Get current sync offset in milliseconds
   */
  getOffset(): number {
    return this.offsetMs;
  }

  /**
   * Get current RTT in milliseconds
   */
  getRTT(): number {
    return this.rttMs;
  }

  /**
   * Check if currently synced with server
   */
  isSynced(): boolean {
    return this.syncStatusSubject.value.synced;
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
