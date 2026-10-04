import assert from "node:assert/strict";
import test from "node:test";

import {
  renderBusMix,
  renderStems,
  renderToneEventsRaw,
  type BusMixPlan
} from "../src/index.js";

test("raw synthesis preserves peaks above full scale", () => {
  const event = {
    startSeconds: 0,
    durationSeconds: 1,
    frequencyHz: 1,
    amplitude: 1,
    pan: 0 as const
  };

  const raw = renderToneEventsRaw([event, event], 8);
  assert.ok(raw.peakBeforeLimit > 1);
  assert.equal(raw.limiterGain, 1);
  assert.ok(Math.max(...raw.left.map(Math.abs)) > 1);
});

test("stems are no longer pre-limited before master sum", () => {
  const stem = renderStems(
    [
      {
        name: "music",
        events: [
          {
            startSeconds: 0,
            durationSeconds: 1,
            frequencyHz: 1,
            amplitude: 1,
            pan: 0
          },
          {
            startSeconds: 0,
            durationSeconds: 1,
            frequencyHz: 1,
            amplitude: 1,
            pan: 0
          }
        ]
      }
    ],
    8
  );

  assert.ok((stem.stems[0]?.audio.peakBeforeLimit ?? 0) > 1);
  assert.equal(stem.stems[0]?.audio.limiterGain, 1);
  assert.ok(stem.master.limiterGain < 1);
});

test("bus mixer routes tracks through declared buses", () => {
  const plan: BusMixPlan = {
    sampleRate: 8,
    buses: [
      { name: "music", gainDb: -6 },
      { name: "voice" }
    ],
    tracks: [
      {
        name: "bass",
        bus: "music",
        events: [
          {
            startSeconds: 0,
            durationSeconds: 1,
            frequencyHz: 1,
            amplitude: 1,
            pan: -1
          }
        ]
      },
      {
        name: "lead",
        bus: "music",
        events: [
          {
            startSeconds: 0,
            durationSeconds: 1,
            frequencyHz: 1,
            amplitude: 1,
            pan: 1
          }
        ]
      },
      {
        name: "vox",
        bus: "voice",
        gainDb: -6,
        events: [
          {
            startSeconds: 0,
            durationSeconds: 1,
            frequencyHz: 2,
            amplitude: 0.5,
            pan: 0
          }
        ]
      }
    ]
  };

  const result = renderBusMix(plan);

  assert.equal(result.tracks.length, 3);
  assert.equal(result.buses.length, 2);
  assert.equal(result.buses[0]?.name, "music");
  assert.equal(result.buses[1]?.name, "voice");
  assert.equal(result.master.left.length, 8);
  assert.equal(result.master.right.length, 8);
});

test("unknown bus references fail loudly", () => {
  assert.throws(
    () =>
      renderBusMix({
        sampleRate: 44_100,
        buses: [{ name: "music" }],
        tracks: [
          {
            name: "voice",
            bus: "missing",
            events: []
          }
        ]
      }),
    /unknown bus/
  );
});

test("track and bus names must be unique", () => {
  assert.throws(
    () =>
      renderBusMix({
        sampleRate: 44_100,
        buses: [{ name: "music" }, { name: "music" }],
        tracks: []
      }),
    /duplicate bus name/
  );

  assert.throws(
    () =>
      renderBusMix({
        sampleRate: 44_100,
        buses: [{ name: "music" }],
        tracks: [
          { name: "lead", bus: "music", events: [] },
          { name: "lead", bus: "music", events: [] }
        ]
      }),
    /duplicate track name/
  );
});

test("master is the only automatic limiter in bus topology", () => {
  const result = renderBusMix({
    sampleRate: 8,
    buses: [{ name: "music" }],
    tracks: [
      {
        name: "a",
        bus: "music",
        events: [
          {
            startSeconds: 0,
            durationSeconds: 1,
            frequencyHz: 1,
            amplitude: 1,
            pan: 0
          }
        ]
      },
      {
        name: "b",
        bus: "music",
        events: [
          {
            startSeconds: 0,
            durationSeconds: 1,
            frequencyHz: 1,
            amplitude: 1,
            pan: 0
          }
        ]
      }
    ]
  });

  assert.equal(result.tracks[0]?.audio.limiterGain, 1);
  assert.equal(result.tracks[1]?.audio.limiterGain, 1);
  assert.equal(result.buses[0]?.audio.limiterGain, 1);
  assert.ok((result.buses[0]?.audio.peakBeforeLimit ?? 0) > 1);
  assert.ok(result.master.limiterGain < 1);
});
