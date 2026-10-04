import assert from "node:assert/strict";
import test from "node:test";

import {
  PHIAUDIO_SCHEMA_VERSION,
  createReceipt,
  digestPlan,
  type AudioRenderPlan
} from "../src/index.js";

const plan: AudioRenderPlan = {
  schemaVersion: PHIAUDIO_SCHEMA_VERSION,
  id: "plan-demo",
  createdBy: "test",
  sources: [
    {
      id: "source-a",
      uri: "file:///demo.wav",
      sha256: "abc123",
      mediaType: "audio/wav"
    }
  ],
  operations: [
    {
      kind: "gain",
      assetId: "source-a",
      gainDb: -3
    }
  ],
  output: {
    format: "wav",
    sampleRate: 48000,
    channels: 2,
    bitDepth: 24
  }
};

test("equivalent plans produce the same digest", () => {
  assert.equal(digestPlan(plan), digestPlan(structuredClone(plan)));
});

test("receipt binds plan identity and counts", () => {
  const receipt = createReceipt(plan);

  assert.equal(receipt.planId, "plan-demo");
  assert.equal(receipt.sourceCount, 1);
  assert.equal(receipt.operationCount, 1);
  assert.match(receipt.planDigest, /^[a-f0-9]{64}$/);
});
