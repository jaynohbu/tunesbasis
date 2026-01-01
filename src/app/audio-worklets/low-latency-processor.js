/**
 * Low-Latency Audio Processor
 * Runs on dedicated audio thread for minimal latency
 *
 * Place this file in: src/app/audio-worklets/low-latency-processor.js
 */

class LowLatencyProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.gain = 0.8;

    // Listen for parameter changes from main thread
    this.port.onmessage = (event) => {
      if (event.data.type === 'setGain') {
        this.gain = event.data.value;
      }
    };
  }

  static get parameterDescriptors() {
    return [
      {
        name: 'gain',
        defaultValue: 0.8,
        minValue: 0,
        maxValue: 2,
      }
    ];
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || !input.length) {
      return true;
    }

    // Get gain parameter (smoothed by Web Audio)
    const gainParam = parameters.gain;
    const isConstantGain = gainParam.length === 1;

    // Process each channel
    for (let channel = 0; channel < input.length; channel++) {
      const inputChannel = input[channel];
      const outputChannel = output[channel];

      for (let i = 0; i < inputChannel.length; i++) {
        // Apply gain with minimal processing
        const gain = isConstantGain ? gainParam[0] : gainParam[i];
        outputChannel[i] = inputChannel[i] * gain;
      }
    }

    return true; // Keep processor alive
  }
}

registerProcessor('low-latency-processor', LowLatencyProcessor);
