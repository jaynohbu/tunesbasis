import { Component, OnInit, OnDestroy } from '@angular/core';
import { ClockSyncService } from 'src/app/services/clock-sync.service';
import { Subscription } from 'rxjs';

/**
 * Clock Sync Test Component
 *
 * Simple UI for testing and monitoring clock synchronization.
 * Displays sync status, offset, RTT, and allows manual testing.
 */
@Component({
  selector: 'app-clock-sync-test',
  templateUrl: './clock-sync-test.component.html',
  styleUrls: ['./clock-sync-test.component.scss'],
})
export class ClockSyncTestComponent implements OnInit, OnDestroy {
  synced = false;
  offset = 0;
  rtt = 0;
  lastSyncTime = 0;
  connecting = false;
  error: string | null = null;

  localTime = '';
  serverTime = '';

  private subscription: Subscription | null = null;
  private clockInterval: any = null;

  constructor(private clockSyncService: ClockSyncService) {}

  ngOnInit(): void {
    // Subscribe to sync status updates
    this.subscription = this.clockSyncService.syncStatus$.subscribe(
      (status) => {
        this.synced = status.synced;
        this.offset = status.offset;
        this.rtt = status.rtt;
        this.lastSyncTime = status.lastSyncTime;
      }
    );

    // Update clock display every 100ms
    this.clockInterval = setInterval(() => {
      this.updateClockDisplay();
    }, 100);
  }

  ngOnDestroy(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
    if (this.clockInterval) {
      clearInterval(this.clockInterval);
    }
  }

  async onConnect(): Promise<void> {
    this.connecting = true;
    this.error = null;

    try {
      await this.clockSyncService.connect();
      console.log('[ClockSyncTest] Connected successfully');
    } catch (error: any) {
      console.error('[ClockSyncTest] Connection failed:', error);
      this.error = error.message || 'Connection failed';
    } finally {
      this.connecting = false;
    }
  }

  onDisconnect(): void {
    this.clockSyncService.disconnect();
    this.error = null;
  }

  private updateClockDisplay(): void {
    const now = Date.now();
    this.localTime = new Date(now).toISOString();

    if (this.synced) {
      const serverNow = this.clockSyncService.getServerTime();
      this.serverTime = new Date(serverNow).toISOString();
    } else {
      this.serverTime = 'Not synced';
    }
  }

  getLastSyncTimeFormatted(): string {
    if (!this.lastSyncTime) return 'Never';
    const secondsAgo = Math.floor((Date.now() - this.lastSyncTime) / 1000);
    return `${secondsAgo}s ago`;
  }

  getSyncStatusColor(): string {
    if (!this.synced) return 'gray';
    if (Math.abs(this.offset) > 50) return 'orange';
    if (this.rtt > 100) return 'orange';
    return 'green';
  }

  getSyncStatusText(): string {
    if (!this.synced) return 'Not Synced';
    if (Math.abs(this.offset) > 50) return 'High Offset';
    if (this.rtt > 100) return 'High Latency';
    return 'Synced';
  }
}
