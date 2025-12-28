import { useState, useCallback, useEffect, useRef } from 'react';
import { useMicVAD, utils } from '@ricky0123/vad-web';
import { convertFloat32ToWav, float32ToInt16 } from '../utils/wav-utils';

export type VoiceInputStatus = 'idle' | 'listening' | 'speech_detected' | 'processing' | 'error';

interface UseVoiceInputProps {
  onSpeechStart?: () => void;
  onSpeechEnd?: (blob: Blob) => void;
  onAudioData?: (data: Int16Array) => void;
  onError?: (error: string) => void;
}

export function useVoiceInput({ onSpeechStart, onSpeechEnd, onAudioData, onError }: UseVoiceInputProps = {}) {
  const [status, setStatus] = useState<VoiceInputStatus>('idle');
  const [isListening, setIsListening] = useState(false);
  
  const vad = useMicVAD({
    startOnLoad: false,
    onSpeechStart: () => {
      setStatus('speech_detected');
      console.log('Speech started');
      onSpeechStart?.();
    },
    onFrameProcessed: (probs, frame) => {
      // isListeningがtrueで、かつ発話中（speech_detected）の場合のみ送信する制御も可能だが、
      // ここではVADの判断に任せて、音声が入ってきたら流す形にする。
      // ただし、VADは無音時もフレームを処理するので、発話確率(probs.isSpeech)を見るか、
      // 単純に親コンポーネントで接続制御を行う。
      // Deepgramは無音を送っても問題ないので、全てのフレームを送るのが簡単。
      
      if (frame && onAudioData) {
        // Float32 -> Int16変換して送信
        const int16Data = float32ToInt16(frame);
        onAudioData(int16Data);
      }
    },
    onSpeechEnd: (audio) => {
      setStatus('processing');
      console.log('Speech ended', audio.length);
      
      try {
        // VADはデフォルトで16kHzのFloat32Arrayを返す
        const wavBlob = convertFloat32ToWav(audio, 16000);
        onSpeechEnd?.(wavBlob);
        setStatus('listening');
      } catch (err) {
        console.error('WAV conversion error:', err);
        setStatus('error');
        onError?.('音声変換に失敗しました');
      }
    },
    onVADMisfire: () => {
      console.log('VAD misfire');
      setStatus('listening');
    },
    onError: (err) => {
      console.error('VAD error:', err);
      setStatus('error');
      onError?.(err instanceof Error ? err.message : String(err));
    }
  });

  const toggleListening = useCallback(() => {
    if (isListening) {
      vad.pause();
      setIsListening(false);
      setStatus('idle');
    } else {
      vad.start();
      setIsListening(true);
      setStatus('listening');
    }
  }, [isListening, vad]);

  return {
    status,
    isListening,
    toggleListening,
    loading: vad.loading,
    errored: vad.errored,
  };
}
