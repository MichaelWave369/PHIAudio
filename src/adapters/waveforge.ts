import { createHash } from "node:crypto";

import { renderBusMix, type BusMixPlan } from "../mix/buses.js";
import { encodeStereoPcm16Wav } from "../render/wav16.js";
import type { OscillatorWaveform, ToneEvent } from "../synth/signal.js";

export interface WaveForgeStemEventV0 {
  section: string;
  start: number;
  end: number;
  intensity: number;
  role: string;
}

export interface WaveForgeStemV0 {
  id: string;
  role: string;
  render_mode: string;
  events: readonly WaveForgeStemEventV0[];
}

export interface WaveForgePHIAudioBundleV0 {
  schema: "waveforge.phiaudio_bundle.v0";
  project: string;
  target_adapter: "PHIAudio";
  source_packet_hash: string;
  seed: number;
  duration_seconds: number;
  tempo_bpm: number;
  composition: {
    title: string;
    mode: unknown;
    sections: readonly unknown[];
    arrangement: readonly string[];
    sonic_palette: readonly string[];
  };
  stems: readonly WaveForgeStemV0[];
  voiceover: readonly unknown[];
  sync: Record<string, unknown>;
  visual_reference: Record<string, unknown>;
  render_targets: Record<string, string>;
  receipt: {
    schema: "waveforge.phiaudio_bridge_receipt.v0";
    bundle_hash: string;
    source_packet_hash: string;
    created_at: string;
  };
}

export interface WaveForgeRenderOptions {
  operatorEnabled: boolean;
  sampleRate?: 44100 | 48000 | 96000;
}

export interface AudioArtifactEvidence {
  id: string;
  sha256: string;
  sizeBytes: number;
  mediaType: "audio/wav";
}

export interface WaveForgeRenderManifest {
  schemaVersion: "phiaudio.waveforge-render.v0.1";
  sourceSchema: "waveforge.phiaudio_bundle.v0";
  sourcePacketHash: string;
  sourceBundleHash: string;
  sampleRate: number;
  stemCount: number;
  master: AudioArtifactEvidence;
  stems: readonly AudioArtifactEvidence[];
  masterPeakBeforeLimit: number;
  masterLimiterGain: number;
  warnings: readonly string[];
  operatorEnabled: true;
  networkUsed: false;
}

export interface WaveForgeRenderResult {
  manifest: WaveForgeRenderManifest;
  manifestDigest: string;
  masterWav: Buffer;
  stemWavs: Readonly<Record<string, Buffer>>;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, canonicalize(nested)])
    );
  }

  return value;
}

export function digestCanonical(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

export function digestWaveForgeBundle(
  bundle: WaveForgePHIAudioBundleV0
): string {
  const { receipt: _receipt, ...body } = bundle;
  return digestCanonical(body);
}

function assertSha256(value: string, field: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${field} must be a lowercase SHA-256 digest`);
  }
}

export function validateWaveForgeBundle(
  bundle: WaveForgePHIAudioBundleV0
): void {
  if (bundle.schema !== "waveforge.phiaudio_bundle.v0") {
    throw new Error("unsupported WaveForge PHIAudio bundle schema");
  }
  if (bundle.target_adapter !== "PHIAudio") {
    throw new Error("WaveForge bundle target_adapter must be PHIAudio");
  }
  if (!Number.isInteger(bundle.seed)) {
    throw new Error("WaveForge bundle seed must be an integer");
  }
  if (!Number.isFinite(bundle.duration_seconds) || bundle.duration_seconds <= 0) {
    throw new Error("WaveForge bundle duration_seconds must be > 0");
  }
  if (!Number.isFinite(bundle.tempo_bpm) || bundle.tempo_bpm <= 0) {
    throw new Error("WaveForge bundle tempo_bpm must be > 0");
  }

  assertSha256(bundle.source_packet_hash, "source_packet_hash");
  assertSha256(bundle.receipt.bundle_hash, "receipt.bundle_hash");

  if (bundle.receipt.source_packet_hash !== bundle.source_packet_hash) {
    throw new Error("WaveForge receipt source_packet_hash mismatch");
  }

  const actualBundleHash = digestWaveForgeBundle(bundle);
  if (actualBundleHash !== bundle.receipt.bundle_hash) {
    throw new Error(
      `WaveForge bundle hash mismatch: expected ${bundle.receipt.bundle_hash}, got ${actualBundleHash}`
    );
  }

  const stemIds = new Set<string>();
  for (const stem of bundle.stems) {
    if (!stem.id.trim()) throw new Error("WaveForge stem id must not be empty");
    if (stemIds.has(stem.id)) {
      throw new Error(`duplicate WaveForge stem id: ${stem.id}`);
    }
    stemIds.add(stem.id);

    for (const event of stem.events) {
      if (!Number.isFinite(event.start) || event.start < 0) {
        throw new Error(`invalid start for stem ${stem.id}`);
      }
      if (!Number.isFinite(event.end) || event.end <= event.start) {
        throw new Error(`invalid end for stem ${stem.id}`);
      }
      if (event.end > bundle.duration_seconds) {
        throw new Error(`event exceeds bundle duration for stem ${stem.id}`);
      }
      if (
        !Number.isFinite(event.intensity) ||
        event.intensity < 0 ||
        event.intensity > 1
      ) {
        throw new Error(`invalid intensity for stem ${stem.id}`);
      }
    }
  }
}

const notePool = [36, 43, 48, 55, 60, 67, 72];

function midiToHz(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

function stableByte(text: string): number {
  return createHash("sha256").update(text).digest()[0] ?? 0;
}

function waveformFor(stemId: string): OscillatorWaveform {
  const choices: readonly OscillatorWaveform[] = [
    "sine",
    "triangle",
    "square"
  ];
  return choices[stableByte(stemId) % choices.length] ?? "sine";
}

function toToneEvent(
  bundle: WaveForgePHIAudioBundleV0,
  stem: WaveForgeStemV0,
  event: WaveForgeStemEventV0,
  eventIndex: number
): ToneEvent {
  const selector = stableByte(
    `${bundle.seed}|${stem.id}|${event.section}|${event.role}|${eventIndex}`
  );
  const midi = notePool[selector % notePool.length] ?? 48;
  const panBucket = stableByte(`pan|${stem.id}`) % 5;
  const pan = [-0.7, -0.35, 0, 0.35, 0.7][panBucket] ?? 0;

  return {
    startSeconds: event.start,
    durationSeconds: event.end - event.start,
    frequencyHz: midiToHz(midi),
    amplitude: Math.min(0.7, event.intensity * 0.5),
    pan,
    waveform: waveformFor(stem.id),
    envelope: {
      attackSeconds: Math.min(0.02, (event.end - event.start) * 0.1),
      decaySeconds: Math.min(0.04, (event.end - event.start) * 0.1),
      sustainLevel: 0.7,
      releaseSeconds: Math.min(0.05, (event.end - event.start) * 0.2)
    }
  };
}

export function waveForgeBundleToBusPlan(
  bundle: WaveForgePHIAudioBundleV0,
  sampleRate: 44100 | 48000 | 96000 = 48000
): BusMixPlan {
  validateWaveForgeBundle(bundle);

  return {
    sampleRate,
    buses: [{ name: "waveforge_master" }],
    tracks: bundle.stems.map((stem) => ({
      name: stem.id,
      bus: "waveforge_master",
      events: stem.events.map((event, index) =>
        toToneEvent(bundle, stem, event, index)
      )
    }))
  };
}

function artifactEvidence(id: string, bytes: Buffer): AudioArtifactEvidence {
  return {
    id,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    sizeBytes: bytes.length,
    mediaType: "audio/wav"
  };
}

export function renderWaveForgeBundle(
  bundle: WaveForgePHIAudioBundleV0,
  options: WaveForgeRenderOptions
): WaveForgeRenderResult {
  if (options.operatorEnabled !== true) {
    throw new Error("WaveForge PHIAudio rendering requires operator enablement");
  }

  const sampleRate = options.sampleRate ?? 48000;
  const plan = waveForgeBundleToBusPlan(bundle, sampleRate);
  const rendered = renderBusMix(plan);

  const masterWav = encodeStereoPcm16Wav(rendered.master);
  const stemWavs: Record<string, Buffer> = {};

  for (const track of rendered.tracks) {
    stemWavs[track.name] = encodeStereoPcm16Wav(track.audio);
  }

  const warnings: string[] = [];
  if (bundle.voiceover.length > 0) warnings.push("voiceover_not_rendered");
  if (bundle.render_targets.midi === "planned") {
    warnings.push("midi_target_not_rendered");
  }

  const manifest: WaveForgeRenderManifest = {
    schemaVersion: "phiaudio.waveforge-render.v0.1",
    sourceSchema: bundle.schema,
    sourcePacketHash: bundle.source_packet_hash,
    sourceBundleHash: bundle.receipt.bundle_hash,
    sampleRate,
    stemCount: bundle.stems.length,
    master: artifactEvidence("master", masterWav),
    stems: Object.entries(stemWavs)
      .map(([id, bytes]) => artifactEvidence(id, bytes))
      .sort((a, b) => a.id.localeCompare(b.id)),
    masterPeakBeforeLimit: rendered.master.peakBeforeLimit,
    masterLimiterGain: rendered.master.limiterGain,
    warnings,
    operatorEnabled: true,
    networkUsed: false
  };

  return {
    manifest,
    manifestDigest: digestCanonical(manifest),
    masterWav,
    stemWavs
  };
}
