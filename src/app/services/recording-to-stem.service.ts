import { Injectable } from '@angular/core';
import { ParticipantRecording } from './participant-recording.service';

/**
 * Temporary Stem from Recording
 *
 * Represents a participant's mic recording as a playable stem
 */
export interface RecordedStem {
  name: string; // e.g., "mic-John"
  userName: string;
  userId: string;
  audioBuffer: AudioBuffer;
  startOffsetSeconds: number; // How many seconds into playback this stem starts
  duration: number;
  originalBlob: Blob; // Original WebM recording for upload
}

/**
 * Recording to Stem Service
 *
 * Converts participant microphone recordings (WebM blobs) into
 * AudioBuffer stems that can be played alongside instrumental stems.
 *
 * Key features:
 * - Decode WebM/Opus to AudioBuffer
 * - Calculate alignment offset based on timestamps
 * - Create playable stems with participant names
 */
@Injectable({
  providedIn: 'root',
})
export class RecordingToStemService {
  constructor() {}

  /**
   * Convert participant recordings to aligned stems
   *
   * @param recordings - Array of participant recordings
   * @param playbackStartTime - Server timestamp when playback started
   * @param audioContext - Web Audio API context
   * @returns Promise of RecordedStem array
   */
  async convertRecordingsToStems(
    recordings: ParticipantRecording[],
    playbackStartTime: number,
    audioContext: AudioContext,
  ): Promise<RecordedStem[]> {
    console.log('[RecordingToStem] Converting', recordings.length, 'recordings to stems');

    const stems: RecordedStem[] = [];

    for (const recording of recordings) {
      try {
        // Decode WebM blob to AudioBuffer
        const audioBuffer = await this.decodeRecording(recording.audioBlob, audioContext);

        // Calculate start offset
        // If participant started recording after playback began, calculate delay
        const startOffsetSeconds = this.calculateStartOffset(
          recording.startServerTime,
          playbackStartTime,
        );

        // Create stem
        const stem: RecordedStem = {
          name: `mic-${recording.userName}`,
          userName: recording.userName,
          userId: recording.userId,
          audioBuffer,
          startOffsetSeconds,
          duration: audioBuffer.duration,
          originalBlob: recording.audioBlob, // Keep original WebM for upload
        };

        stems.push(stem);

        console.log(`[RecordingToStem] Created stem for ${recording.userName}:`, {
          name: stem.name,
          duration: `${stem.duration.toFixed(2)}s`,
          offset: `${stem.startOffsetSeconds.toFixed(2)}s`,
        });
      } catch (error) {
        console.error(`[RecordingToStem] Failed to convert recording for ${recording.userName}:`, error);
      }
    }

    return stems;
  }

  /**
   * Decode WebM blob to AudioBuffer
   */
  private async decodeRecording(
    blob: Blob,
    audioContext: AudioContext,
  ): Promise<AudioBuffer> {
    // Convert blob to ArrayBuffer
    const arrayBuffer = await blob.arrayBuffer();

    // Decode audio data
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    return audioBuffer;
  }

  /**
   * Calculate start offset in seconds
   *
   * If recording started after playback, we need to add silence/offset
   * to align it with the instrumental stems.
   *
   * Example:
   * - Playback started at server time 1000
   * - Participant enabled mic and started recording at server time 1500
   * - Offset = (1500 - 1000) / 1000 = 0.5 seconds
   * - This stem should start playing 0.5s into the track
   */
  private calculateStartOffset(
    recordingStartTime: number,
    playbackStartTime: number,
  ): number {
    const offsetMs = recordingStartTime - playbackStartTime;
    const offsetSeconds = offsetMs / 1000;

    // Clamp to 0 (if recording started before playback, which shouldn't happen)
    return Math.max(0, offsetSeconds);
  }

  /**
   * Create a padded AudioBuffer with silence at the beginning
   *
   * This is used to align stems that started late.
   * For example, if a participant joined 2 seconds into playback,
   * we add 2 seconds of silence before their audio.
   *
   * @param originalBuffer - The recorded audio
   * @param offsetSeconds - Seconds of silence to add at start
   * @param audioContext - Web Audio API context
   */
  createPaddedBuffer(
    originalBuffer: AudioBuffer,
    offsetSeconds: number,
    audioContext: AudioContext,
  ): AudioBuffer {
    if (offsetSeconds <= 0) {
      return originalBuffer;
    }

    const sampleRate = originalBuffer.sampleRate;
    const offsetSamples = Math.floor(offsetSeconds * sampleRate);
    const totalLength = offsetSamples + originalBuffer.length;

    // Create new buffer with padding
    const paddedBuffer = audioContext.createBuffer(
      originalBuffer.numberOfChannels,
      totalLength,
      sampleRate,
    );

    // Copy original audio after the offset
    for (let channel = 0; channel < originalBuffer.numberOfChannels; channel++) {
      const originalData = originalBuffer.getChannelData(channel);
      const paddedData = paddedBuffer.getChannelData(channel);

      // Silence at start (already zeroed by default)
      // Copy original data after offset
      paddedData.set(originalData, offsetSamples);
    }

    return paddedBuffer;
  }
}
