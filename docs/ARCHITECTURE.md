# PHIAudio Architecture

## Role

PHIAudio is the audio execution/runtime layer, not the editing or release UI.

```text
Human / Agent
      |
      v
Host product
(WaveForgeStudio / ParaCut / JukeBot / PhiOS)
      |
      v
Authority + capability boundary
      |
      v
AudioRenderPlan
      |
      v
PHIAudio
  |-- core contracts
  |-- render adapters
  |-- MIDI
  |-- stems
  |-- waveform/analysis
  |-- composition providers
      |
      v
Audio artifacts + receipts
```

## Planned modules

- `core`: identities, plans, receipts, validation
- `render`: deterministic offline audio rendering
- `midi`: standards-compliant MIDI read/write
- `waveform`: waveform and energy analysis
- `composition`: deterministic and provider-backed composition
- `adapters/waveforge`: WaveForgeStudio integration
- `adapters/paracut`: edit-time waveform/cue integration
- `adapters/phios`: governed PhiOS capability surface
- `adapters/commonline`: voice/session media handoff

## Non-goals

PHIAudio does not own a DAW UI, a video timeline, account auth, cloud storage, or unrestricted dynamic plugin execution.

## Receipts

Every executable plan should eventually produce a receipt binding:

- normalized plan identity
- input asset hashes
- engine/provider identity
- parameters
- output hashes
- warnings and fallbacks
- timing/performance evidence

The v0.1 foundation begins with deterministic plan hashing. Output evidence lands in later rungs.
