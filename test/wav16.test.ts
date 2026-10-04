import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  encodeStereoPcm16Wav,
  floatToPcm16,
  writeStereoPcm16Wav
} from "../src/render/wav16.js";

test("PCM conversion clamps exact endpoints", () => {
  assert.equal(floatToPcm16(-2), -32768);
  assert.equal(floatToPcm16(-1), -32768);
  assert.equal(floatToPcm16(0), 0);
  assert.equal(floatToPcm16(1), 32767);
  assert.equal(floatToPcm16(2), 32767);
});

test("PCM conversion rejects non-finite samples", () => {
  assert.throws(() => floatToPcm16(Number.NaN), /finite/);
  assert.throws(() => floatToPcm16(Number.POSITIVE_INFINITY), /finite/);
});

test("WAV header has correct stereo PCM16 geometry", () => {
  const wav = encodeStereoPcm16Wav({
    sampleRate: 48_000,
    left: [0, 1],
    right: [0, -1]
  });

  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.readUInt32LE(4), 44);
  assert.equal(wav.toString("ascii", 8, 12), "WAVE");
  assert.equal(wav.toString("ascii", 12, 16), "fmt ");
  assert.equal(wav.readUInt32LE(16), 16);
  assert.equal(wav.readUInt16LE(20), 1);
  assert.equal(wav.readUInt16LE(22), 2);
  assert.equal(wav.readUInt32LE(24), 48_000);
  assert.equal(wav.readUInt32LE(28), 192_000);
  assert.equal(wav.readUInt16LE(32), 4);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.toString("ascii", 36, 40), "data");
  assert.equal(wav.readUInt32LE(40), 8);
  assert.equal(wav.length, 52);
});

test("WAV sample bytes are deterministic and interleaved L/R", () => {
  const wav = encodeStereoPcm16Wav({
    sampleRate: 44_100,
    left: [0, 1],
    right: [-1, 0.5]
  });

  assert.equal(wav.readInt16LE(44), 0);
  assert.equal(wav.readInt16LE(46), -32768);
  assert.equal(wav.readInt16LE(48), 32767);
  assert.equal(wav.readInt16LE(50), 16384);
});

test("WAV encoder rejects mismatched channels", () => {
  assert.throws(
    () => encodeStereoPcm16Wav({ sampleRate: 44_100, left: [0], right: [] }),
    /lengths must match/
  );
});

test("file writer emits exactly the encoded bytes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "phiaudio-wav16-"));

  try {
    const filePath = join(directory, "fixture.wav");
    const input = {
      sampleRate: 44_100,
      left: [0.25, -0.25],
      right: [-0.5, 0.5]
    };

    await writeStereoPcm16Wav(filePath, input);
    assert.deepEqual(await readFile(filePath), encodeStereoPcm16Wav(input));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
