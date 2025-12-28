import { Component, OnInit, ViewChild } from '@angular/core';
import { MusicUploadService, SongDTO } from 'src/app/services/music-upload.service';
import { SceneService, SceneDTO } from 'src/app/services/scene.service';
import { MusicPlayerComponent } from '../music-player/music-player.component';
import { Scene, SceneSong } from 'src/app/model/scene';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {

  @ViewChild(MusicPlayerComponent)
  playList!: MusicPlayerComponent;

  /* ================= DATA ================= */

  songs: SongDTO[] = [];
  songMap: Record<string, SongDTO> = {};

  /** 🔥 All scenes from server */
  scenesDTO: SceneDTO[] = [];

  /** 🔥 Hydrated scenes for player */
  scenes: Scene[] = [];

  /** 🔥 Active tab index */
  activeSceneIndex = 0;

  /* ================= UI ================= */

  showPlayer = true;
  lblBtnShowPlayer = 'Show Songs';

  constructor(
    private uploadService: MusicUploadService,
    private sceneService: SceneService
  ) {}

  /* ================= INIT ================= */

  async ngOnInit(): Promise<void> {
    console.log('[INIT] Dashboard initialized');
    console.log('===================================');

    // 🔥 CRITICAL FIX: reconcile on initial load as well
    await this.reloadSongsAndScenes();
    await this.addMissingSongsToActiveScene();
    await this.reloadSongsAndScenes();

    console.log('[INIT] Initial load complete');
    console.log('===================================');
  }

  /* ================= UPLOAD CALLBACK ================= */

  async onProcessCompleted() {
    console.log('[UPLOAD] Process completed');
    console.log('-----------------------------------');

    console.log('[STEP 1] Reload songs & scenes (before append)');
    await this.reloadSongsAndScenes();

    console.log('[STEP 2] Add missing songs to active scene');
    await this.addMissingSongsToActiveScene();

    console.log('[STEP 3] Reload songs & scenes (after append)');
    await this.reloadSongsAndScenes();

    console.log('[UPLOAD] Flow finished');
    console.log('===================================');
  }

  /* ================= CORE LOGIC ================= */

  private async reloadSongsAndScenes(): Promise<void> {

    console.log('[RELOAD] Loading songs');

    /* 1️⃣ Load songs */
    const songRes = await this.uploadService.listSongs();
    this.songs = songRes?.data ?? [];

    console.log(`[RELOAD] Songs loaded: ${this.songs.length}`);
    console.table(
      this.songs.map(s => ({
        songId: s.songId,
        name: s.originalName,
        stems: Array.isArray(s.stems)
          ? s.stems.length
          : Object.keys(s.stems || {}).length
      }))
    );

    this.songMap = Object.fromEntries(
      this.songs.map(song => [song.songId, song])
    );

    console.log('[RELOAD] songMap keys:', Object.keys(this.songMap));

    /* 2️⃣ Load scenes */
    console.log('[RELOAD] Loading scenes');
    const sceneRes = await this.sceneService.listScenes();
    this.scenesDTO = sceneRes?.data ?? [];

    console.log(`[RELOAD] Scenes loaded: ${this.scenesDTO.length}`);
    console.table(
      this.scenesDTO.map(s => ({
        sceneId: s.sceneId,
        name: s.name,
        items: s.items.length
      }))
    );

    /* 3️⃣ Create default scene if needed */
    if (!this.scenesDTO.length && this.songs.length > 0) {
      console.log('[RELOAD] No scenes found → creating default scene');
      const created = await this.createDefaultScene(this.songs);
      this.scenesDTO = [created];
    }

    /* 4️⃣ Hydrate scenes */
    console.log('[RELOAD] Hydrating scenes');
    this.scenes = this.scenesDTO
      .map(dto => this.hydrateScene(dto, this.songMap))
      .filter(Boolean);

    console.log(`[RELOAD] Hydrated scenes: ${this.scenes.length}`);
    this.scenes.forEach(scene => {
      console.log(`Scene "${scene.name}" contains ${scene.items.length} songs`);
    });

    /* 5️⃣ Clamp active index */
    if (this.activeSceneIndex >= this.scenes.length) {
      console.warn('[RELOAD] Active index out of bounds → resetting to 0');
      this.activeSceneIndex = 0;
    }

    /* 6️⃣ Load active scene into player */
    setTimeout(() => {
      const active = this.scenes[this.activeSceneIndex];
      if (active) {
        console.log('[PLAYER] Loading scene into player:', active.name);
        this.playList?.loadScene(active);
      } else {
        console.warn('[PLAYER] No active scene to load');
      }
    });
  }

  /* ================= UI ================= */

  onViewSongs() {
    this.showPlayer = !this.showPlayer;
    this.lblBtnShowPlayer = this.showPlayer
      ? 'Show Songs'
      : 'Show Player';
  }

  onSceneTabChange(index: number) {
    console.log('[TAB] Scene tab changed:', index);
    this.activeSceneIndex = index;

    const scene = this.scenes[index];
    if (scene) {
      console.log('[PLAYER] Loading scene from tab:', scene.name);
      this.playList?.loadScene(scene);
    }
  }

  /* ================= SCENE ================= */

  private async createDefaultScene(
    songs: SongDTO[]
  ): Promise<SceneDTO> {

    console.log('[SCENE] Creating default scene with songs:', songs.length);

    const items = songs.map((song, index) => ({
      songId: song.songId,
      order: index,
      intervalSec: 10,
      soundState: {}
    }));

    const res = await this.sceneService.createScene({
      name: `Default Scene (${songs.length} songs)`,
      items
    });

    console.log('[SCENE] Default scene created:', res.data.sceneId);
    return res.data;
  }

  private hydrateScene(
    dto: SceneDTO,
    songMap: Record<string, SongDTO>
  ): Scene {

    console.log('[HYDRATE] Scene:', dto.name);

    return {
      sceneId: dto.sceneId,
      name: dto.name,
      items: dto.items
        .map(item => {
          const song = songMap[item.songId];

          if (!song) {
            console.warn('[HYDRATE] Song missing in map:', item.songId);
            return null;
          }

          if (!song.stems) {
            console.warn('[HYDRATE] Song has no stems yet:', song.songId);
            return null;
          }

          return {
            song,
            intervalSec: item.intervalSec,
            stems: item.soundState || {}
          };
        })
        .filter(Boolean) as SceneSong[]
    };
  }

  /* ================= UPLOAD ERROR ================= */

  onUploadFailed(err: any) {
    console.error('[UPLOAD] Failed:', err);
  }

  /* ================= ADD SONGS ================= */

  private async addMissingSongsToActiveScene(): Promise<void> {

    console.log('[APPEND] Checking for missing songs');

    const activeSceneDTO = this.scenesDTO[this.activeSceneIndex];
    if (!activeSceneDTO) {
      console.warn('[APPEND] No active scene DTO');
      return;
    }

    const existingSongIds = new Set(
      activeSceneDTO.items.map(i => i.songId)
    );

    console.log('[APPEND] Existing songIds:', [...existingSongIds]);

    const newItems = this.songs
      .filter(song => !existingSongIds.has(song.songId))
      .map(song => ({
        songId: song.songId,
        order: activeSceneDTO.items.length,
        intervalSec: 10,
        soundState: {}
      }));

    console.log(`[APPEND] New songs detected: ${newItems.length}`);
    console.table(newItems);

    if (!newItems.length) {
      console.log('[APPEND] No new songs to add');
      return;
    }

    console.log('[APPEND] Updating scene on server:', activeSceneDTO.sceneId);

    await this.sceneService.updateScene(
      activeSceneDTO.sceneId,
      { items: [...activeSceneDTO.items, ...newItems] }
    );

    console.log('[APPEND] Scene updated successfully');

    // Update local cache
    this.scenesDTO[this.activeSceneIndex] = {
      ...activeSceneDTO,
      items: [...activeSceneDTO.items, ...newItems]
    };
  }
}
