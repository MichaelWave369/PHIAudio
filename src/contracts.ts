export const PHIAUDIO_SCHEMA_VERSION = "phiaudio.plan.v0.1" as const;

export type AudioAssetId = string;
export type AudioPlanId = string;

export type AudioOperation =
  | {
      kind: "gain";
      assetId: AudioAssetId;
      gainDb: number;
    }
  | {
      kind: "pan";
      assetId: AudioAssetId;
      pan: number;
    }
  | {
      kind: "trim";
      assetId: AudioAssetId;
      startSeconds: number;
      endSeconds: number;
    }
  | {
      kind: "normalize";
      assetId: AudioAssetId;
      targetPeakDb: number;
    };

export interface AudioSource {
  id: AudioAssetId;
  uri: string;
  sha256?: string;
  mediaType?: string;
}

export interface AudioRenderPlan {
  schemaVersion: typeof PHIAUDIO_SCHEMA_VERSION;
  id: AudioPlanId;
  createdBy: string;
  sources: readonly AudioSource[];
  operations: readonly AudioOperation[];
  output: {
    format: "wav";
    sampleRate: 44100 | 48000 | 96000;
    channels: 1 | 2;
    bitDepth: 16 | 24 | 32;
  };
}

export interface AudioReceipt {
  schemaVersion: "phiaudio.receipt.v0.1";
  planId: AudioPlanId;
  planDigest: string;
  operationCount: number;
  sourceCount: number;
}
