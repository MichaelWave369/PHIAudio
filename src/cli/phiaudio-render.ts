#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, normalize, sep } from "node:path";

import {
  digestWaveForgeBundle,
  digestWaveForgeCanonical,
  renderWaveForgeBundle,
  type WaveForgePHIAudioBundleV0,
  type WaveForgeRenderResult
} from "../adapters/waveforge.js";

type JsonNode =
  | { kind: "object"; entries: Array<[string, JsonNode]> }
  | { kind: "array"; items: JsonNode[] }
  | { kind: "string"; value: string }
  | { kind: "number"; raw: string }
  | { kind: "literal"; raw: "true" | "false" | "null" };

class JsonLexicalParser {
  private index = 0;

  constructor(private readonly text: string) {}

  parse(): JsonNode {
    const value = this.parseValue();
    this.skipWhitespace();
    if (this.index !== this.text.length) {
      throw new Error("unexpected trailing JSON content");
    }
    return value;
  }

  private skipWhitespace(): void {
    while (/\s/.test(this.text[this.index] ?? "")) this.index += 1;
  }

  private parseValue(): JsonNode {
    this.skipWhitespace();
    const char = this.text[this.index];

    if (char === "{") return this.parseObject();
    if (char === "[") return this.parseArray();
    if (char === '"') return { kind: "string", value: this.parseString() };

    for (const literal of ["true", "false", "null"] as const) {
      if (this.text.startsWith(literal, this.index)) {
        this.index += literal.length;
        return { kind: "literal", raw: literal };
      }
    }

    const match = this.text.slice(this.index).match(
      /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/
    );
    if (!match) throw new Error(`invalid JSON token at offset ${this.index}`);
    this.index += match[0].length;
    return { kind: "number", raw: match[0] };
  }

  private parseString(): string {
    const start = this.index;
    this.index += 1;
    let escaped = false;

    while (this.index < this.text.length) {
      const char = this.text[this.index];
      if (!escaped && char === '"') {
        this.index += 1;
        return JSON.parse(this.text.slice(start, this.index)) as string;
      }
      if (!escaped && char === "\\") {
        escaped = true;
      } else {
        escaped = false;
      }
      this.index += 1;
    }

    throw new Error("unterminated JSON string");
  }

  private parseObject(): JsonNode {
    this.index += 1;
    const entries: Array<[string, JsonNode]> = [];
    this.skipWhitespace();

    if (this.text[this.index] === "}") {
      this.index += 1;
      return { kind: "object", entries };
    }

    while (true) {
      this.skipWhitespace();
      if (this.text[this.index] !== '"') {
        throw new Error("object key must be a string");
      }
      const key = this.parseString();
      this.skipWhitespace();
      if (this.text[this.index] !== ":") throw new Error("missing object colon");
      this.index += 1;
      entries.push([key, this.parseValue()]);
      this.skipWhitespace();

      const char = this.text[this.index];
      if (char === "}") {
        this.index += 1;
        return { kind: "object", entries };
      }
      if (char !== ",") throw new Error("missing object comma");
      this.index += 1;
    }
  }

  private parseArray(): JsonNode {
    this.index += 1;
    const items: JsonNode[] = [];
    this.skipWhitespace();

    if (this.text[this.index] === "]") {
      this.index += 1;
      return { kind: "array", items };
    }

    while (true) {
      items.push(this.parseValue());
      this.skipWhitespace();
      const char = this.text[this.index];
      if (char === "]") {
        this.index += 1;
        return { kind: "array", items };
      }
      if (char !== ",") throw new Error("missing array comma");
      this.index += 1;
    }
  }
}

function canonicalizeLexical(
  node: JsonNode,
  options: { omitRootKey?: string; isRoot?: boolean } = {}
): string {
  switch (node.kind) {
    case "number":
    case "literal":
      return node.raw;
    case "string":
      return JSON.stringify(node.value);
    case "array":
      return `[${node.items.map((item) => canonicalizeLexical(item)).join(",")}]`;
    case "object": {
      const entries = node.entries
        .filter(
          ([key]) =>
            !(options.isRoot === true && key === options.omitRootKey)
        )
        .sort(([a], [b]) => a.localeCompare(b));

      return `{${entries
        .map(
          ([key, value]) =>
            `${JSON.stringify(key)}:${canonicalizeLexical(value)}`
        )
        .join(",")}}`;
    }
  }
}

export function digestWaveForgeSerializedBundle(rawJson: string): string {
  const root = new JsonLexicalParser(rawJson).parse();
  if (root.kind !== "object") {
    throw new Error("WaveForge bundle must be a JSON object");
  }

  const canonical = canonicalizeLexical(root, {
    omitRootKey: "receipt",
    isRoot: true
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function parseAndVerifyWaveForgeBundle(
  rawJson: string
): WaveForgePHIAudioBundleV0 {
  const value = JSON.parse(rawJson) as WaveForgePHIAudioBundleV0;

  if (!value || value.schema !== "waveforge.phiaudio_bundle.v0") {
    throw new Error("unsupported WaveForge PHIAudio bundle schema");
  }

  const expected = value.receipt?.bundle_hash;
  if (!expected || !/^[a-f0-9]{64}$/.test(expected)) {
    throw new Error("WaveForge receipt bundle_hash is missing or invalid");
  }

  const actual = digestWaveForgeSerializedBundle(rawJson);
  if (actual !== expected) {
    throw new Error(
      `WaveForge serialized bundle hash mismatch: expected ${expected}, got ${actual}`
    );
  }

  return value;
}

function safeRelativeOutput(value: string): string {
  if (!value || isAbsolute(value)) {
    throw new Error("output path must be a non-empty relative path");
  }
  const normalized = normalize(value);
  if (
    normalized === ".." ||
    normalized.startsWith(`..${sep}`) ||
    normalized.split(sep).includes("..")
  ) {
    throw new Error("output path traversal is not allowed");
  }
  return normalized;
}

function safeStemFilename(id: string): string {
  const name = id.replace(/[^A-Za-z0-9._-]/g, "_");
  if (!name || name === "." || name === "..") {
    throw new Error(`unsafe stem id: ${id}`);
  }
  return `${name}.wav`;
}

export async function renderWaveForgeBundleFile(input: {
  bundlePath: string;
  outputDir: string;
  operatorEnabled: boolean;
  sampleRate?: 44100 | 48000 | 96000;
  cwd?: string;
}): Promise<WaveForgeRenderResult> {
  if (input.operatorEnabled !== true) {
    throw new Error("PHIAudio rendering requires --enable-phiaudio");
  }

  const raw = await readFile(input.bundlePath, "utf8");
  const bundle = parseAndVerifyWaveForgeBundle(raw);
  const originalBundleHash = bundle.receipt.bundle_hash;

  // #6 validated object-semantics. Real WaveForge JSON can carry Python float
  // tokens such as 0.0 that JSON.parse normalizes to 0. After lexical
  // verification above, use an internal digest only to pass the object API.
  const normalizedBundle = structuredClone(bundle);
  normalizedBundle.receipt.bundle_hash = digestWaveForgeBundle(normalizedBundle);

  const rendered = renderWaveForgeBundle(normalizedBundle, {
    operatorEnabled: true,
    ...(input.sampleRate ? { sampleRate: input.sampleRate } : {})
  });

  rendered.manifest.sourceBundleHash = originalBundleHash;
  rendered.manifestDigest = digestWaveForgeCanonical(rendered.manifest);

  const outputDir = safeRelativeOutput(input.outputDir);
  const root = join(input.cwd ?? process.cwd(), outputDir);
  const stemsDir = join(root, "stems");
  await mkdir(stemsDir, { recursive: true });

  await writeFile(join(root, "master.wav"), rendered.masterWav);

  const used = new Set<string>();
  for (const [id, bytes] of Object.entries(rendered.stemWavs)) {
    const filename = safeStemFilename(id);
    if (used.has(filename)) {
      throw new Error(`stem filename collision after sanitization: ${filename}`);
    }
    used.add(filename);
    await writeFile(join(stemsDir, filename), bytes);
  }

  const receipt = {
    schemaVersion: "phiaudio.waveforge-cli-receipt.v0.1",
    sourceBundleHash: originalBundleHash,
    renderManifestDigest: rendered.manifestDigest,
    outputRoot: outputDir.replaceAll("\\", "/"),
    files: [
      {
        id: "master",
        path: `${outputDir.replaceAll("\\", "/")}/master.wav`,
        sha256: rendered.manifest.master.sha256,
        sizeBytes: rendered.manifest.master.sizeBytes
      },
      ...rendered.manifest.stems.map((stem) => ({
        id: stem.id,
        path:
          `${outputDir.replaceAll("\\", "/")}/stems/` +
          safeStemFilename(stem.id),
        sha256: stem.sha256,
        sizeBytes: stem.sizeBytes
      }))
    ]
  };

  await writeFile(
    join(root, "phiaudio_render_manifest.json"),
    JSON.stringify(rendered.manifest, null, 2) + "\n",
    "utf8"
  );
  await writeFile(
    join(root, "phiaudio_render_receipt.json"),
    JSON.stringify(
      {
        ...receipt,
        receiptDigest: digestWaveForgeCanonical(receipt)
      },
      null,
      2
    ) + "\n",
    "utf8"
  );

  return rendered;
}

function parseArgs(args: readonly string[]): {
  bundlePath: string;
  outputDir: string;
  operatorEnabled: boolean;
  sampleRate?: 44100 | 48000 | 96000;
} {
  let bundlePath = "";
  let outputDir = "";
  let operatorEnabled = false;
  let sampleRate: 44100 | 48000 | 96000 | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--bundle") {
      bundlePath = args[++i] ?? "";
    } else if (arg === "--out") {
      outputDir = args[++i] ?? "";
    } else if (arg === "--enable-phiaudio") {
      operatorEnabled = true;
    } else if (arg === "--sample-rate") {
      const value = Number(args[++i]);
      if (![44100, 48000, 96000].includes(value)) {
        throw new Error("sample rate must be 44100, 48000, or 96000");
      }
      sampleRate = value as 44100 | 48000 | 96000;
    } else {
      throw new Error(`unknown argument: ${arg ?? ""}`);
    }
  }

  if (!bundlePath) throw new Error("--bundle is required");
  if (!outputDir) throw new Error("--out is required");

  return {
    bundlePath,
    outputDir,
    operatorEnabled,
    ...(sampleRate ? { sampleRate } : {})
  };
}

async function main(): Promise<void> {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = await renderWaveForgeBundleFile(args);
    process.stdout.write(
      JSON.stringify({
        status: "rendered",
        manifestDigest: result.manifestDigest,
        masterSha256: result.manifest.master.sha256,
        stemCount: result.manifest.stemCount
      }) + "\n"
    );
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await main();
}
