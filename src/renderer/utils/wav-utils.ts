/**
 * Float32Array の音声データを WAV 形式の Blob に変換する
 * Groq Whisper API 等で利用可能なフォーマットにする
 */
export function convertFloat32ToWav(audioData: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + audioData.length * 2);
  const view = new DataView(buffer);

  // RIFF identifier
  writeString(view, 0, 'RIFF');
  // file length
  view.setUint32(4, 32 + audioData.length * 2, true);
  // RIFF type
  writeString(view, 8, 'WAVE');
  // format chunk identifier
  writeString(view, 12, 'fmt ');
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (raw)
  view.setUint16(20, 1, true);
  // channel count
  view.setUint16(22, 1, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sample rate * block align)
  view.setUint32(28, sampleRate * 2, true);
  // block align (channel count * bytes per sample)
  view.setUint16(32, 2, true);
  // bits per sample
  view.setUint16(34, 16, true);
  // data chunk identifier
  writeString(view, 36, 'data');
  // data chunk length
  view.setUint32(40, audioData.length * 2, true);

  // write the PCM samples
  floatTo16BitPCM(view, 44, audioData);

  return new Blob([view.buffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function floatTo16BitPCM(output: DataView, offset: number, input: Float32Array): void {
  for (let i = 0; i < input.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
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
    int16Audio[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16Audio;
}
