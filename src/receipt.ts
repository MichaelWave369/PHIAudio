import { createHash } from "node:crypto";
import type { AudioReceipt, AudioRenderPlan } from "./contracts.js";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, canonicalize(nested)])
    );
  }

  return value;
}

export function digestPlan(plan: AudioRenderPlan): string {
  const canonical = JSON.stringify(canonicalize(plan));
  return createHash("sha256").update(canonical).digest("hex");
}

export function createReceipt(plan: AudioRenderPlan): AudioReceipt {
  return {
    schemaVersion: "phiaudio.receipt.v0.1",
    planId: plan.id,
    planDigest: digestPlan(plan),
    operationCount: plan.operations.length,
    sourceCount: plan.sources.length
  };
}
