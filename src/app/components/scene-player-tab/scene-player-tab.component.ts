import { Component, Input, ViewChild, AfterViewInit } from '@angular/core';
import { Scene } from 'src/app/model/scene';
import { MusicPlayerComponent } from 'src/app/pages/music-player/music-player.component';

@Component({
  selector: 'scene-player-tab',
  templateUrl: './scene-player-tab.component.html',
  styleUrls: ['./scene-player-tab.component.scss']
})
export class ScenePlayerTabComponent implements AfterViewInit {

  @Input() scene!: Scene;

  /** 🔥 real player instance (child component) */
  @ViewChild(MusicPlayerComponent)
  player!: MusicPlayerComponent;

  /** overlay visibility */
  overlayOpen = false;

  /** selected (but not yet loaded) song index */
  selectedIndex: number | null = null;

  ngAfterViewInit(): void {
    // Optional debug
    console.log('[TAB] MusicPlayer bound:', !!this.player);
  }

  /* ================= SONG SELECTION ================= */

  onSelectSong(index: number) {
    this.selectedIndex = index;
  }

  isSelected(index: number): boolean {
    return this.selectedIndex === index;
  }

  /* ================= LOAD ================= */

  onLoadSong() {
    if (this.selectedIndex === null || !this.player) {
      console.warn('[TAB] Cannot load song — player not ready');
      return;
    }

    console.log('[TAB] Load song:', this.selectedIndex);

    // 🔥 wipe previous song completely
    this.player.resetPlayer();

    // 🔥 load selected song
    this.player.loadFromScene(this.selectedIndex);

    // Optional UX improvement
    this.overlayOpen = false;
  }

  /* ================= OVERLAY ================= */

  toggleOverlay() {
    this.overlayOpen = !this.overlayOpen;
  }
}
