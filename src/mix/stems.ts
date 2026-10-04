import { encodeStereoPcm16Wav } from "../render/wav16.js";
import {
  renderToneEvents,
  type StereoFloatBuffer,
  type ToneEvent
} from "../synth/signal.js";

export interface StemDefinition {
  name: string;
  gainDb?: number;
  events: readonly ToneEvent[];
}

export interface RenderedStem {
  name: string;
  gainDb: number;
  audio: StereoFloatBuffer;
}

export interface StemMixResult {
  sampleRate: number;
  stems: readonly RenderedStem[];
  master: StereoFloatBuffer;
}

export interface StemWavResult {
  master: Buffer;
  stems: Readonly<Record<string, Buffer>>;
  evidence: {
    masterPeakBeforeLimit: number;
    masterLimiterGain: number;
  };
}

function dbToGain(db: number): number {
  if (!Number.isFinite(db)) {
    throw new TypeError("stem gainDb must be finite");
  }
  return 10 ** (db / 20);
}

function peakOf(left: readonly number[], right: readonly number[]): number {
  let peak = 0;
  for (let index = 0; index < left.length; index += 1) {
    peak = Math.max(
      peak,
      Math.abs(left[index] ?? 0),
      Math.abs(right[index] ?? 0)
    );
  }
  return peak;
}

export function renderStems(
  definitions: readonly StemDefinition[],
  sampleRate: number
): StemMixResult {
  const names = new Set<string>();

  for (const stem of definitions) {
    if (!stem.name.trim()) {
      throw new Error("stem name must not be empty");
    }
    if (names.has(stem.name)) {
      throw new Error(`duplicate stem name: ${stem.name}`);
    }
    names.add(stem.name);
  }

  const rendered: RenderedStem[] = definitions.map((stem) => {
    const gainDb = stem.gainDb ?? 0;
    const gain = dbToGain(gainDb);
    const source = renderToneEvents(stem.events, sampleRate);

    return {
      name: stem.name,
      gainDb,
      audio: {
        ...source,
        left: source.left.map((sample) => sample * gain),
        right: source.right.map((sample) => sample * gain)
      }
    };
  });

  const frameCount = rendered.reduce(
    (maximum, stem) => Math.max(maximum, stem.audio.left.length),
    0
  );
  const left = Array<number>(frameCount).fill(0);
  const right = Array<number>(frameCount).fill(0);

  for (const stem of rendered) {
    for (let index = 0; index < frameCount; index += 1) {
      left[index] =
        (left[index] ?? 0) + (stem.audio.left[index] ?? 0);
      right[index] =
        (right[index] ?? 0) + (stem.audio.right[index] ?? 0);
    }
  }

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
    stems: rendered,
    master: {
      sampleRate,
      left,
      right,
      peakBeforeLimit,
      limiterGain
    }
  };
}

export function renderStemsToWav(
  definitions: readonly StemDefinition[],
  sampleRate: number
): StemWavResult {
  const rendered = renderStems(definitions, sampleRate);
  const stemWavs: Record<string, Buffer> = {};

  for (const stem of rendered.stems) {
    stemWavs[stem.name] = encodeStereoPcm16Wav(stem.audio);
  }

  return {
    master: encodeStereoPcm16Wav(rendered.master),
    stems: stemWavs,
    evidence: {
      masterPeakBeforeLimit: rendered.master.peakBeforeLimit,
      masterLimiterGain: rendered.master.limiterGain
    }
  };
}
