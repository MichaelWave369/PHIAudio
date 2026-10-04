import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  digestWaveForgeSerializedBundle,
  parseAndVerifyWaveForgeBundle
} from "../src/cli/phiaudio-render.js";

const PYTHON_STYLE_BODY = `{
  "schema": "waveforge.phiaudio_bundle.v0",
  "project": "WaveForgeStudio",
  "target_adapter": "PHIAudio",
  "source_packet_hash": "${"1".repeat(64)}",
  "seed": 369,
  "duration_seconds": 3,
  "tempo_bpm": 120,
  "composition": {
    "title": "WaveForge_369_\\u03a6",
    "mode": "demo",
    "sections": [
      {"name": "act_1", "start": 0.0, "end": 1.5},
      {"name": "act_2", "start": 1.5, "end": 3.0}
    ],
    "arrangement": ["act_1", "act_2"],
    "sonic_palette": ["sovereign_pulse"]
  },
  "stems": [{
    "id": "stem_bass",
    "role": "texture",
    "render_mode": "planned",
    "events": [
      {"section": "act_1", "start": 0.0, "end": 1.5, "intensity": 0.5, "role": "bass"},
      {"section": "act_2", "start": 1.5, "end": 3.0, "intensity": 1.0, "role": "bass"}
    ]
  }],
  "voiceover": [{"timestamp": 1.5, "cue": "declare_intent"}],
  "sync": {},
  "visual_reference": {},
  "render_targets": {
    "mix_wav": "planned",
    "stems_wav": "planned",
    "midi": "planned",
    "timeline_json": "planned"
  }
}`;

const PYTHON_DIGEST =
  "7ba40468545cd703d98ec7eceb4a0f701a802836b1c71bc288c9f50b7a58b4c5";

function bundleText(): string {
  const body = PYTHON_STYLE_BODY.trim();
  return body.slice(0, -1) + `,
  "receipt": {
    "schema": "waveforge.phiaudio_bridge_receipt.v0",
    "bundle_hash": "${PYTHON_DIGEST}",
    "source_packet_hash": "${"1".repeat(64)}",
    "created_at": "1979-03-06T03:06:09Z"
  }
}`;
}

test("serialized verifier matches Python canonical digest with float tokens", () => {
  assert.equal(
    digestWaveForgeSerializedBundle(bundleText()),
    PYTHON_DIGEST
  );
  assert.equal(
    parseAndVerifyWaveForgeBundle(bundleText()).receipt.bundle_hash,
    PYTHON_DIGEST
  );
});

test("serialized verifier rejects changed bytes", () => {
  const tampered = bundleText().replace(
    '"intensity": 0.5',
    '"intensity": 0.6'
  );
  assert.throws(
    () => parseAndVerifyWaveForgeBundle(tampered),
    /serialized bundle hash mismatch/
  );
});

test("phiaudio-render CLI requires explicit enablement", async () => {
  const directory = await mkdtemp(join(tmpdir(), "phiaudio-cli-disabled-"));
  try {
    const bundlePath = join(directory, "bundle.json");
    await writeFile(bundlePath, bundleText(), "utf8");
    const cli = join(process.cwd(), "dist/src/cli/phiaudio-render.js");

    const result = spawnSync(
      process.execPath,
      [cli, "--bundle", bundlePath, "--out", "render"],
      { cwd: directory, encoding: "utf8" }
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /--enable-phiaudio/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("phiaudio-render CLI writes deterministic master, stems, and receipts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "phiaudio-cli-"));
  try {
    const bundlePath = join(directory, "bundle.json");
    await writeFile(bundlePath, bundleText(), "utf8");
    const cli = join(process.cwd(), "dist/src/cli/phiaudio-render.js");

    const result = spawnSync(
      process.execPath,
      [
        cli,
        "--bundle",
        bundlePath,
        "--out",
        "render/phiaudio",
        "--enable-phiaudio",
        "--sample-rate",
        "48000"
      ],
      { cwd: directory, encoding: "utf8" }
    );

    assert.equal(result.status, 0, result.stderr);

    const manifest = JSON.parse(
      await readFile(
        join(directory, "render/phiaudio/phiaudio_render_manifest.json"),
        "utf8"
      )
    );
    const receipt = JSON.parse(
      await readFile(
        join(directory, "render/phiaudio/phiaudio_render_receipt.json"),
        "utf8"
      )
    );

    assert.equal(manifest.sourceBundleHash, PYTHON_DIGEST);
    assert.match(manifest.master.sha256, /^[a-f0-9]{64}$/);
    assert.equal(manifest.stemCount, 1);
    assert.match(receipt.receiptDigest, /^[a-f0-9]{64}$/);

    const master = await readFile(join(directory, "render/phiaudio/master.wav"));
    const stem = await readFile(
      join(directory, "render/phiaudio/stems/stem_bass.wav")
    );
    assert.equal(master.toString("ascii", 0, 4), "RIFF");
    assert.equal(stem.toString("ascii", 0, 4), "RIFF");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("output traversal is rejected", async () => {
  const directory = await mkdtemp(join(tmpdir(), "phiaudio-cli-traversal-"));
  try {
    const bundlePath = join(directory, "bundle.json");
    await writeFile(bundlePath, bundleText(), "utf8");
    const cli = join(process.cwd(), "dist/src/cli/phiaudio-render.js");

    const result = spawnSync(
      process.execPath,
      [
        cli,
        "--bundle",
        bundlePath,
        "--out",
        "../escape",
        "--enable-phiaudio"
      ],
      { cwd: directory, encoding: "utf8" }
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /traversal/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
