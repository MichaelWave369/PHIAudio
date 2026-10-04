# Raw-Float Bus Mixer Qualification

This rung separates signal generation from final safety limiting.

## Why

Earlier PHIAudio stem rendering reused the public tone renderer, which applied a peak limiter before stem gain. That was deterministic, but it compressed each stem independently before the master mix.

Modern PHIAudio now exposes two paths:

- `renderToneEventsRaw()`: floating-point synthesis with no automatic limiter,
- `renderToneEvents()`: compatibility/safety path that applies the qualified peak limiter.

The stem mixer now uses the raw path internally.

## Bus topology

The new bus mixer uses:

```text
Tone events
   ↓
raw track render
   ↓
track gain
   ↓
named bus sum
   ↓
bus gain
   ↓
master sum
   ↓
ONE automatic master peak limiter
```

Track and bus names must be unique. Every track must reference a declared bus.

PHIAudio does not reserve semantic names. A host may use `music`, `voice`, `fx`, `dialogue`, `ambience`, or any other non-empty label.

## Qualified scope

- raw floating-point tone rendering,
- track gain,
- named bus routing,
- bus gain,
- deterministic zero-padding for shorter tracks,
- master summing,
- a single automatic master peak limiter.

## Not yet qualified

- sends/returns,
- sidechains,
- insert effects,
- automation curves,
- sample-file tracks,
- MIDI tracks,
- loudness normalization,
- multichannel surround,
- real-time graph mutation.

This rung is the preferred foundation for future WaveForgeStudio integration.
