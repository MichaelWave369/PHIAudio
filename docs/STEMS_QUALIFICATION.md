# Stems and Envelopes Qualification

This rung introduces semantic stem groups and ADSR amplitude shaping.

## Qualified scope

- optional ADSR envelope per tone event,
- named stems,
- per-stem gain in dB,
- isolated stem rendering,
- deterministic master summing,
- deterministic master peak limiting,
- separate WAV artifacts for every stem plus the master.

## ADSR contract

Each envelope declares:

- attack seconds,
- decay seconds,
- sustain level in the range 0..1,
- release seconds.

Attack + decay + release may not exceed the event duration.

## Stem contract

Stem names are caller-defined semantic labels such as:

- music
- bass
- voice
- fx

PHIAudio does not reserve those names. Names must simply be non-empty and unique within a render.

Each stem is rendered independently, then its configured gain is applied. The master pads shorter stems with silence and sums all stems sample-for-sample.

## Evidence

The stem package returns master pre-limit peak and limiter gain. Future receipt work will hash individual stem artifacts and bind these facts to the render plan.

## Current limitation

Each stem currently uses the qualified tone renderer, which applies its own safety limiter before stem gain. This is deterministic and safe, but it is not yet a professional floating-point DAW mix topology. A future mix-engine rung can separate raw synthesis, per-stem processing, buses, and master limiting while preserving this contract.
