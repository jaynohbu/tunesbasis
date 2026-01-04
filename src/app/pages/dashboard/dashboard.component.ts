import { Component, OnInit, ViewChild, ElementRef, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { MusicUploadService, SongDTO } from 'src/app/services/music-upload.service';
import { SceneService, SceneDTO, SceneItemDTO } from 'src/app/services/scene.service';
import { GroupsService } from 'src/app/services/groups.service';
import { ChatService } from 'src/app/services/chat.service';
import { AuthService } from 'src/app/services/auth.service';
import { Scene, SceneSong } from 'src/app/model/scene';
import { Subscription } from 'rxjs';
import { ConfirmationService } from 'primeng/api';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit, OnDestroy {

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
  showInviteModal = false;

  /* ================= JAM SESSION RECORDING ================= */

  isRecordingInProgress = false;

  /* ================= CHAT ================= */

  showChat = false;
  hasGroup = false;
  userGroupId: string | null = null;
  unreadMessageCount = 0;
  private chatSubscription?: Subscription;
  private currentUserId = '';

  constructor(
    private uploadService: MusicUploadService,
    private sceneService: SceneService,
    private groupsService: GroupsService,
    private chatService: ChatService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef,
    private confirmationService: ConfirmationService
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

    // Load group information for chat
    await this.loadGroupInfo();

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

    console.log(`[RELOAD] Songs loaded: ${this.songs.length}`, this.songs.map(s => s.originalName));
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
    console.log('[TAB] Scene tab changed from', this.activeSceneIndex, 'to', index);

    // Close any pending confirmation dialogs to prevent them from appearing
    this.confirmationService.close();
    console.log('[TAB] Closed any pending confirmation dialogs');

    this.activeSceneIndex = index;
    this.saveActiveSceneIndex();

    // Tab's music-player already loaded via ngOnChanges - no need to reload
    const scene = this.scenes[index];
    console.log(`[TAB] Switched to "${scene?.name}" - player already loaded`);
    console.log('[TAB] No save confirmation should appear - just stopping playback');
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
          // Check if this is a jam recording (soundState.stems is array of {name, url})
          const isJamRecording = item.soundState?.stems && Array.isArray(item.soundState.stems);

          if (isJamRecording) {
            // This is a jam recording - create a fake song from soundState
            console.log('[HYDRATE] Jam recording detected:', item.songId);
            const fakeSong: SongDTO = {
              songId: item.songId,
              originalName: item.soundState.originalName || item.songId,
              stems: item.soundState.stems, // Array of {name, url}
              status: 'ready',
              entityType: 'SONG',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              audioKey: item.songId // Use songId as audioKey for jam recordings
            };

            return {
              song: fakeSong,
              intervalSec: item.intervalSec,
              stems: {} // Initialize empty settings for jam recordings
            };
          }

          // Normal song - look up in songMap
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
  if (!scene.sceneId) {
    console.error('[Dashboard.onSceneUpdated] Cannot update scene without sceneId');
    return;
  }

  console.log('[Dashboard.onSceneUpdated] Updating scene:', {
    sceneId: scene.sceneId,
    sceneName: scene.name,
    itemCount: scene.items.length
  });

  const itemsDTO = scene.items.map((item, index) =>
    this.toSceneItemDTO(item, index)
  );

  try {
    await this.sceneService.updateScene(scene.sceneId, {
      items: itemsDTO
    });

    console.log('[Dashboard.onSceneUpdated] Scene updated successfully');

    // Update the local scenes array to reflect the changes
    const sceneIndex = this.scenes.findIndex(s => s.sceneId === scene.sceneId);
    if (sceneIndex !== -1) {
      this.scenes[sceneIndex] = scene;
      console.log('[Dashboard.onSceneUpdated] Local scenes array updated');
    }

    this.cdr.detectChanges();
  } catch (error) {
    console.error('[Dashboard.onSceneUpdated] Failed to update scene:', error);
  }
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

    // Reload all scenes to get the new copy
    await this.reloadSongsAndScenes();

    // Force change detection to ensure tab view updates properly
    this.cdr.detectChanges();

    // Use setTimeout to allow DOM to stabilize before switching tabs
    setTimeout(() => {
      // Switch to the new copied scene (it will be the last one)
      this.activeSceneIndex = this.scenes.length - 1;
      this.saveActiveSceneIndex();
      this.cdr.detectChanges();

      console.log('[COPY] Switched to new scene:', this.scenes[this.activeSceneIndex]?.name);
    }, 100);
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

async onSongDeleted(event: { sceneId: string; songIndex: number }) {
  const { sceneId, songIndex } = event;

  console.log('[Dashboard.onSongDeleted] Deleting song from scene:', {
    sceneId,
    songIndex
  });

  try {
    // Call backend to delete the song
    await this.sceneService.deleteSongFromScene(sceneId, songIndex);

    console.log('[Dashboard.onSongDeleted] Song deleted successfully, reloading scene');

    // Reload the specific scene from backend
    const sceneResponse = await this.sceneService.getScene(sceneId);
    const sceneDTO = sceneResponse.data;

    // Find the scene in local arrays
    const sceneIndex = this.scenes.findIndex(s => s.sceneId === sceneId);
    const sceneDTOIndex = this.scenesDTO.findIndex(s => s.sceneId === sceneId);

    if (sceneIndex === -1) {
      console.error('[Dashboard.onSongDeleted] Scene not found in local array');
      return;
    }

    // Update scenesDTO to prevent full reload
    if (sceneDTOIndex !== -1) {
      this.scenesDTO[sceneDTOIndex] = sceneDTO;
      console.log('[Dashboard.onSongDeleted] Updated scenesDTO at index:', sceneDTOIndex);
    }

    // Hydrate the updated scene data
    const updatedScene = this.hydrateScene(sceneDTO, this.songMap);

    // IMPORTANT: Update scene properties in-place instead of replacing the object
    // This preserves component state (like overlayOpen in scene-player-tab)
    const existingScene = this.scenes[sceneIndex];
    existingScene.sceneId = updatedScene.sceneId;
    existingScene.name = updatedScene.name;
    existingScene.items = updatedScene.items;

    console.log('[Dashboard.onSongDeleted] Scene updated in-place, new item count:', existingScene.items.length);
    console.log('[Dashboard.onSongDeleted] Triggering change detection');

    // Force UI update without destroying components
    this.cdr.detectChanges();

    console.log('[Dashboard.onSongDeleted] Change detection complete');
  } catch (error: any) {
    console.error('[Dashboard.onSongDeleted] Failed to delete song:', error);
    console.error('[Dashboard.onSongDeleted] Error details:', {
      message: error?.message,
      stack: error?.stack
    });
    // Don't rethrow - prevent page refresh on error
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

    // IMPORTANT: Skip auto-adding songs to Jammings scene
    // Jammings scene should only contain jam recordings (saved from jam sessions)
    if (activeSceneDTO.name.toLowerCase() === 'jammings') {
      console.log('[APPEND] Skipping Jammings scene - jam recordings only');
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

  /* ================= INVITE MODAL ================= */

  openInviteModal() {
    this.showInviteModal = true;
  }

  closeInviteModal() {
    this.showInviteModal = false;
  }

  /* ================= SCENE SHARING ================= */

  async onToggleSceneSharing(event: { sceneId: string; shared: boolean }): Promise<void> {
    console.log('[Dashboard.onToggleSceneSharing] Toggling scene sharing:', event);

    try {
      await this.sceneService.toggleSceneSharing(event.sceneId, event.shared);

      // Update local scene state
      const sceneDTO = this.scenesDTO.find(s => s.sceneId === event.sceneId);
      if (sceneDTO) {
        sceneDTO.shared = event.shared;
      }

      const scene = this.scenes.find(s => s.sceneId === event.sceneId);
      if (scene) {
        scene.shared = event.shared;
      }

      console.log('[Dashboard.onToggleSceneSharing] Scene sharing updated successfully');
    } catch (error) {
      console.error('[Dashboard.onToggleSceneSharing] Failed to toggle scene sharing:', error);
      // Revert the toggle in UI
      const scene = this.scenes.find(s => s.sceneId === event.sceneId);
      if (scene) {
        scene.shared = !event.shared;
      }
    }
  }

  /* ================= JAMMING SAVED ================= */

  async onJammingSaved(): Promise<void> {
    console.log('[Dashboard.onJammingSaved] Reloading scenes with recorded stems');

    // Save current tab index before reload
    const currentTabIndex = this.activeSceneIndex;

    // Reload all scenes from backend
    await this.reloadSongsAndScenes();

    // Stay on the same tab (don't switch)
    this.activeSceneIndex = currentTabIndex;
    console.log('[Dashboard.onJammingSaved] Staying on current tab at index:', currentTabIndex);

    // Force UI update
    this.cdr.detectChanges();
  }

  /* ================= JAM RECORDING STATE ================= */

  onRecordingStateChanged(isRecording: boolean): void {
    console.log('[Dashboard.onRecordingStateChanged] Recording state:', isRecording);
    this.isRecordingInProgress = isRecording;
    this.cdr.detectChanges();
  }

  /* ================= CHAT ================= */

  async loadGroupInfo(): Promise<void> {
    try {
      // Get current user ID
      this.currentUserId = await this.authService.getCurrentUserId();

      const response = await this.groupsService.getMyGroup();
      const data = response.data;

      if (data.exists && data.group) {
        this.hasGroup = true;
        this.userGroupId = data.group.groupId;
        console.log('[Dashboard] User group loaded:', data.group.name);

        // Subscribe to new messages for unread count
        this.subscribeToMessages();
      } else {
        this.hasGroup = false;
        this.userGroupId = null;
        console.log('[Dashboard] User has no group');
      }
    } catch (error) {
      console.error('[Dashboard] Failed to load group info:', error);
      this.hasGroup = false;
      this.userGroupId = null;
    }
  }

  private subscribeToMessages(): void {
    if (!this.userGroupId) return;

    // Subscribe to new messages
    this.chatSubscription = this.chatService.subscribeToMessages(this.userGroupId).subscribe({
      next: (message) => {
        // Only increment if:
        // 1. Message is from another user
        // 2. Chat window is not currently open
        if (message.userId !== this.currentUserId && !this.showChat) {
          this.unreadMessageCount++;
          this.cdr.detectChanges();
          console.log('[Dashboard] Unread message count:', this.unreadMessageCount);
        }
      },
      error: (error) => console.error('[Dashboard] Message subscription error:', error)
    });
  }

  toggleChat(): void {
    this.showChat = !this.showChat;

    // Reset unread count when opening chat
    if (this.showChat) {
      this.unreadMessageCount = 0;
      this.cdr.detectChanges();
    }
  }

  ngOnDestroy(): void {
    // Unsubscribe from chat messages
    if (this.chatSubscription) {
      this.chatSubscription.unsubscribe();
    }
  }
}
