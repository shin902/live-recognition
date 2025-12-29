/**
 * WAV file format constants
 * Mono, 16-bit PCM format at specified sample rate
 */
const WAV_HEADER_SIZE = 44;
const BYTES_PER_SAMPLE = 2;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const PCM_FORMAT = 1; // Raw PCM
const MAX_AMPLITUDE_POSITIVE = 0x7fff; // 32767
const MAX_AMPLITUDE_NEGATIVE = 0x8000; // 32768

/**
 * Float32Array の音声データを WAV 形式の Blob に変換する
 * Groq Whisper API 等で利用可能なフォーマットにする
 * 
 * Format: Mono, 16-bit PCM, specified sample rate
 */
export function convertFloat32ToWav(audioData: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(WAV_HEADER_SIZE + audioData.length * BYTES_PER_SAMPLE);
  const view = new DataView(buffer);

  // RIFF identifier
  writeString(view, 0, 'RIFF');
  // file length (excluding first 8 bytes)
  view.setUint32(4, 36 + audioData.length * BYTES_PER_SAMPLE, true);
  // RIFF type
  writeString(view, 8, 'WAVE');
  // format chunk identifier
  writeString(view, 12, 'fmt ');
  // format chunk length (16 for PCM)
  view.setUint32(16, 16, true);
  // sample format (1 = PCM)
  view.setUint16(20, PCM_FORMAT, true);
  // channel count
  view.setUint16(22, CHANNELS, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sample rate * block align)
  view.setUint32(28, sampleRate * BYTES_PER_SAMPLE * CHANNELS, true);
  // block align (channel count * bytes per sample)
  view.setUint16(32, BYTES_PER_SAMPLE * CHANNELS, true);
  // bits per sample
  view.setUint16(34, BITS_PER_SAMPLE, true);
  // data chunk identifier
  writeString(view, 36, 'data');
  // data chunk length
  view.setUint32(40, audioData.length * BYTES_PER_SAMPLE, true);

  // write the PCM samples
  floatTo16BitPCM(view, WAV_HEADER_SIZE, audioData);

  return new Blob([view.buffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function floatTo16BitPCM(output: DataView, offset: number, input: Float32Array): void {
  for (let i = 0; i < input.length; i++, offset += BYTES_PER_SAMPLE) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * MAX_AMPLITUDE_NEGATIVE : s * MAX_AMPLITUDE_POSITIVE, true);
  }
}

/**
 * Float32Array (-1.0 ~ 1.0) を Int16Array (-32768 ~ 32767) に変換する
 * ストリーミング送信（WebSocket）用
 */
export function float32ToInt16(float32Audio: Float32Array): Int16Array {
  const int16Audio = new Int16Array(float32Audio.length);
  for (let i = 0; i < float32Audio.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Audio[i]));
    int16Audio[i] = s < 0 ? s * MAX_AMPLITUDE_NEGATIVE : s * MAX_AMPLITUDE_POSITIVE;
  }
  return int16Audio;
}
