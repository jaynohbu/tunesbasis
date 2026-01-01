import { Component, Input, Output, EventEmitter, ViewChild, ElementRef } from '@angular/core';
import { Scene } from '../../model/scene';
import { MusicUploadService } from '../../services/music-upload.service';

@Component({
  selector: 'scene-editor',
  templateUrl: './scene-editor.component.html',
  styleUrls: ['./scene-editor.component.scss']
})
export class SceneEditorComponent {

  @Input() scene!: Scene;
  @Input() selectedIndex: number | null = null;

  @Output() selectSong = new EventEmitter<number>();
  @Output() loadSong = new EventEmitter<number>();
  @Output() sceneChange = new EventEmitter<Scene>();
  @Output() copyAsNewScene = new EventEmitter<Scene>();
  @Output() deleteSong = new EventEmitter<number>();
  @Output() songRenamed = new EventEmitter<void>();

  @ViewChild('songNameInput') songNameInput?: ElementRef<HTMLInputElement>;

  editingSongIndex: number | null = null;
  editingSongName = '';

  constructor(private uploadService: MusicUploadService) {}

  isSelected(i: number): boolean {
    return this.selectedIndex === i;
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
