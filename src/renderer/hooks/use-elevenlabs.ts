import { useState, useRef, useCallback, useEffect } from 'react';

type UseElevenLabsOptions = {
  onFinalTranscript?: (text: string) => void;
};

type UseElevenLabsReturn = {
  connect: (apiKey: string) => void;
  disconnect: () => void;
  sendAudio: (audioData: Int16Array) => void;
  transcript: string;
  interimTranscript: string;
  isConnected: boolean;
  error: string | null;
  clearTranscript: () => void;
};

export const MIN_API_KEY_LENGTH = 20;
const isDebug = process.env.NODE_ENV !== 'production';

/**
 * Debug logging utility - sanitizes sensitive data
 * WARNING: Logs may contain transcript data in development mode
 */
const debugLog = (...args: unknown[]) => {
  if (!isDebug) return;

  // Sanitize API keys and sensitive data from logs
  const sanitized = args.map((arg) => {
    if (typeof arg === 'string' && arg.length > 30 && arg.includes('token')) {
      return '[SANITIZED_API_KEY]';
    }
    return arg;
  });

  console.info(...sanitized);
};

/**
 * React hook for managing ElevenLabs WebSocket connection
 * Handles real-time speech transcription via ElevenLabs Scribe v2 Realtime API
 *
 * @param options - Configuration options
 * @param options.onFinalTranscript - Callback invoked when a final transcript is received
 * @returns Connection state and control functions
 *
 * @example
 * const { connect, disconnect, sendAudio, transcript, isConnected } = useElevenLabs({
 *   onFinalTranscript: (text) => console.log('Final:', text)
 * });
 *
 * // Connect with API key
 * connect('your-elevenlabs-api-key');
 *
 * // Send audio data
 * sendAudio(int16AudioData);
 *
 * // Disconnect when done
 * disconnect();
 */
export function useElevenLabs(options: UseElevenLabsOptions = {}): UseElevenLabsReturn {
  const { onFinalTranscript } = options;
  const [isConnected, setIsConnected] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const onFinalTranscriptRef = useRef(onFinalTranscript);
  const hasErrorOccurred = useRef(false);
  const isMountedRef = useRef(true);

  // コールバックをrefで保持
  useEffect(() => {
    onFinalTranscriptRef.current = onFinalTranscript;
  }, [onFinalTranscript]);

  const connect = useCallback((apiKey: string) => {
    // Validate API key format
    if (!apiKey || apiKey.trim().length === 0) {
      setError('APIキーが無効です');
      return;
    }
    const trimmedKey = apiKey.trim();
    if (trimmedKey.length < MIN_API_KEY_LENGTH) {
      setError('APIキーの形式が正しくありません');
      return;
    }

    if (
      socketRef.current?.readyState === WebSocket.OPEN ||
      socketRef.current?.readyState === WebSocket.CONNECTING
    ) {
      debugLog('Already connected or connecting, ignoring connect request');
      return;
    }

    if (
      socketRef.current &&
      (socketRef.current.readyState === WebSocket.CLOSING ||
        socketRef.current.readyState === WebSocket.CLOSED)
    ) {
      socketRef.current = null;
    }

    try {
      // ElevenLabs Scribe v2 Realtime API
      // model_id: scribe_v2_realtime
      // audio_format: pcm_16000 (16kHz PCM)
      // language_code: ja (日本語)
      // commit_strategy: manual (手動コミット)
      const url =
        'wss://api.elevenlabs.io/v1/speech-to-text/realtime?' +
        'model_id=scribe_v2_realtime&' +
        'audio_format=pcm_16000&' +
        'language_code=ja&' +
        'commit_strategy=manual&' +
        'include_timestamps=false';

      const socket = new WebSocket(url);
      socketRef.current = socket;
      hasErrorOccurred.current = false;

      socket.onopen = () => {
        debugLog('ElevenLabs WebSocket connected');
        if (!isMountedRef.current) return; // Safety check

        // 認証メッセージを送信
        // ElevenLabsはWebSocketオープン後に認証情報を送る必要がある
        socket.send(
          JSON.stringify({
            xi_api_key: apiKey.trim(),
          })
        );

        setIsConnected(true);
        setError(null);
      };

      socket.onmessage = (event) => {
        debugLog('📩 ElevenLabs message received:', event.data);
        try {
          const data = JSON.parse(event.data);
          debugLog('📊 Parsed data:', data);

          // セッション開始メッセージ
          if (data.message_type === 'session_started') {
            debugLog('✅ Session started');
            return;
          }

          // エラーメッセージ
          if (
            data.message_type === 'error' ||
            data.message_type === 'auth_error' ||
            data.message_type === 'quota_exceeded'
          ) {
            console.error('❌ ElevenLabs error:', data);
            setError(data.message || data.error || 'ElevenLabs APIエラーが発生しました');
            return;
          }

          // 部分的な認識結果（interim）
          if (data.message_type === 'partial_transcript') {
            debugLog('🔄 Partial transcript:', data.text);
            if (data.text) {
              setInterimTranscript(data.text);
            }
            return;
          }

          // 確定された認識結果（final）
          if (
            data.message_type === 'committed_transcript' ||
            data.message_type === 'committed_transcript_with_timestamps'
          ) {
            debugLog('✅ Committed transcript:', data.text);
            if (data.text) {
              setTranscript((prev) => {
                const updated = prev + (prev ? ' ' : '') + data.text;
                debugLog('Transcript aggregation:', {
                  prev,
                  new: data.text,
                  final: updated,
                });
                return updated;
              });
              setInterimTranscript(''); // 確定したら暫定テキストはクリア
              // コールバックを呼び出し
              onFinalTranscriptRef.current?.(data.text);
            }
            return;
          }

          debugLog('⚠️  Unknown message type:', data.message_type);
        } catch (e) {
          console.error('❌ ElevenLabs parse error:', e);
        }
      };

      socket.onclose = () => {
        debugLog('ElevenLabs WebSocket closed');
        // Only update state if not already handled by error handler and still mounted
        if (isMountedRef.current && socketRef.current === socket && !hasErrorOccurred.current) {
          setIsConnected(false);
          socketRef.current = null;
        }
        hasErrorOccurred.current = false;
      };

      socket.onerror = (e) => {
        console.error('ElevenLabs WebSocket error:', e);
        hasErrorOccurred.current = true;
        if (!isMountedRef.current) return;

        setError('ElevenLabs接続エラーが発生しました');
        // Close the socket if still open
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close();
        }
        // Reset connection state
        if (socketRef.current === socket) {
          setIsConnected(false);
          socketRef.current = null;
        }
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : '接続に失敗しました');
    }
  }, []);

  const disconnect = useCallback(() => {
    const socket = socketRef.current;
    if (socket) {
      if (socket.readyState === WebSocket.OPEN) {
        // ElevenLabsには明示的なCloseメッセージはないので、そのままclose
        socket.close();
      }
      // Note: socketRef.current will be cleared in onclose handler to avoid race conditions
    }
    setIsConnected(false);
    setInterimTranscript('');
  }, []);

  const sendAudio = useCallback((audioData: Int16Array) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      debugLog(
        '🎤 Sending audio data, length:',
        audioData.length,
        'bytes:',
        audioData.buffer.byteLength
      );

      // ElevenLabsはBase64エンコードされたJSONメッセージを期待
      // Int16Array -> Base64
      const base64Audio = btoa(String.fromCharCode(...new Uint8Array(audioData.buffer)));

      const message = {
        message_type: 'input_audio_chunk',
        audio_base_64: base64Audio,
        commit: false, // 手動コミット戦略の場合、falseのままで部分認識を受信
      };

      socketRef.current.send(JSON.stringify(message));
    } else {
      console.warn(
        '⚠️  WebSocket not open, cannot send audio. State:',
        socketRef.current?.readyState
      );
    }
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
  }, []);

  // コンポーネントアンマウント時に切断
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      disconnect();
    };
  }, [disconnect]);

  return {
    connect,
    disconnect,
    sendAudio,
    transcript,
    interimTranscript,
    isConnected,
    error,
    clearTranscript,
  };
}
