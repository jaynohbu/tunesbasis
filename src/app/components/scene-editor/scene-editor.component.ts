import { Component, Input, Output, EventEmitter } from '@angular/core';
import { Scene } from '../../model/scene';

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

  private emit() {
    this.sceneChange.emit(this.scene);
  }
}
