import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { MusicUploadService, SongDTO } from 'src/app/services/music-upload.service';
import { SceneService, SceneDTO, SceneItemDTO } from 'src/app/services/scene.service';
import { Scene, SceneSong } from 'src/app/model/scene';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {

  /* ================= DATA ================= */

  songs: SongDTO[] = [];
  songMap: Record<string, SongDTO> = {};

  /** 🔥 All scenes from server */
  scenesDTO: SceneDTO[] = [];

  /** 🔥 Hydrated scenes for player */
  scenes: Scene[] = [];

  /** 🔥 Active tab index */
  activeSceneIndex = 0;

  /* ================= SCENE EDITING ================= */

  @ViewChild('sceneNameInput') sceneNameInput?: ElementRef<HTMLInputElement>;
  editingSceneIndex: number | null = null;
  editingSceneName = '';

  /* ================= LOCALSTORAGE KEYS ================= */
  private readonly STORAGE_KEY_SCENE_INDEX = 'tunesbasis.activeSceneIndex';

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

    // Restore activeSceneIndex from localStorage
    this.restoreActiveSceneIndex();

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

    /* 6️⃣ Scenes loaded - each tab's music-player will auto-load via ngOnChanges */
    console.log('[RELOAD] Scenes ready - tab players will auto-load');
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
    this.saveActiveSceneIndex();

    // Tab's music-player already loaded via ngOnChanges - no need to reload
    const scene = this.scenes[index];
    console.log(`[TAB] Switched to "${scene?.name}" - player already loaded`);
  }

  /* ================= LOCALSTORAGE PERSISTENCE ================= */

  private restoreActiveSceneIndex(): void {
    const stored = localStorage.getItem(this.STORAGE_KEY_SCENE_INDEX);
    if (stored !== null) {
      const index = parseInt(stored, 10);
      if (!isNaN(index) && index >= 0) {
        this.activeSceneIndex = index;
        console.log('[STORAGE] Restored activeSceneIndex:', index);
      }
    }
  }

  private saveActiveSceneIndex(): void {
    localStorage.setItem(this.STORAGE_KEY_SCENE_INDEX, this.activeSceneIndex.toString());
    console.log('[STORAGE] Saved activeSceneIndex:', this.activeSceneIndex);
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

    // Create default scene with a generic name
    const sceneName = `Default Scene (${songs.length} songs)`;

    const res = await this.sceneService.createScene({
      name: sceneName,
      items
    });

    console.log('[SCENE] Default scene created:', res.data.sceneId, 'with name:', sceneName);
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
async onSceneUpdated(scene: Scene) {
  if (!scene.sceneId) return;

  const itemsDTO = scene.items.map((item, index) =>
    this.toSceneItemDTO(item, index)
  );

  return this.sceneService.updateScene(scene.sceneId, {
    items: itemsDTO
  });
}

async onSceneCopied(scene: Scene) {
  if (!scene.sceneId) {
    console.error('[COPY] Cannot copy scene without sceneId');
    return;
  }

  console.log('[COPY] Copying scene:', scene.name);

  try {
    // Create copy with default settings on backend
    const newName = `${scene.name} (Copy)`;
    const response = await this.sceneService.copyScene(scene.sceneId, newName);

    console.log('[COPY] Scene copied successfully:', response.data.sceneId);

    // Reset activeSceneIndex to force PrimeNG to update
    this.activeSceneIndex = -1;

    // Reload all scenes to get the new copy
    await this.reloadSongsAndScenes();

    // Use setTimeout to allow Angular change detection to process
    setTimeout(() => {
      // Switch to the new copied scene (it will be the last one)
      this.activeSceneIndex = this.scenes.length - 1;
      this.saveActiveSceneIndex();

      console.log('[COPY] Switched to new scene:', this.scenes[this.activeSceneIndex]?.name);
    }, 0);
  } catch (error) {
    console.error('[COPY] Failed to copy scene:', error);
  }
}

async onSceneDeleted(scene: Scene) {
  if (!scene.sceneId) {
    console.error('[DELETE] Cannot delete scene without sceneId');
    return;
  }

  console.log('[DELETE] Deleting scene:', scene.name, 'at index:', this.activeSceneIndex);

  try {
    // Find the index of the deleted scene BEFORE deleting
    const deletedIndex = this.activeSceneIndex;
    const totalScenesBefore = this.scenes.length;

    // Delete scene on backend
    await this.sceneService.deleteScene(scene.sceneId);

    console.log('[DELETE] Scene deleted successfully:', scene.sceneId);
    console.log('[DELETE] Total scenes before delete:', totalScenesBefore);
    console.log('[DELETE] Deleted index was:', deletedIndex);

    // Reload all scenes
    await this.reloadSongsAndScenes();

    console.log('[DELETE] Total scenes after reload:', this.scenes.length);

    // If no scenes left, reset to 0
    if (this.scenes.length === 0) {
      this.activeSceneIndex = 0;
      console.log('[DELETE] No scenes left');
      return;
    }

    // Calculate new index
    let newIndex: number;
    if (deletedIndex >= this.scenes.length) {
      // Deleted the last scene, move to the new last scene
      newIndex = this.scenes.length - 1;
    } else {
      // Deleted a scene in the middle or beginning, stay at same index (which now points to the next scene)
      newIndex = deletedIndex;
    }

    console.log('[DELETE] Setting new active index to:', newIndex);

    // Set the new index immediately
    this.activeSceneIndex = newIndex;
    this.saveActiveSceneIndex();

    console.log('[DELETE] Switched to scene:', this.scenes[this.activeSceneIndex]?.name);
  } catch (error) {
    console.error('[DELETE] Failed to delete scene:', error);
  }
}

private toSceneItemDTO(
  item: SceneSong,
  index: number
): SceneItemDTO {
  return {
    songId: item.song.songId,
    order: index,
    intervalSec: item.intervalSec ?? 0,
    soundState: item.stems   // 🔥 this is your live mix state
  };
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

  /* ================= SCENE NAME EDITING ================= */

  startEditingScene(i: number) {
    this.editingSceneIndex = i;
    this.editingSceneName = this.scenes[i].name;

    setTimeout(() => {
      this.sceneNameInput?.nativeElement.focus();
      this.sceneNameInput?.nativeElement.select();
    }, 0);
  }

  async saveEditingScene(i: number) {
    if (!this.editingSceneName.trim()) {
      this.cancelEditingScene();
      return;
    }

    const scene = this.scenes[i];
    const newName = this.editingSceneName.trim();

    if (newName === scene.name) {
      this.cancelEditingScene();
      return;
    }

    if (!scene.sceneId) {
      console.error('[DashboardComponent.saveEditingScene] Scene has no sceneId');
      this.cancelEditingScene();
      return;
    }

    try {
      await this.sceneService.updateScene(scene.sceneId, { name: newName });

      scene.name = newName;
      const sceneDTO = this.scenesDTO.find(s => s.sceneId === scene.sceneId);
      if (sceneDTO) {
        sceneDTO.name = newName;
      }

      this.editingSceneIndex = null;
      this.editingSceneName = '';

      console.log('[DashboardComponent.saveEditingScene] Scene renamed to:', newName);
    } catch (error) {
      console.error('[DashboardComponent.saveEditingScene] Failed to rename scene:', error);
      this.cancelEditingScene();
    }
  }

  cancelEditingScene() {
    this.editingSceneIndex = null;
    this.editingSceneName = '';
  }
}
