import { useState, useRef, useCallback, useEffect } from 'react';

type UseDeepgramOptions = {
  onFinalTranscript?: (text: string) => void;
};

type UseDeepgramReturn = {
  connect: (apiKey: string) => void;
  disconnect: () => void;
  sendAudio: (audioData: Int16Array) => void;
  transcript: string;
  interimTranscript: string;
  isConnected: boolean;
  error: string | null;
  clearTranscript: () => void;
};

export const KEEPALIVE_INTERVAL_MS = 10000;
export const MIN_API_KEY_LENGTH = 20;
// Deepgram API keys are typically 40 character hex strings
const DEEPGRAM_API_KEY_PATTERN = /^[a-f0-9]{40}$/i;
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
  
  console.log(...sanitized);
};

/**
 * React hook for managing Deepgram WebSocket connection
 * Handles real-time speech transcription via Deepgram's streaming API
 * 
 * @param options - Configuration options
 * @param options.onFinalTranscript - Callback invoked when a final transcript is received
 * @returns Connection state and control functions
 * 
 * @example
 * const { connect, disconnect, sendAudio, transcript, isConnected } = useDeepgram({
 *   onFinalTranscript: (text) => console.log('Final:', text)
 * });
 * 
 * // Connect with API key
 * connect('your-deepgram-api-key');
 * 
 * // Send audio data
 * sendAudio(int16AudioData);
 * 
 * // Disconnect when done
 * disconnect();
 */
export function useDeepgram(options: UseDeepgramOptions = {}): UseDeepgramReturn {
  const { onFinalTranscript } = options;
  const [isConnected, setIsConnected] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const keepAliveIntervalRef = useRef<{ socket: WebSocket; id: NodeJS.Timeout } | null>(null);
  const onFinalTranscriptRef = useRef(onFinalTranscript);
  const hasErrorOccurred = useRef(false);
  const isMountedRef = useRef(true);

  // コールバックをrefで保持
  useEffect(() => {
    onFinalTranscriptRef.current = onFinalTranscript;
  }, [onFinalTranscript]);

  /**
   * Helper function to safely clear keepalive interval
   * Only clears if the socket matches to prevent race conditions
   */
  const clearKeepalive = useCallback((socket: WebSocket) => {
    if (keepAliveIntervalRef.current?.socket === socket) {
      clearInterval(keepAliveIntervalRef.current.id);
      keepAliveIntervalRef.current = null;
    }
  }, []);

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
    // Validate Deepgram API key format (40 hex characters)
    if (!DEEPGRAM_API_KEY_PATTERN.test(trimmedKey)) {
      setError('Deepgram APIキーの形式が正しくありません（40文字の16進数である必要があります）');
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
      // nova-2 model, 日本語, スマートフォーマット有効
      const url =
        'wss://api.deepgram.com/v1/listen?model=nova-2&language=ja&smart_format=true&interim_results=true&encoding=linear16&sample_rate=16000';

      const socket = new WebSocket(url, ['token', apiKey]);
      socketRef.current = socket;
      hasErrorOccurred.current = false;

      socket.onopen = () => {
        debugLog('Deepgram WebSocket connected');
        if (!isMountedRef.current) return; // Safety check
        
        setIsConnected(true);
        setError(null);

        // Clear any existing keepalive interval to prevent race conditions
        clearKeepalive(socket);

        // KeepAlive (10秒ごとに送信)
        const id = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'KeepAlive' }));
          }
        }, KEEPALIVE_INTERVAL_MS);
        keepAliveIntervalRef.current = { socket, id };
      };

      socket.onmessage = (event) => {
        debugLog('📩 Deepgram message received:', event.data);
        try {
          const data = JSON.parse(event.data);
          debugLog('📊 Parsed data:', data);

          // メタデータなどはスキップ
          if (data.type === 'Metadata') {
            debugLog('⏭️  Skipping metadata');
            return;
          }

          const result = data.channel?.alternatives?.[0];
          debugLog('🔍 Extracted result:', result);
          debugLog('🎯 is_final:', data.is_final);

          if (result && result.transcript) {
            debugLog('📝 Transcript found:', result.transcript);
            if (data.is_final) {
              debugLog('✅ Final transcript:', result.transcript);
              setTranscript((prev) => {
                const updated = prev + (prev ? ' ' : '') + result.transcript;
                debugLog('Transcript aggregation:', { prev, new: result.transcript, final: updated });
                return updated;
              });
              setInterimTranscript(''); // 確定したら暫定テキストはクリア
              // コールバックを呼び出し
              onFinalTranscriptRef.current?.(result.transcript);
            } else {
              debugLog('🔄 Interim transcript:', result.transcript);
              setInterimTranscript(result.transcript);
            }
          } else {
            debugLog('⚠️  No transcript in result');
          }
        } catch (e) {
          console.error('❌ Deepgram parse error:', e);
        }
      };

      socket.onclose = () => {
        debugLog('Deepgram WebSocket closed');
        // Clear keepalive first to prevent race conditions
        clearKeepalive(socket);
        // Only update state if not already handled by error handler and still mounted
        if (isMountedRef.current && socketRef.current === socket && !hasErrorOccurred.current) {
          setIsConnected(false);
          socketRef.current = null;
        }
        hasErrorOccurred.current = false;
      };

      socket.onerror = (e) => {
        console.error('Deepgram WebSocket error:', e);
        hasErrorOccurred.current = true;
        if (!isMountedRef.current) return;
        
        setError('Deepgram接続エラーが発生しました');
        // Clear keepalive interval immediately
        clearKeepalive(socket);
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
  }, [clearKeepalive]);

  const disconnect = useCallback(() => {
    const socket = socketRef.current;
    if (socket) {
      // 終了メッセージを送るのが行儀が良い
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'CloseStream' }));
      }
      socket.close();
      // Note: socketRef.current will be cleared in onclose handler to avoid race conditions
    }
    if (keepAliveIntervalRef.current) {
      clearInterval(keepAliveIntervalRef.current.id);
      keepAliveIntervalRef.current = null;
    }
    setIsConnected(false);
    setInterimTranscript('');
  }, []);

  const sendAudio = useCallback((audioData: Int16Array) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      debugLog('🎤 Sending audio data, length:', audioData.length, 'bytes:', audioData.buffer.byteLength);
      // ArrayBufferとして送信（Deepgramはバイナリデータを期待）
      socketRef.current.send(audioData.buffer);
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
  // disconnect is a stable callback but included in deps for correctness
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
