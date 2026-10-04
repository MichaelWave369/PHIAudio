import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  renderStems,
  renderStemsToWav,
  renderToneEvents,
  type StemDefinition
} from "../src/index.js";

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

test("ADSR attack begins at zero and reaches full level", () => {
  const rendered = renderToneEvents(
    [
      {
        startSeconds: 0,
        durationSeconds: 1,
        frequencyHz: 1,
        amplitude: 1,
        waveform: "square",
        pan: -1,
        envelope: {
          attackSeconds: 0.25,
          decaySeconds: 0.25,
          sustainLevel: 0.5,
          releaseSeconds: 0.25
        }
      }
    ],
    8
  );

  assert.equal(rendered.left[0], 0);
  assert.equal(rendered.left[2], 1);
  assert.equal(rendered.left[4], 0.5);
});

test("invalid ADSR duration is rejected", () => {
  assert.throws(
    () =>
      renderToneEvents(
        [
          {
            startSeconds: 0,
            durationSeconds: 1,
            frequencyHz: 440,
            amplitude: 1,
            envelope: {
              attackSeconds: 0.5,
              decaySeconds: 0.4,
              sustainLevel: 0.5,
              releaseSeconds: 0.2
            }
          }
        ],
        44_100
      ),
    /stages exceed/
  );
});

test("named stems remain isolated and master spans longest stem", () => {
  const stems: StemDefinition[] = [
    {
      name: "bass",
      events: [
        {
          startSeconds: 0,
          durationSeconds: 1,
          frequencyHz: 55,
          amplitude: 0.25,
          pan: -1
        }
      ]
    },
    {
      name: "lead",
      gainDb: -6,
      events: [
        {
          startSeconds: 0.5,
          durationSeconds: 1,
          frequencyHz: 440,
          amplitude: 0.25,
          pan: 1
        }
      ]
    }
  ];

  const rendered = renderStems(stems, 8);

  assert.equal(rendered.stems.length, 2);
  assert.equal(rendered.stems[0]?.name, "bass");
  assert.equal(rendered.stems[1]?.name, "lead");
  assert.equal(rendered.master.left.length, 12);
  assert.equal(rendered.master.right.length, 12);
  assert.equal(rendered.stems[0]?.audio.right[2] ?? 0, 0);
});

test("duplicate stem names fail loudly", () => {
  assert.throws(
    () =>
      renderStems(
        [
          { name: "fx", events: [] },
          { name: "fx", events: [] }
        ],
        44_100
      ),
    /duplicate stem name/
  );
});

test("stem WAV package is deterministic", () => {
  const stems: StemDefinition[] = [
    {
      name: "music",
      events: [
        {
          startSeconds: 0,
          durationSeconds: 0.05,
          frequencyHz: 220,
          amplitude: 0.4,
          waveform: "triangle",
          envelope: {
            attackSeconds: 0.005,
            decaySeconds: 0.005,
            sustainLevel: 0.7,
            releaseSeconds: 0.01
          }
        }
      ]
    },
    {
      name: "fx",
      gainDb: -3,
      events: [
        {
          startSeconds: 0.01,
          durationSeconds: 0.03,
          frequencyHz: 880,
          amplitude: 0.2,
          waveform: "square",
          pan: 0.5
        }
      ]
    }
  ];

  const first = renderStemsToWav(stems, 44_100);
  const second = renderStemsToWav(structuredClone(stems), 44_100);

  assert.equal(sha256(first.master), sha256(second.master));
  assert.equal(sha256(first.stems.music!), sha256(second.stems.music!));
  assert.equal(sha256(first.stems.fx!), sha256(second.stems.fx!));
  assert.equal(first.master.readUInt16LE(32), 4);
});
