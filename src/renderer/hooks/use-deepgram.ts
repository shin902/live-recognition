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
const isDebug = process.env.NODE_ENV !== 'production';
const debugLog = (...args: unknown[]) => {
  if (isDebug) console.log(...args);
};

export function useDeepgram(options: UseDeepgramOptions = {}): UseDeepgramReturn {
  const { onFinalTranscript } = options;
  const [isConnected, setIsConnected] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const keepAliveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const onFinalTranscriptRef = useRef(onFinalTranscript);

  // コールバックをrefで保持
  useEffect(() => {
    onFinalTranscriptRef.current = onFinalTranscript;
  }, [onFinalTranscript]);

  const connect = useCallback((apiKey: string) => {
    if (
      socketRef.current?.readyState === WebSocket.OPEN ||
      socketRef.current?.readyState === WebSocket.CONNECTING
    )
      return;

    try {
      // nova-2 model, 日本語, スマートフォーマット有効
      const url =
        'wss://api.deepgram.com/v1/listen?model=nova-2&language=ja&smart_format=true&interim_results=true&encoding=linear16&sample_rate=16000';

      const socket = new WebSocket(url, ['token', apiKey]);
      socketRef.current = socket;

      socket.onopen = () => {
        debugLog('Deepgram WebSocket connected');
        setIsConnected(true);
        setError(null);

         // KeepAlive (10秒ごとに送信)
        keepAliveIntervalRef.current = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'KeepAlive' }));
          }
        }, KEEPALIVE_INTERVAL_MS);
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
              setTranscript((prev) => prev + (prev ? ' ' : '') + result.transcript);
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
        setIsConnected(false);
        if (keepAliveIntervalRef.current) {
          clearInterval(keepAliveIntervalRef.current);
        }
      };

      socket.onerror = (e) => {
        console.error('Deepgram WebSocket error:', e);
        setError('Deepgram接続エラーが発生しました');
        if (keepAliveIntervalRef.current) {
          clearInterval(keepAliveIntervalRef.current);
        }
        setIsConnected(false);
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : '接続に失敗しました');
    }
  }, []);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      // 終了メッセージを送るのが行儀が良い
      if (socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: 'CloseStream' }));
      }
      socketRef.current.close();
      socketRef.current = null;
    }
    setIsConnected(false);
    setInterimTranscript('');
  }, []);

  const sendAudio = useCallback((audioData: Int16Array) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      console.log('🎤 Sending audio data, length:', audioData.length, 'bytes:', audioData.buffer.byteLength);
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
  useEffect(() => {
    return () => {
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
