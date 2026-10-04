import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  renderToneEvents,
  renderToneEventsToWav,
  type ToneEvent
} from "../src/index.js";

function approx(actual: number, expected: number, epsilon = 1e-12): void {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`
  );
}

test("center-panned sine uses equal-power gains", () => {
  const rendered = renderToneEvents(
    [
      {
        startSeconds: 0,
        durationSeconds: 1,
        frequencyHz: 1,
        amplitude: 1,
        pan: 0,
        waveform: "sine"
      }
    ],
    8
  );

  assert.equal(rendered.left.length, 8);
  approx(rendered.left[2] ?? 0, Math.SQRT1_2);
  approx(rendered.right[2] ?? 0, Math.SQRT1_2);
  assert.equal(rendered.limiterGain, 1);
});

test("hard pan routes a tone to only one channel", () => {
  const left = renderToneEvents(
    [
      {
        startSeconds: 0,
        durationSeconds: 1,
        frequencyHz: 1,
        amplitude: 1,
        pan: -1
      }
    ],
    8
  );

  approx(left.left[2] ?? 0, 1);
  approx(left.right[2] ?? 0, 0, 1e-15);
});

test("overlapping tones are deterministically limited", () => {
  const event: ToneEvent = {
    startSeconds: 0,
    durationSeconds: 1,
    frequencyHz: 1,
    amplitude: 1,
    pan: 0
  };

  const rendered = renderToneEvents([event, event], 8);

  assert.ok(rendered.peakBeforeLimit > 1);
  assert.ok(rendered.limiterGain < 1);

  const finalPeak = Math.max(
    ...rendered.left.map(Math.abs),
    ...rendered.right.map(Math.abs)
  );
  approx(finalPeak, 1);
});

test("timing creates deterministic silence before an event", () => {
  const rendered = renderToneEvents(
    [
      {
        startSeconds: 0.5,
        durationSeconds: 0.5,
        frequencyHz: 2,
        amplitude: 0.5
      }
    ],
    8
  );

  assert.deepEqual(rendered.left.slice(0, 4), [0, 0, 0, 0]);
  assert.equal(rendered.left.length, 8);
});

test("same synthetic plan yields identical WAV bytes", () => {
  const events: ToneEvent[] = [
    {
      startSeconds: 0,
      durationSeconds: 0.05,
      frequencyHz: 440,
      amplitude: 0.5,
      pan: -0.25,
      waveform: "sine"
    },
    {
      startSeconds: 0.01,
      durationSeconds: 0.04,
      frequencyHz: 660,
      amplitude: 0.25,
      pan: 0.5,
      waveform: "triangle"
    }
  ];

  const first = renderToneEventsToWav(events, 44_100);
  const second = renderToneEventsToWav(structuredClone(events), 44_100);

  assert.deepEqual(first, second);
  assert.equal(first.toString("ascii", 0, 4), "RIFF");
  assert.equal(first.readUInt16LE(32), 4);

  const digestA = createHash("sha256").update(first).digest("hex");
  const digestB = createHash("sha256").update(second).digest("hex");
  assert.equal(digestA, digestB);
});

test("invalid synthesis parameters fail loudly", () => {
  assert.throws(
    () =>
      renderToneEvents(
        [
          {
            startSeconds: 0,
            durationSeconds: 1,
            frequencyHz: 0,
            amplitude: 1
          }
        ],
        44_100
      ),
    /frequencyHz/
  );

  assert.throws(
    () =>
      renderToneEvents(
        [
          {
            startSeconds: 0,
            durationSeconds: 1,
            frequencyHz: 440,
            amplitude: 1.2
          }
        ],
        44_100
      ),
    /amplitude/
  );
});
