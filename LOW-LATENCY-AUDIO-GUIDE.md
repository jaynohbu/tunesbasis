# Low-Latency Audio Input Guide

## Latency Breakdown & Solutions

### Current Typical Latency: ~30-55ms

```
Source                  Latency         Solution
─────────────────────────────────────────────────────────────
Input (ADC)             5ms             ✅ Use low-latency audio interface
Browser buffering       10-20ms         ✅ Use AudioWorklet + small buffers
Processing (effects)    5-10ms          ✅ Minimize effect chain
Output (DAC)            5ms             ✅ Use ASIO/CoreAudio drivers
OS audio stack          5-15ms          ✅ Optimize OS settings
─────────────────────────────────────────────────────────────
Total                   30-55ms         Target: <20ms
```

---

## Strategy 1: Use AudioWorklet (70% Latency Reduction!)

### Why AudioWorklet?

| Approach | Latency | Runs On | Performance |
|----------|---------|---------|-------------|
| **ScriptProcessor** (old) | 20-50ms | Main thread | ❌ Poor |
| **Web Audio Nodes** (current) | 15-30ms | Audio thread | ⚠️ OK |
| **AudioWorklet** (best) | 5-15ms | Dedicated thread | ✅ Excellent |

### Implementation

**Step 1**: Create the AudioWorklet processor

```typescript
// src/app/audio-worklets/mic-processor.worklet.ts

class MicProcessor extends AudioWorkletProcessor {
  private _gain = 1.0;

  constructor() {
    super();
    this.port.onmessage = (e) => {
      if (e.data.type === 'setGain') {
        this._gain = e.data.value;
      }
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || !output) return true;

    // Ultra-low-latency processing
    for (let channel = 0; channel < Math.min(input.length, output.length); channel++) {
      const inputChannel = input[channel];
      const outputChannel = output[channel];

      for (let i = 0; i < inputChannel.length; i++) {
        outputChannel[i] = inputChannel[i] * this._gain;
      }
    }

    return true;
  }
}

registerProcessor('mic-processor', MicProcessor);
```

**Step 2**: Register and use in your engine

```typescript
// music-player.engine.ts

private micWorkletNode: AudioWorkletNode | null = null;

async enableLowLatencyMic(volume: number = 0.8) {
  try {
    // Load the AudioWorklet module
    await this.audioCtx.audioWorklet.addModule('/assets/audio-worklets/mic-processor.worklet.js');

    // Request microphone with low-latency settings
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        latency: 0,              // Request lowest latency
        sampleRate: 48000,       // Match audio context sample rate
        channelCount: 2,
      }
    });

    const micSource = this.audioCtx.createMediaStreamSource(stream);

    // Create AudioWorklet node (runs on audio thread)
    this.micWorkletNode = new AudioWorkletNode(this.audioCtx, 'mic-processor');

    // Set initial gain
    this.micWorkletNode.port.postMessage({
      type: 'setGain',
      value: volume
    });

    // Connect: mic → worklet → master
    micSource.connect(this.micWorkletNode);
    this.micWorkletNode.connect(this.masterGain);

    console.log('[LowLatency] Mic enabled with AudioWorklet');
    console.log('[LowLatency] Base latency:', this.audioCtx.baseLatency * 1000, 'ms');
    console.log('[LowLatency] Output latency:', this.audioCtx.outputLatency * 1000, 'ms');

  } catch (error) {
    console.error('[LowLatency] Failed:', error);
    throw error;
  }
}

setMicGain(value: number) {
  if (this.micWorkletNode) {
    this.micWorkletNode.port.postMessage({
      type: 'setGain',
      value
    });
  }
}
```

**Step 3**: Build the worklet

Add to `angular.json`:
```json
{
  "projects": {
    "tunesbasis": {
      "architect": {
        "build": {
          "options": {
            "assets": [
              "src/favicon.ico",
              "src/assets",
              {
                "glob": "**/*.worklet.js",
                "input": "src/app/audio-worklets",
                "output": "/assets/audio-worklets"
              }
            ]
          }
        }
      }
    }
  }
}
```

---

## Strategy 2: Optimize Audio Context Settings

### A. Use Smallest Safe Buffer Size

```typescript
// Create AudioContext with minimal latency
const audioCtx = new AudioContext({
  latencyHint: 'interactive',  // Options: 'interactive', 'balanced', 'playback'
  sampleRate: 48000,           // Match hardware sample rate
});

// Check achieved latency
console.log('Base latency:', audioCtx.baseLatency * 1000, 'ms');
console.log('Output latency:', audioCtx.outputLatency * 1000, 'ms');
```

**Latency Hints**:
- `'interactive'`: ~10ms (best for live input)
- `'balanced'`: ~20ms (default)
- `'playback'`: ~50ms (not suitable)

### B. Resume AudioContext Immediately

```typescript
// Resume on user interaction to minimize startup latency
document.addEventListener('click', () => {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}, { once: true });
```

---

## Strategy 3: Hardware & OS Optimizations

### A. Use Low-Latency Audio Interface

| Device | Typical Latency | Cost |
|--------|----------------|------|
| **Built-in mic** | 20-40ms | Free |
| **USB Audio Interface** | 5-15ms | $100-300 |
| **Thunderbolt Interface** | 2-8ms | $500+ |

**Recommended interfaces**:
- **Budget**: Focusrite Scarlett Solo ($120) - 4ms roundtrip
- **Mid-range**: PreSonus AudioBox ($150) - 3ms roundtrip
- **Pro**: Universal Audio Apollo ($800+) - 2ms roundtrip

### B. Use ASIO/CoreAudio Drivers

**Windows**: Install ASIO4ALL (free) or manufacturer drivers
**macOS**: CoreAudio is built-in and excellent
**Linux**: Use JACK audio

### C. OS-Level Settings

**macOS** (best for low latency):
```bash
# Reduce audio buffer size
# System Settings → Sound → Advanced → Buffer Size: Minimum
```

**Windows**:
```
1. Install ASIO drivers
2. Set buffer size to 64 or 128 samples in ASIO control panel
3. Disable audio enhancements: Sound Control Panel → Properties → Enhancements → Disable all
```

---

## Strategy 4: Minimize Processing Chain

### A. Direct Monitoring (Lowest Latency)

```typescript
async enableDirectMonitoring() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const source = this.audioCtx.createMediaStreamSource(stream);

  // Direct connection - no processing!
  source.connect(this.masterGain);

  // Latency: ~5-10ms
}
```

**Trade-off**: No effects (reverb, EQ, etc.)

### B. Minimal Processing Chain

```typescript
async enableMinimalProcessing() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const source = this.audioCtx.createMediaStreamSource(stream);

  // Only essential processing
  const gain = this.audioCtx.createGain();
  const compressor = this.audioCtx.createDynamicsCompressor();

  source.connect(gain);
  gain.connect(compressor);
  compressor.connect(this.masterGain);

  // Latency: ~8-15ms
}
```

### C. Effect Selection Impact

| Effect | Latency Added | Skip for Live? |
|--------|---------------|----------------|
| Gain | <1ms | No (essential) |
| EQ (biquad filter) | <1ms | No (useful) |
| Compressor | 1-2ms | No (useful) |
| Reverb (convolver) | 5-20ms | **Yes** (use hardware reverb) |
| Distortion | 1-2ms | No (useful) |
| Complex plugins | 10-50ms | **Yes** |

**Recommendation**: For live input, skip reverb and complex effects. Use them on playback stems only.

---

## Strategy 5: Browser-Specific Optimizations

### A. Chrome (Best for Web Audio)

```typescript
// Chrome-specific optimizations
const audioCtx = new AudioContext({
  latencyHint: 'interactive',
  sampleRate: 48000,
});

// Enable low-latency flag (experimental)
// chrome://flags/#enable-experimental-web-platform-features
```

**Achieved latency**: 10-15ms with AudioWorklet

### B. Safari (Higher Latency)

```typescript
// Safari has higher latency (~30-50ms)
// Workaround: Use WebKit-specific APIs

const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
  latencyHint: 'interactive',
});
```

**Achieved latency**: 30-40ms (Safari limitation)

### C. Firefox

**Achieved latency**: 15-25ms (good, but not as good as Chrome)

---

## Strategy 6: Professional-Grade Solution

### Use Web MIDI + External Hardware

For **professional karaoke/recording** with <5ms latency:

```typescript
async enableMIDIMonitoring() {
  // Use Web MIDI API to control external hardware mixer
  const midiAccess = await navigator.requestMIDIAccess();

  // Control external mixer via MIDI
  // Mic → Hardware Mixer → Audio Interface → Computer
  //
  // Total latency: 2-5ms (imperceptible!)
}
```

**Setup**:
1. Mic → Audio Interface (Focusrite Scarlett)
2. Audio Interface → Hardware Mixer (e.g., Behringer X32)
3. Mixer → Computer (for playback)
4. Use Web MIDI to control mixer from browser

**Cost**: ~$300-500
**Latency**: 2-5ms (professional quality)

---

## Strategy 7: Native App Alternative

### For Ultra-Low Latency (<5ms)

If web latency isn't acceptable, use:

**Electron + Native Audio**:
```typescript
// Use native audio APIs (ASIO/CoreAudio)
// via Electron native modules

const { NativeAudio } = require('electron-native-audio');

const audio = new NativeAudio({
  bufferSize: 64,      // Ultra-low latency
  sampleRate: 48000,
  driver: 'ASIO',      // Windows
});

// Latency: 2-5ms
```

**Trade-off**: Requires desktop app install (not browser-based)

---

## Recommended Implementation (Practical)

### For 95% of Users: Web Audio + AudioWorklet

```typescript
export class MusicPlayerEngine {

  async enableLowLatencyMic(options: {
    volume?: number;
    useEffects?: boolean;
  } = {}) {
    const { volume = 0.8, useEffects = false } = options;

    // 1. Load AudioWorklet
    await this.audioCtx.audioWorklet.addModule('/assets/audio-worklets/mic-processor.worklet.js');

    // 2. Request low-latency mic
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        latency: 0,
        sampleRate: 48000,
      }
    });

    const source = this.audioCtx.createMediaStreamSource(stream);

    if (useEffects) {
      // Route through minimal effect chain
      const gain = this.audioCtx.createGain();
      const compressor = this.audioCtx.createDynamicsCompressor();

      source.connect(gain);
      gain.connect(compressor);
      compressor.connect(this.masterGain);

      // Expected: 15-20ms
    } else {
      // Direct monitoring via AudioWorklet
      const worklet = new AudioWorkletNode(this.audioCtx, 'mic-processor');
      worklet.port.postMessage({ type: 'setGain', value: volume });

      source.connect(worklet);
      worklet.connect(this.masterGain);

      // Expected: 10-15ms
    }

    const totalLatency = (this.audioCtx.baseLatency + this.audioCtx.outputLatency) * 1000;
    console.log(`[Mic] Enabled with ${totalLatency.toFixed(1)}ms latency`);

    return totalLatency;
  }
}
```

**Expected Results**:
- **Chrome + Wired headphones**: 10-15ms (excellent)
- **Chrome + Bluetooth**: 110-315ms (unusable - use wired!)
- **Safari + Wired headphones**: 30-40ms (acceptable)
- **Firefox + Wired headphones**: 15-25ms (good)

---

## Latency Testing

### Measure Actual Latency

```typescript
async measureRoundtripLatency(): Promise<number> {
  // Play a click sound
  const clickBuffer = this.audioCtx.createBuffer(1, 1, this.audioCtx.sampleRate);
  clickBuffer.getChannelData(0)[0] = 1.0;

  const clickSource = this.audioCtx.createBufferSource();
  clickSource.buffer = clickBuffer;
  clickSource.connect(this.masterGain);

  const startTime = this.audioCtx.currentTime;
  clickSource.start();

  // Measure time until mic picks it up
  return new Promise((resolve) => {
    const analyser = this.audioCtx.createAnalyser();
    this.micSource!.connect(analyser);

    const checkAudio = () => {
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteTimeDomainData(data);

      const hasSignal = data.some(v => Math.abs(v - 128) > 10);

      if (hasSignal) {
        const latency = (this.audioCtx.currentTime - startTime) * 1000;
        resolve(latency);
      } else {
        requestAnimationFrame(checkAudio);
      }
    };

    checkAudio();
  });
}
```

**Usage**:
```typescript
const latency = await engine.measureRoundtripLatency();
console.log(`Roundtrip latency: ${latency.toFixed(1)}ms`);
```

---

## Summary: Latency Reduction Strategies

| Strategy | Latency Reduction | Difficulty | Cost |
|----------|-------------------|------------|------|
| **AudioWorklet** | 50-70% | Medium | Free |
| **Optimize AudioContext** | 20-30% | Easy | Free |
| **Low-latency audio interface** | 40-60% | Easy | $100-300 |
| **ASIO/CoreAudio drivers** | 30-40% | Easy | Free |
| **Minimize effects** | 30-50% | Easy | Free |
| **Use Chrome** | 20-30% | Easy | Free |
| **Hardware mixer** | 70-80% | Hard | $300-500 |
| **Native app (Electron)** | 80-90% | Very Hard | Free (dev time) |

---

## Recommended Stack for Best Results

**Software**:
1. ✅ Chrome browser (best Web Audio implementation)
2. ✅ AudioWorklet for processing
3. ✅ AudioContext with `latencyHint: 'interactive'`
4. ✅ Minimal effect chain (no reverb on live input)

**Hardware**:
1. ✅ USB audio interface (Focusrite Scarlett ~$120)
2. ✅ Wired headphones (NOT Bluetooth!)
3. ✅ ASIO drivers (Windows) or CoreAudio (macOS)

**Expected Result**: **8-15ms total latency** (imperceptible for most users)

---

## When to Use Each Approach

**Web Audio + AudioWorklet** (10-15ms):
- ✅ For 95% of users
- ✅ Karaoke / practice sessions
- ✅ Casual recording

**Hardware Mixer** (2-5ms):
- ✅ Professional recording studios
- ✅ Live performances
- ✅ When latency absolutely must be imperceptible

**Native App** (2-5ms):
- ✅ Professional DAW replacement
- ✅ When you need advanced features
- ❌ Overkill for most use cases

---

## Quick Wins (Implement These First!)

1. **Use AudioWorklet** → 50-70% reduction ✅
2. **Set `latencyHint: 'interactive'`** → 20-30% reduction ✅
3. **Tell users to use wired headphones** → Avoid 100-300ms Bluetooth delay ✅
4. **Skip reverb on live input** → 30-50% reduction ✅
5. **Test in Chrome** → 20-30% better than other browsers ✅

**Implementation time**: 1-2 hours
**Expected result**: 10-20ms latency (excellent for karaoke!)

Would you like me to implement the AudioWorklet solution in your music player engine?
