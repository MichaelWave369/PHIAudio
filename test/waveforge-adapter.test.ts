import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  digestWaveForgeCanonical,
  renderWaveForgeBundle,
  validateWaveForgeBundle,
  waveForgeBundleToBusPlan,
  type WaveForgePHIAudioBundleV0
} from "../src/index.js";

function fixture(): WaveForgePHIAudioBundleV0 {
  const body = {
    schema: "waveforge.phiaudio_bundle.v0" as const,
    project: "WaveForgeStudio",
    target_adapter: "PHIAudio" as const,
    source_packet_hash: "1".repeat(64),
    seed: 369,
    duration_seconds: 3,
    tempo_bpm: 120,
    composition: {
      title: "WaveForge_369",
      mode: "demo",
      sections: [],
      arrangement: ["act_1", "act_2"],
      sonic_palette: ["sovereign_pulse"]
    },
    stems: [
      {
        id: "stem_bass",
        role: "texture",
        render_mode: "planned",
        events: [
          {
            section: "act_1",
            start: 0,
            end: 1.5,
            intensity: 0.5,
            role: "bass"
          },
          {
            section: "act_2",
            start: 1.5,
            end: 3,
            intensity: 1,
            role: "bass"
          }
        ]
      },
      {
        id: "stem_pulse",
        role: "rhythm",
        render_mode: "planned",
        events: [
          {
            section: "act_1",
            start: 0,
            end: 3,
            intensity: 0.7,
            role: "pulse"
          }
        ]
      }
    ],
    voiceover: [{ timestamp: 1.5, cue: "declare_intent" }],
    sync: {},
    visual_reference: {},
    render_targets: {
      mix_wav: "planned",
      stems_wav: "planned",
      midi: "planned",
      timeline_json: "planned"
    }
  };

  return {
    ...body,
    receipt: {
      schema: "waveforge.phiaudio_bridge_receipt.v0",
      bundle_hash: digestWaveForgeCanonical(body),
      source_packet_hash: body.source_packet_hash,
      created_at: "1979-03-06T03:06:09Z"
    }
  };
}

test("WaveForge bundle hash contract is accepted", () => {
  assert.doesNotThrow(() => validateWaveForgeBundle(fixture()));
});

test("tampered WaveForge bundle is rejected", () => {
  const bundle = fixture();
  bundle.stems[0]!.events[0]!.intensity = 0.9;

  assert.throws(() => validateWaveForgeBundle(bundle), /bundle hash mismatch/);
});

test("operator enablement is mandatory", () => {
  assert.throws(
    () => renderWaveForgeBundle(fixture(), { operatorEnabled: false }),
    /operator enablement/
  );
});

test("WaveForge bundle maps to named PHIAudio tracks", () => {
  const plan = waveForgeBundleToBusPlan(fixture());

  assert.equal(plan.sampleRate, 48000);
  assert.deepEqual(
    plan.tracks.map((track) => track.name),
    ["stem_bass", "stem_pulse"]
  );
  assert.equal(plan.buses[0]?.name, "waveforge_master");
});

test("same WaveForge bundle produces identical artifact hashes", () => {
  const first = renderWaveForgeBundle(fixture(), { operatorEnabled: true });
  const second = renderWaveForgeBundle(fixture(), { operatorEnabled: true });

  assert.equal(first.manifestDigest, second.manifestDigest);
  assert.equal(
    createHash("sha256").update(first.masterWav).digest("hex"),
    createHash("sha256").update(second.masterWav).digest("hex")
  );
  assert.equal(first.manifest.stemCount, 2);
  assert.equal(first.manifest.master.mediaType, "audio/wav");
  assert.deepEqual(first.manifest.warnings, [
    "voiceover_not_rendered",
    "midi_target_not_rendered"
  ]);
  assert.equal(first.manifest.networkUsed, false);
  assert.equal(first.manifest.operatorEnabled, true);
});
