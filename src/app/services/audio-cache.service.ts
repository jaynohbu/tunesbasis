export interface CachedStem {
  name: string;
  sampleRate: number;
  duration: number;
  numberOfChannels: number;
  // Compressed audio data (downsampled, stored as Float32Array for efficiency)
  compressedData: Float32Array;
  // Waveform visualization data (pre-computed peaks)
  waveformPeaks: { min: number; max: number }[];
}

export interface CachedSong {
  songId: string;
  originalName: string;
  timestamp: number; // for cache expiration
  stems: CachedStem[];
}

export class AudioCacheService {
  private static readonly DB_NAME = 'AudioCacheDB';
  private static readonly DB_VERSION = 2; // Bumped to invalidate old 24kHz cache
  private static readonly STORE_NAME = 'songs';
  private static readonly CACHE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
  private static readonly COMPRESSION_FACTOR = 2; // 1/2 = 50% size, ~90% quality

  private static dbPromise: Promise<IDBDatabase> | null = null;

  /**
   * Initialize IndexedDB
   */
  private static async getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const oldVersion = event.oldVersion;

        // Version 1 → 2: Clear old cache with 24kHz sample rate bug
        if (oldVersion < 2) {
          console.log('[AudioCache] Upgrading from v1 to v2: clearing old cache with invalid sample rates');
          if (db.objectStoreNames.contains(this.STORE_NAME)) {
            db.deleteObjectStore(this.STORE_NAME);
          }
        }

        // Create fresh object store
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          db.createObjectStore(this.STORE_NAME, { keyPath: 'songId' });
        }
      };
    });

    return this.dbPromise;
  }

  /**
   * Check if a song is cached in IndexedDB
   */
  static async isCached(songId: string): Promise<boolean> {
    try {
      const data = await this.getCached(songId);
      return data !== null;
    } catch (error) {
      console.error('[AudioCache] Error checking cache:', error);
      return false;
    }
  }

  /**
   * Get cached song data from IndexedDB
   */
  static async getCached(songId: string): Promise<CachedSong | null> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction([this.STORE_NAME], 'readonly');
      const store = transaction.objectStore(this.STORE_NAME);

      return new Promise<CachedSong | null>((resolve, reject) => {
        const request = store.get(songId);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const data = request.result as CachedSong | undefined;

          if (!data) {
            resolve(null);
            return;
          }

          // Check expiration
          const age = Date.now() - data.timestamp;
          if (age > this.CACHE_EXPIRY_MS) {
            console.log(`[AudioCache] Cache expired for song ${songId}, removing...`);
            this.deleteCached(songId);
            resolve(null);
            return;
          }

          console.log(`[AudioCache] Cache hit for song ${songId} (${data.stems.length} stems)`);
          resolve(data);
        };
      });
    } catch (error) {
      console.error('[AudioCache] Error reading cache:', error);
      return null;
    }
  }

  /**
   * Delete cached song from IndexedDB
   */
  private static async deleteCached(songId: string): Promise<void> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction([this.STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      store.delete(songId);
    } catch (error) {
      console.error('[AudioCache] Error deleting cache:', error);
    }
  }

  /**
   * Compress AudioBuffer to ~50% of original size by downsampling
   */
  static compressBuffer(buffer: AudioBuffer): Float32Array {
    const channel = buffer.getChannelData(0);
    const originalLength = channel.length;
    const targetLength = Math.floor(originalLength / this.COMPRESSION_FACTOR);
    const compressed = new Float32Array(targetLength);

    console.log(`[AudioCache] Compressing buffer: ${originalLength} samples -> ${targetLength} samples`);

    // Downsample by taking average of chunks
    const chunkSize = this.COMPRESSION_FACTOR;
    let writeIndex = 0;
    for (let i = 0; i < originalLength; i += chunkSize) {
      let sum = 0;
      let count = 0;
      for (let j = 0; j < chunkSize && i + j < originalLength; j++) {
        sum += channel[i + j];
        count++;
      }
      compressed[writeIndex++] = sum / count;
    }

    return compressed;
  }

  /**
   * Extract waveform peaks for visualization (avoids redrawing)
   */
  static extractWaveformPeaks(buffer: AudioBuffer, width: number): { min: number; max: number }[] {
    let data: Float32Array;

    // Mix down to mono if stereo
    if (buffer.numberOfChannels > 1) {
      const ch0 = buffer.getChannelData(0);
      const ch1 = buffer.getChannelData(1);
      data = new Float32Array(ch0.length);
      for (let i = 0; i < ch0.length; i++) {
        data[i] = (ch0[i] + ch1[i]) * 0.5;
      }
    } else {
      data = buffer.getChannelData(0);
    }

    const peaks: { min: number; max: number }[] = [];
    const step = Math.max(1, Math.floor(data.length / width));

    for (let x = 0; x < width; x++) {
      let min = 1;
      let max = -1;
      for (let i = x * step; i < (x + 1) * step && i < data.length; i++) {
        const v = data[i];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      peaks.push({ min, max });
    }

    return peaks;
  }

  /**
   * Cache a loaded song with all its stems
   */
  static async cacheSong(
    songId: string,
    originalName: string,
    buffers: Record<string, AudioBuffer>,
    waveformWidth: number = 800
  ): Promise<void> {
    try {
      console.log(`[AudioCache] Caching song ${songId} (${originalName})...`);

      const cachedStems: CachedStem[] = [];

      for (const [name, buffer] of Object.entries(buffers)) {
        console.log(`[AudioCache] Processing stem: ${name}`);

        const cachedStem: CachedStem = {
          name,
          sampleRate: buffer.sampleRate,
          duration: buffer.duration,
          numberOfChannels: buffer.numberOfChannels,
          compressedData: this.compressBuffer(buffer),
          waveformPeaks: this.extractWaveformPeaks(buffer, waveformWidth)
        };

        cachedStems.push(cachedStem);
      }

      const cachedSong: CachedSong = {
        songId,
        originalName,
        timestamp: Date.now(),
        stems: cachedStems
      };

      // Calculate approximate size (Float32Array uses 4 bytes per element)
      const totalBytes = cachedStems.reduce((sum, stem) =>
        sum + (stem.compressedData.byteLength || stem.compressedData.length * 4), 0
      );
      console.log(`[AudioCache] Cache size: ${(totalBytes / 1024).toFixed(2)} KB (${cachedStems.length} stems)`);

      // Store in IndexedDB (IndexedDB can store Float32Array natively)
      const db = await this.getDB();
      const transaction = db.transaction([this.STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);

      return new Promise((resolve, reject) => {
        const request = store.put(cachedSong);

        request.onerror = () => {
          console.error('[AudioCache] Error caching song:', request.error);
          reject(request.error);
        };

        request.onsuccess = () => {
          console.log(`[AudioCache] Successfully cached song ${songId}`);
          resolve();
        };
      });
    } catch (error) {
      console.error('[AudioCache] Error caching song:', error);
    }
  }

  /**
   * Reconstruct AudioBuffer from cached compressed data
   */
  static reconstructBuffer(
    cachedStem: CachedStem,
    audioContext: AudioContext
  ): AudioBuffer {
    // Use compressed length directly - this is already downsampled audio
    const compressedLength = cachedStem.compressedData.length;

    // Web Audio API spec allows 8000-96000 Hz, but browsers may have higher minimums
    // Chrome/Safari often require >= 32000 Hz to avoid NotSupportedError
    // With 2x compression: 48kHz → 24kHz would fail, so enforce 32kHz minimum
    const MIN_SAMPLE_RATE = 32000;
    const targetSampleRate = Math.max(MIN_SAMPLE_RATE, cachedStem.sampleRate / this.COMPRESSION_FACTOR);

    // If we're using a higher sample rate than ideal, we need to upsample the data
    // Calculate how much we need to stretch the audio
    const stretchFactor = (cachedStem.sampleRate / this.COMPRESSION_FACTOR) / targetSampleRate;
    const adjustedLength = Math.floor(compressedLength / stretchFactor);

    const buffer = audioContext.createBuffer(
      cachedStem.numberOfChannels,
      adjustedLength,
      targetSampleRate
    );

    // Ensure we have a proper Float32Array (IndexedDB may return ArrayBufferLike)
    const audioData = cachedStem.compressedData instanceof Float32Array
      ? cachedStem.compressedData
      : new Float32Array(cachedStem.compressedData);

    // If we need to upsample, stretch the data by duplicating samples
    if (stretchFactor < 1) {
      // Need to upsample - duplicate samples to stretch the audio
      const finalData = new Float32Array(adjustedLength);
      for (let i = 0; i < adjustedLength; i++) {
        const sourceIndex = Math.floor(i * stretchFactor);
        finalData[i] = audioData[Math.min(sourceIndex, audioData.length - 1)];
      }

      // Copy to all channels
      for (let ch = 0; ch < cachedStem.numberOfChannels; ch++) {
        buffer.copyToChannel(finalData, ch);
      }
    } else {
      // Ensure proper ArrayBuffer type for copyToChannel
      const properData = new Float32Array(audioData);
      for (let ch = 0; ch < cachedStem.numberOfChannels; ch++) {
        buffer.copyToChannel(properData, ch);
      }
    }

    return buffer;
  }

  /**
   * Clear all audio caches
   */
  static async clearAll(): Promise<void> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction([this.STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);

      return new Promise((resolve, reject) => {
        const request = store.clear();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          console.log('[AudioCache] Cleared all cached songs');
          resolve();
        };
      });
    } catch (error) {
      console.error('[AudioCache] Error clearing caches:', error);
    }
  }
}
