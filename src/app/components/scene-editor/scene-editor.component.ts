import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, OnChanges, SimpleChanges } from '@angular/core';
import { Scene } from '../../model/scene';
import { MusicUploadService, SongDTO } from '../../services/music-upload.service';

interface SongOption {
  song: SongDTO;
  displayName: string;
}

@Component({
  selector: 'scene-editor',
  templateUrl: './scene-editor.component.html',
  styleUrls: ['./scene-editor.component.scss']
})
export class SceneEditorComponent implements OnChanges {

  @Input() scene!: Scene;
  @Input() selectedIndex: number | null = null;
  @Input() allSongs: SongDTO[] = [];

  @Output() selectSong = new EventEmitter<number>();
  @Output() loadSong = new EventEmitter<number>();
  @Output() sceneChange = new EventEmitter<Scene>();
  @Output() copyAsNewScene = new EventEmitter<Scene>();
  @Output() deleteSong = new EventEmitter<number>();
  @Output() songRenamed = new EventEmitter<void>();
  @Output() addSong = new EventEmitter<SongDTO>();

  @ViewChild('songNameInput') songNameInput?: ElementRef<HTMLInputElement>;

  editingSongIndex: number | null = null;
  editingSongName = '';

  availableSongsToAdd: SongOption[] = [];
  selectedSongToAdd: SongOption | null = null;

  constructor(private uploadService: MusicUploadService) {}

  ngOnChanges(changes: SimpleChanges): void {
    console.log('[SceneEditor.ngOnChanges] Changes detected:', {
      allSongs: changes['allSongs'] ? {
        currentValue: changes['allSongs'].currentValue?.length,
        previousValue: changes['allSongs'].previousValue?.length
      } : null,
      scene: changes['scene'] ? {
        currentValue: changes['scene'].currentValue?.items?.length,
        sceneName: changes['scene'].currentValue?.name
      } : null
    });

    if (changes['allSongs'] || changes['scene']) {
      this.updateAvailableSongs();
    }
  }

  private updateAvailableSongs(): void {
    console.log('[SceneEditor.updateAvailableSongs] Starting update:', {
      hasScene: !!this.scene,
      hasSceneItems: !!this.scene?.items,
      sceneItemsCount: this.scene?.items?.length || 0,
      allSongsCount: this.allSongs?.length || 0
    });

    if (!this.scene || !this.scene.items) {
      console.log('[SceneEditor.updateAvailableSongs] No scene or scene.items, clearing available songs');
      this.availableSongsToAdd = [];
      return;
    }

    // Allow duplicate songs - show all songs in the dropdown
    this.availableSongsToAdd = this.allSongs.map(song => ({
      song,
      displayName: song.sceneName || song.originalName
    }));

    console.log('[SceneEditor.updateAvailableSongs] Available songs to add:', {
      count: this.availableSongsToAdd.length,
      songs: this.availableSongsToAdd.map(s => s.displayName)
    });
  }

  isSelected(i: number): boolean {
    return this.selectedIndex === i;
  }

  onAddSong(): void {
    if (!this.selectedSongToAdd) {
      return;
    }

    console.log('[SceneEditor.onAddSong] Adding song:', this.selectedSongToAdd.displayName);
    this.addSong.emit(this.selectedSongToAdd.song);
    this.selectedSongToAdd = null;
  }

  onSelect(i: number) {
    this.selectSong.emit(i);
  }

  onLoad(i: number) {
    this.loadSong.emit(i);
  }

  moveUp(i: number) {
    if (i === 0) return;
    [this.scene.items[i - 1], this.scene.items[i]] =
      [this.scene.items[i], this.scene.items[i - 1]];
    this.emit();
  }

  moveDown(i: number) {
    if (i === this.scene.items.length - 1) return;
    [this.scene.items[i + 1], this.scene.items[i]] =
      [this.scene.items[i], this.scene.items[i + 1]];
    this.emit();
  }

  remove(i: number) {
    this.scene.items.splice(i, 1);
    this.emit();
  }

  onCopyAsNewScene() {
    console.log('[SceneEditor.onCopyAsNewScene] User clicked Copy as New Scene for:', this.scene.name);
    this.copyAsNewScene.emit(this.scene);
  }

  onDeleteSong(i: number) {
    console.log('[SceneEditor.onDeleteSong] User clicked Delete Song at index:', i);
    this.deleteSong.emit(i);
  }

  startEditingSong(i: number) {
    this.editingSongIndex = i;
    this.editingSongName = this.scene.items[i].song.sceneName || this.scene.items[i].song.originalName;

    setTimeout(() => {
      this.songNameInput?.nativeElement.focus();
      this.songNameInput?.nativeElement.select();
    }, 0);
  }

  async saveEditingSong(i: number) {
    if (!this.editingSongName.trim()) {
      this.cancelEditingSong();
      return;
    }

    const song = this.scene.items[i].song;
    const newName = this.editingSongName.trim();

    if (newName === (song.sceneName || song.originalName)) {
      this.cancelEditingSong();
      return;
    }

    try {
      await this.uploadService.updateSong(song.songId, { sceneName: newName });

      song.sceneName = newName;

      this.editingSongIndex = null;
      this.editingSongName = '';

      this.songRenamed.emit();

      console.log('[SceneEditor.saveEditingSong] Song renamed to:', newName);
    } catch (error) {
      console.error('[SceneEditor.saveEditingSong] Failed to rename song:', error);
      this.cancelEditingSong();
    }
  }

  cancelEditingSong() {
    this.editingSongIndex = null;
    this.editingSongName = '';
  }

  private emit() {
    this.sceneChange.emit(this.scene);
  }
}
