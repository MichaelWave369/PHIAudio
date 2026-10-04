import {
  applyPeakLimiter,
  renderToneEventsRaw,
  type StereoFloatBuffer,
  type ToneEvent
} from "../synth/signal.js";

export interface TrackDefinition {
  name: string;
  bus: string;
  gainDb?: number;
  events: readonly ToneEvent[];
}

export interface BusDefinition {
  name: string;
  gainDb?: number;
}

export interface BusMixPlan {
  sampleRate: number;
  tracks: readonly TrackDefinition[];
  buses: readonly BusDefinition[];
}

export interface RenderedTrack {
  name: string;
  bus: string;
  gainDb: number;
  audio: StereoFloatBuffer;
}

export interface RenderedBus {
  name: string;
  gainDb: number;
  audio: StereoFloatBuffer;
}

export interface BusMixResult {
  sampleRate: number;
  tracks: readonly RenderedTrack[];
  buses: readonly RenderedBus[];
  master: StereoFloatBuffer;
}

function dbToGain(db: number): number {
  if (!Number.isFinite(db)) {
    throw new TypeError("gainDb must be finite");
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

function applyGain(
  audio: StereoFloatBuffer,
  gainDb: number
): StereoFloatBuffer {
  const gain = dbToGain(gainDb);
  const left = audio.left.map((sample) => sample * gain);
  const right = audio.right.map((sample) => sample * gain);

  return {
    sampleRate: audio.sampleRate,
    left,
    right,
    peakBeforeLimit: peakOf(left, right),
    limiterGain: 1
  };
}

function sumBuffers(
  sampleRate: number,
  inputs: readonly StereoFloatBuffer[]
): StereoFloatBuffer {
  const frameCount = inputs.reduce(
    (maximum, input) => Math.max(maximum, input.left.length),
    0
  );
  const left = Array<number>(frameCount).fill(0);
  const right = Array<number>(frameCount).fill(0);

  for (const input of inputs) {
    if (input.sampleRate !== sampleRate) {
      throw new Error("all buffers must use the plan sample rate");
    }

    for (let index = 0; index < frameCount; index += 1) {
      left[index] = (left[index] ?? 0) + (input.left[index] ?? 0);
      right[index] = (right[index] ?? 0) + (input.right[index] ?? 0);
    }
  }

  return {
    sampleRate,
    left,
    right,
    peakBeforeLimit: peakOf(left, right),
    limiterGain: 1
  };
}

function assertUniqueNames(
  kind: "track" | "bus",
  names: readonly string[]
): void {
  const seen = new Set<string>();
  for (const name of names) {
    if (!name.trim()) {
      throw new Error(`${kind} name must not be empty`);
    }
    if (seen.has(name)) {
      throw new Error(`duplicate ${kind} name: ${name}`);
    }
    seen.add(name);
  }
}

export function renderBusMix(plan: BusMixPlan): BusMixResult {
  if (!Number.isInteger(plan.sampleRate) || plan.sampleRate <= 0) {
    throw new RangeError("sampleRate must be a positive integer");
  }

  assertUniqueNames("track", plan.tracks.map((track) => track.name));
  assertUniqueNames("bus", plan.buses.map((bus) => bus.name));

  const busNames = new Set(plan.buses.map((bus) => bus.name));
  for (const track of plan.tracks) {
    if (!busNames.has(track.bus)) {
      throw new Error(
        `track ${track.name} references unknown bus ${track.bus}`
      );
    }
  }

  const tracks: RenderedTrack[] = plan.tracks.map((track) => {
    const gainDb = track.gainDb ?? 0;
    return {
      name: track.name,
      bus: track.bus,
      gainDb,
      audio: applyGain(
        renderToneEventsRaw(track.events, plan.sampleRate),
        gainDb
      )
    };
  });

  const buses: RenderedBus[] = plan.buses.map((bus) => {
    const gainDb = bus.gainDb ?? 0;
    const members = tracks
      .filter((track) => track.bus === bus.name)
      .map((track) => track.audio);

    return {
      name: bus.name,
      gainDb,
      audio: applyGain(sumBuffers(plan.sampleRate, members), gainDb)
    };
  });

  const masterRaw = sumBuffers(
    plan.sampleRate,
    buses.map((bus) => bus.audio)
  );

  return {
    sampleRate: plan.sampleRate,
    tracks,
    buses,
    master: applyPeakLimiter(masterRaw)
  };
}
