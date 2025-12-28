import { useState, useCallback, useEffect, useRef } from 'react';
import { MicVAD, utils } from '@ricky0123/vad-web';
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
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState<string | null>(null);
  const vadRef = useRef<MicVAD | null>(null);

  useEffect(() => {
    let mounted = true;

    const initVAD = async () => {
      try {
        const vad = await MicVAD.new({
          startOnLoad: false,
          baseAssetPath: window.location.href.replace(/index\.html.*$/, ''),
          onnxWASMBasePath: window.location.href.replace(/index\.html.*$/, ''),
          onSpeechStart: () => {
            if (!mounted) return;
            setStatus('speech_detected');
            console.log('Speech started');
            onSpeechStart?.();
          },
          onFrameProcessed: (probs, frame) => {
            if (!mounted) return;
            if (frame && onAudioData) {
              const int16Data = float32ToInt16(frame);
              onAudioData(int16Data);
            }
          },
          onSpeechEnd: (audio) => {
            if (!mounted) return;
            setStatus('processing');
            console.log('Speech ended', audio.length);

            try {
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
            if (!mounted) return;
            console.log('VAD misfire');
            setStatus('listening');
          },
        });

        if (mounted) {
          vadRef.current = vad;
          setLoading(false);
        }
      } catch (err) {
        console.error('VAD initialization error:', err);
        if (mounted) {
          const errorMsg = err instanceof Error ? err.message : 'VADの初期化に失敗しました';
          setErrored(errorMsg);
          setLoading(false);
          onError?.(errorMsg);
        }
      }
    };

    initVAD();

    return () => {
      mounted = false;
      if (vadRef.current) {
        vadRef.current.destroy();
      }
    };
  }, [onSpeechStart, onSpeechEnd, onAudioData, onError]);

  const toggleListening = useCallback(async () => {
    if (!vadRef.current) return;

    try {
      if (isListening) {
        await vadRef.current.pause();
        setIsListening(false);
        setStatus('idle');
      } else {
        await vadRef.current.start();
        setIsListening(true);
        setStatus('listening');
      }
    } catch (err) {
      console.error('Toggle listening error:', err);
      const errorMsg = err instanceof Error ? err.message : 'マイクの制御に失敗しました';
      setErrored(errorMsg);
      setStatus('error');
      onError?.(errorMsg);
    }
  }, [isListening, onError]);

  return {
    status,
    isListening,
    toggleListening,
    loading,
    errored,
  };
}
