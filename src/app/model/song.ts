export interface StemInfo {
  name: string;
  url: string;
}

export interface Song {
  songId: string;
  originalName: string;
  status: 'uploaded' | 'processing' | 'ready' | 'failed';
  stems?: StemInfo[];
}
