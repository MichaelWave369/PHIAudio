import { encodeStereoPcm16Wav } from "../render/wav16.js";

export type OscillatorWaveform = "sine" | "square" | "triangle";

export interface AdsrEnvelope {
  attackSeconds: number;
  decaySeconds: number;
  sustainLevel: number;
  releaseSeconds: number;
}

export interface ToneEvent {
  startSeconds: number;
  durationSeconds: number;
  frequencyHz: number;
  amplitude: number;
  pan?: number;
  waveform?: OscillatorWaveform;
  envelope?: AdsrEnvelope;
}

export interface StereoFloatBuffer {
  sampleRate: number;
  left: number[];
  right: number[];
  peakBeforeLimit: number;
  limiterGain: number;
}

function assertFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${name} must be finite`);
  }
}

function validateEnvelope(
  envelope: AdsrEnvelope,
  durationSeconds: number,
  index: number
): void {
  const prefix = `events[${index}].envelope`;
  for (const [name, value] of Object.entries(envelope)) {
    assertFinite(`${prefix}.${name}`, value);
  }

  if (
    envelope.attackSeconds < 0 ||
    envelope.decaySeconds < 0 ||
    envelope.releaseSeconds < 0
  ) {
    throw new RangeError(`${prefix} times must be >= 0`);
  }

  if (envelope.sustainLevel < 0 || envelope.sustainLevel > 1) {
    throw new RangeError(`${prefix}.sustainLevel must be between 0 and 1`);
  }

  if (
    envelope.attackSeconds +
      envelope.decaySeconds +
      envelope.releaseSeconds >
    durationSeconds
  ) {
    throw new RangeError(`${prefix} stages exceed event duration`);
  }
}

function validateEvent(event: ToneEvent, index: number): void {
  assertFinite(`events[${index}].startSeconds`, event.startSeconds);
  assertFinite(`events[${index}].durationSeconds`, event.durationSeconds);
  assertFinite(`events[${index}].frequencyHz`, event.frequencyHz);
  assertFinite(`events[${index}].amplitude`, event.amplitude);

  if (event.startSeconds < 0) {
    throw new RangeError(`events[${index}].startSeconds must be >= 0`);
  }
  if (event.durationSeconds <= 0) {
    throw new RangeError(`events[${index}].durationSeconds must be > 0`);
  }
  if (event.frequencyHz <= 0) {
    throw new RangeError(`events[${index}].frequencyHz must be > 0`);
  }
  if (event.amplitude < 0 || event.amplitude > 1) {
    throw new RangeError(`events[${index}].amplitude must be between 0 and 1`);
  }

  const pan = event.pan ?? 0;
  assertFinite(`events[${index}].pan`, pan);
  if (pan < -1 || pan > 1) {
    throw new RangeError(`events[${index}].pan must be between -1 and 1`);
  }

  if (event.envelope) {
    validateEnvelope(event.envelope, event.durationSeconds, index);
  }
}

function oscillator(waveform: OscillatorWaveform, phaseCycles: number): number {
  const radians = phaseCycles * Math.PI * 2;

  switch (waveform) {
    case "sine":
      return Math.sin(radians);
    case "square":
      return Math.sin(radians) >= 0 ? 1 : -1;
    case "triangle":
      return (2 / Math.PI) * Math.asin(Math.sin(radians));
  }
}

function panGains(pan: number): { left: number; right: number } {
  const angle = ((pan + 1) * Math.PI) / 4;
  return {
    left: Math.cos(angle),
    right: Math.sin(angle)
  };
}

function envelopeGain(
  envelope: AdsrEnvelope | undefined,
  elapsedSeconds: number,
  durationSeconds: number
): number {
  if (!envelope) {
    return 1;
  }

  const {
    attackSeconds,
    decaySeconds,
    sustainLevel,
    releaseSeconds
  } = envelope;

  if (attackSeconds > 0 && elapsedSeconds < attackSeconds) {
    return elapsedSeconds / attackSeconds;
  }

  const decayStart = attackSeconds;
  const decayEnd = decayStart + decaySeconds;
  if (decaySeconds > 0 && elapsedSeconds < decayEnd) {
    const progress = (elapsedSeconds - decayStart) / decaySeconds;
    return 1 + (sustainLevel - 1) * progress;
  }

  const releaseStart = durationSeconds - releaseSeconds;
  if (releaseSeconds > 0 && elapsedSeconds >= releaseStart) {
    const progress = (elapsedSeconds - releaseStart) / releaseSeconds;
    return sustainLevel * Math.max(0, 1 - progress);
  }

  return sustainLevel;
}

function peakOf(left: readonly number[], right: readonly number[]): number {
  let peak = 0;

  for (let index = 0; index < left.length; index += 1) {
    const leftSample = left[index] ?? 0;
    const rightSample = right[index] ?? 0;
    peak = Math.max(peak, Math.abs(leftSample), Math.abs(rightSample));
  }

  return peak;
}

export function renderToneEvents(
  events: readonly ToneEvent[],
  sampleRate: number
): StereoFloatBuffer {
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
    throw new RangeError("sampleRate must be a positive integer");
  }

  events.forEach(validateEvent);

  const frameCount = events.reduce((maximum, event) => {
    const endFrame = Math.round(
      (event.startSeconds + event.durationSeconds) * sampleRate
    );
    return Math.max(maximum, endFrame);
  }, 0);

  const left = Array<number>(frameCount).fill(0);
  const right = Array<number>(frameCount).fill(0);

  events.forEach((event) => {
    const startFrame = Math.round(event.startSeconds * sampleRate);
    const endFrame = Math.round(
      (event.startSeconds + event.durationSeconds) * sampleRate
    );
    const waveform = event.waveform ?? "sine";
    const gains = panGains(event.pan ?? 0);

    for (let frame = startFrame; frame < endFrame; frame += 1) {
      const localFrame = frame - startFrame;
      const elapsedSeconds = localFrame / sampleRate;
      const phaseCycles = (localFrame * event.frequencyHz) / sampleRate;
      const shapedAmplitude =
        event.amplitude *
        envelopeGain(event.envelope, elapsedSeconds, event.durationSeconds);
      const sample = oscillator(waveform, phaseCycles) * shapedAmplitude;

      left[frame] = (left[frame] ?? 0) + sample * gains.left;
      right[frame] = (right[frame] ?? 0) + sample * gains.right;
    }
  });

  const peakBeforeLimit = peakOf(left, right);
  const limiterGain = peakBeforeLimit > 1 ? 1 / peakBeforeLimit : 1;

  if (limiterGain !== 1) {
    for (let index = 0; index < frameCount; index += 1) {
      left[index] = (left[index] ?? 0) * limiterGain;
      right[index] = (right[index] ?? 0) * limiterGain;
    }
  }

  return {
    sampleRate,
    left,
    right,
    peakBeforeLimit,
    limiterGain
  };
}

export function renderToneEventsToWav(
  events: readonly ToneEvent[],
  sampleRate: number
): Buffer {
  const rendered = renderToneEvents(events, sampleRate);
  return encodeStereoPcm16Wav(rendered);
}
