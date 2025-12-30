/**
 * 音声認識プロバイダーの設定
 */

export type SpeechProvider = 'deepgram' | 'elevenlabs';

/**
 * デフォルトで使用する音声認識プロバイダー
 * 環境変数 SPEECH_PROVIDER で上書き可能
 */
export const DEFAULT_SPEECH_PROVIDER: SpeechProvider = 'deepgram';

/**
 * 環境変数から音声認識プロバイダーを取得
 */
export function getSpeechProvider(): SpeechProvider {
  const envProvider = process.env.SPEECH_PROVIDER?.toLowerCase();
  if (envProvider === 'deepgram' || envProvider === 'elevenlabs') {
    return envProvider;
  }
  return DEFAULT_SPEECH_PROVIDER;
}
