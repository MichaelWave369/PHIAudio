# PHIAudio

**PHIAudio** is a sovereign, deterministic audio runtime for the Φ creative ecosystem.

It is designed to power higher-level tools such as WaveForgeStudio, ParaCut, JukeBot, Commonline, PhiOS, and agent-native creative workflows without coupling the engine to any one UI.

## Status

**v0.1.0 foundation candidate**

This repository currently defines the runtime boundary, typed contracts, deterministic receipts, tests, CI, architecture, and project lineage. Legacy PHIAudio implementation code is intentionally **not** imported yet.

## Principles

- **Engine, not studio.** PHIAudio provides audio capabilities; products decide how to present them.
- **Capability ≠ authority.** A caller being able to request an operation does not mean it is authorized to execute it.
- **Deterministic where possible.** Equivalent plans should produce stable identities and inspectable receipts.
- **Provider-independent.** Local DSP, MIDI, model-backed generation, or future providers sit behind explicit adapters.
- **Lineage first.** Inputs, plans, outputs, and transformations should remain traceable.
- **Local-first.** Network services are optional adapters, never a hidden requirement.

## Initial boundary

PHIAudio owns:

- audio render-plan contracts
- source and stem identities
- MIDI/audio render adapters
- waveform and analysis adapters
- composition adapters
- deterministic operation receipts

PHIAudio does **not** own:

- WaveForgeStudio's release/mastering UI
- ParaCut's edit timeline
- Commonline's call/session authority
- PhiOS governance policy
- arbitrary plugin execution

## Development

```bash
npm install
npm run typecheck
npm test
```

## Roadmap

1. Foundation contracts and CI.
2. Salvage and harden legacy PCM/WAV rendering.
3. Salvage MIDI export with golden-file tests.
4. Introduce stem rendering and waveform analysis.
5. Add WaveForgeStudio and ParaCut adapters.
6. Add governed provider/plugin boundaries.
7. Add real-time transport only after deterministic offline rendering is qualified.

See [Architecture](docs/ARCHITECTURE.md) and [Lineage](docs/LINEAGE.md).

## License

MIT. See [LICENSE](LICENSE).
