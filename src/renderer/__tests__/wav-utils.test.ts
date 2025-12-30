import { describe, it, expect } from 'vitest';
import { convertFloat32ToWav, float32ToInt16 } from '../utils/wav-utils';

const readString = (view: DataView, offset: number, length: number) =>
  Array.from({ length }, (_, i) => String.fromCharCode(view.getUint8(offset + i))).join('');
const toArrayBuffer = async (blob: Blob) =>
  typeof (blob as Blob & { arrayBuffer?: () => Promise<ArrayBuffer> }).arrayBuffer === 'function'
    ? await (blob as Blob & { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer()
    : await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(blob);
      });

describe('convertFloat32ToWav', () => {
  it('creates a valid mono 16-bit PCM WAV blob', async () => {
    const audio = new Float32Array([0, 0.5, -0.5, 1, -1]);

    const blob = convertFloat32ToWav(audio, 16000);
    expect(blob.type).toBe('audio/wav');

    const buffer = await toArrayBuffer(blob);
    const view = new DataView(buffer);

    expect(readString(view, 0, 4)).toBe('RIFF');
    // File length = 36 + data size (not 32)
    expect(view.getUint32(4, true)).toBe(36 + audio.length * 2);
    expect(readString(view, 8, 4)).toBe('WAVE');
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint16(32, true)).toBe(2);
    expect(view.getUint16(34, true)).toBe(16);
    expect(readString(view, 36, 4)).toBe('data');
    expect(view.getUint32(40, true)).toBe(audio.length * 2);

    const pcm = [];
    for (let i = 0; i < audio.length; i++) {
      pcm.push(view.getInt16(44 + i * 2, true));
    }
    expect(pcm).toEqual(Array.from(float32ToInt16(audio)));
  });
});

describe('float32ToInt16', () => {
  it('clamps values to 16-bit signed range', () => {
    const input = new Float32Array([-1.5, -1, -0.5, 0, 0.5, 1, 1.2]);
    const result = float32ToInt16(input);

    expect(Array.from(result)).toEqual([-32768, -32768, -16384, 0, 16383, 32767, 32767]);
  });
});
