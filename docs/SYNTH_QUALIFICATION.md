# Deterministic Synthesis Qualification

This rung adds PHIAudio's first signal-generation and mixdown path.

## Qualified scope

- timed tone events
- sine, square, and triangle oscillators
- explicit frequency and amplitude
- equal-power stereo panning
- deterministic sample placement
- additive mixdown
- deterministic peak limiting when summed samples exceed full scale
- direct handoff into the qualified stereo PCM16 WAV encoder

## Determinism boundary

For the same:

- event list and ordering,
- sample rate,
- JavaScript runtime behavior,

the renderer produces the same floating-point sample sequence and therefore the same WAV bytes.

No random number generator, wall clock, model provider, network service, or hidden global state participates in this rung.

## Mixing policy

Pan uses an equal-power law:

- pan = -1: left only
- pan = 0: approximately -3 dB per channel
- pan = +1: right only

Events are summed. If the resulting peak exceeds 1.0, the entire mix is scaled by `1 / peak`. The pre-limit peak and applied limiter gain are returned as evidence.

This is a deterministic safety limiter, not a mastering compressor.

## Not yet qualified

- ADSR envelopes
- anti-aliased oscillators
- resampling
- filters/effects
- stem grouping
- MIDI interpretation
- sample-file playback
- plan-level gain/pan/trim operations
- real-time transport
- loudness normalization/mastering

Those capabilities should land independently with fixtures and tests.
