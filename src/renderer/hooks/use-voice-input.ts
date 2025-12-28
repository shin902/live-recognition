import { useState, useCallback, useEffect, useRef } from 'react';
import { useMicVAD, utils } from '@ricky0123/vad-web';
import { convertFloat32ToWav } from '../utils/wav-utils';

export type VoiceInputStatus = 'idle' | 'listening' | 'speech_detected' | 'processing' | 'error';

interface UseVoiceInputProps {
  onSpeechEnd?: (blob: Blob) => void;
  onError?: (error: string) => void;
}

export function useVoiceInput({ onSpeechEnd, onError }: UseVoiceInputProps = {}) {
  const [status, setStatus] = useState<VoiceInputStatus>('idle');
  const [isListening, setIsListening] = useState(false);
  
  const vad = useMicVAD({
    startOnLoad: false,
    onSpeechStart: () => {
      setStatus('speech_detected');
      console.log('Speech started');
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
