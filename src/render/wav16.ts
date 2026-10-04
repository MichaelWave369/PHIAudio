import { writeFile } from "node:fs/promises";

export interface StereoPcm16WavInput {
  sampleRate: number;
  left: readonly number[];
  right: readonly number[];
}

export function floatToPcm16(value: number): number {
  if (!Number.isFinite(value)) {
    throw new TypeError("PCM sample must be finite");
  }

  const clamped = Math.max(-1, Math.min(1, value));
  return clamped < 0
    ? Math.round(clamped * 32768)
    : Math.round(clamped * 32767);
}

export function encodeStereoPcm16Wav(input: StereoPcm16WavInput): Buffer {
  const { sampleRate, left, right } = input;

  if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
    throw new RangeError("sampleRate must be a positive integer");
  }

  if (left.length !== right.length) {
    throw new RangeError("left and right channel lengths must match");
  }

  const channelCount = 2;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = channelCount * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = left.length * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0, 4, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, 4, "ascii");
  buffer.write("fmt ", 12, 4, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channelCount, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36, 4, "ascii");
  buffer.writeUInt32LE(dataSize, 40);

  let offset = 44;
  for (let index = 0; index < left.length; index += 1) {
    const leftSample = left[index];
    const rightSample = right[index];

    if (leftSample === undefined || rightSample === undefined) {
      throw new RangeError("channel data is incomplete");
    }

    buffer.writeInt16LE(floatToPcm16(leftSample), offset);
    offset += 2;
    buffer.writeInt16LE(floatToPcm16(rightSample), offset);
    offset += 2;
  }

  return buffer;
}

export async function writeStereoPcm16Wav(
  filePath: string,
  input: StereoPcm16WavInput
): Promise<string> {
  await writeFile(filePath, encodeStereoPcm16Wav(input));
  return filePath;
}
