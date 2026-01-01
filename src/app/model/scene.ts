import { SongDTO } from 'src/app/services/music-upload.service';

export interface StemSettings {
  volume: number;
  muted: boolean;
  pregain: number;
  compression: number;
  tone: number;
  distortion: number;
  eqLow: number;
  eqMid: number;
  eqHigh: number;
  reverb: number;
}

export interface SceneSong {
  song: SongDTO;

  /** Delay AFTER this song finishes */
  intervalSec: number;

  /** Per-stem sound settings */
  stems: Record<string, StemSettings>;
}

export interface Scene {
  sceneId?: string;
  name: string;
  items: SceneSong[];
}
