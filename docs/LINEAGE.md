# Lineage

PHIAudio is a clean-room continuation of an earlier PHIAudio Production Suite prototype.

The legacy prototype demonstrated useful ideas including:

- PCM/WAV rendering
- stem rendering
- MIDI generation
- waveform/energy data
- composition and conductor concepts
- camera/pose-to-musical-state experiments
- adapters for PhiOS and PHIVid

The old implementation is treated as **reference material**, not authoritative source.

## Salvage policy

Legacy code enters this repository only when it is:

1. understood,
2. covered by deterministic tests,
3. corrected where necessary,
4. placed behind the modern runtime boundary,
5. documented with provenance.

Known historical issues include malformed or incomplete source files, absent test coverage, and at least one incorrect WAV header calculation in an older renderer. Those defects are reasons to salvage selectively rather than import the archive wholesale.

## Relationship to the current ecosystem

The intended primary relationship is:

```text
WaveForgeStudio -> PHIAudio
```

PHIAudio remains independently callable so ParaCut, JukeBot, Commonline, PhiOS, and other runtimes can use the same engine without duplicating audio logic.
