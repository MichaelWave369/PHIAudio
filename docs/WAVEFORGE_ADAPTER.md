# WaveForgeStudio Runtime Adapter Qualification

This rung activates the first real PHIAudio side of WaveForgeStudio's existing adapter contract.

## Existing upstream contract

WaveForgeStudio already emits:

- `waveforge.phiaudio_bundle.v0`
- `waveforge.phiaudio_bridge_receipt.v0`
- planned stem events with section timing and intensity
- source packet and bundle hashes
- a PHIAudio renderer handoff
- explicit operator-enablement and no-network governance requirements

PHIAudio consumes that contract rather than defining a parallel WaveForge schema.

## Admission gates

The adapter refuses rendering unless:

1. the bundle schema is exactly `waveforge.phiaudio_bundle.v0`,
2. the target adapter is `PHIAudio`,
3. source and bundle hashes are well formed,
4. the WaveForge bridge receipt matches the canonical bundle bytes,
5. event ranges are inside the bundle duration,
6. explicit `operatorEnabled: true` is supplied.

The adapter performs no network access.

## Reference renderer

WaveForge's current bridge describes timing, stem roles, and intensity but not literal notes or audio samples. This rung therefore uses a deterministic reference voicing policy derived from:

- WaveForge seed,
- stem id,
- section,
- role,
- event index.

It is a pilot renderer, not a claim that the generated tones are the final artistic interpretation of the WaveForge brief.

## Outputs

The adapter returns in-memory:

- master WAV,
- one WAV per WaveForge stem,
- SHA-256 and size evidence for each artifact,
- master limiter evidence,
- a deterministic render manifest and manifest digest.

Voiceover and MIDI targets remain explicitly unrendered and appear as warnings.

## Relationship to WaveForgeStudio

This fulfills the runtime side of WaveForgeStudio's currently disabled PHIAudio adapter contract while preserving the upstream rule that execution remains operator-enabled and local-first.
