export {
  PHIAUDIO_SCHEMA_VERSION,
  type AudioAssetId,
  type AudioOperation,
  type AudioPlanId,
  type AudioReceipt,
  type AudioRenderPlan,
  type AudioSource
} from "./contracts.js";

export { createReceipt, digestPlan } from "./receipt.js";

export {
  encodeStereoPcm16Wav,
  floatToPcm16,
  writeStereoPcm16Wav,
  type StereoPcm16WavInput
} from "./render/wav16.js";

export {
  applyPeakLimiter,
  renderToneEvents,
  renderToneEventsRaw,
  renderToneEventsToWav,
  type AdsrEnvelope,
  type OscillatorWaveform,
  type StereoFloatBuffer,
  type ToneEvent
} from "./synth/signal.js";

export {
  renderStems,
  renderStemsToWav,
  type RenderedStem,
  type StemDefinition,
  type StemMixResult,
  type StemWavResult
} from "./mix/stems.js";

export {
  renderBusMix,
  type BusDefinition,
  type BusMixPlan,
  type BusMixResult,
  type RenderedBus,
  type RenderedTrack,
  type TrackDefinition
} from "./mix/buses.js";

export {
  digestCanonical as digestWaveForgeCanonical,
  digestWaveForgeBundle,
  renderWaveForgeBundle,
  validateWaveForgeBundle,
  waveForgeBundleToBusPlan,
  type AudioArtifactEvidence,
  type WaveForgePHIAudioBundleV0,
  type WaveForgeRenderManifest,
  type WaveForgeRenderOptions,
  type WaveForgeRenderResult,
  type WaveForgeStemEventV0,
  type WaveForgeStemV0
} from "./adapters/waveforge.js";
