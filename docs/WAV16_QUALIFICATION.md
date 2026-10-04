# PCM16 WAV Qualification

This rung introduces the first executable audio artifact encoder in modern PHIAudio.

## Qualified scope

- RIFF/WAVE container
- linear PCM format code 1
- stereo
- 16-bit signed little-endian samples
- caller-selected positive integer sample rate
- deterministic in-memory encoding
- explicit file emission

## Correctness invariants

For stereo PCM16:

- bytes per sample = 2
- channel count = 2
- block align = 4
- byte rate = sample rate × 4
- data size = frame count × 4
- RIFF chunk size = 36 + data size

Tests inspect these fields byte-for-byte and verify L/R interleaving.

## Legacy salvage note

An older PHIAudio WAV writer computed block alignment from bits rather than bytes, producing 32 instead of 4. The later legacy ProAudioRenderer corrected the calculation. Modern PHIAudio does not copy either implementation wholesale; this encoder re-establishes the format from the RIFF/WAVE invariants and locks them with tests.

## Not yet qualified

- mono
- 24-bit PCM
- 32-bit integer or float WAV
- RF64 / files larger than 4 GiB
- metadata chunks
- dithering
- resampling
- plan-level gain/pan/trim execution
- real-time playback

Those capabilities land only with their own fixtures and tests.
