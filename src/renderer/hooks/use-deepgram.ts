import { useState, useRef, useCallback, useEffect } from 'react';

type _DeepgramTranscript = {
  is_final: boolean;
  channel: {
    alternatives: {
      transcript: string;
      confidence: number;
    }[];
  };
};

type UseDeepgramReturn = {
  connect: (apiKey: string) => void;
  disconnect: () => void;
  sendAudio: (audioData: Int16Array) => void;
  transcript: string;
  interimTranscript: string;
  isConnected: boolean;
  error: string | null;
};

export function useDeepgram(): UseDeepgramReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const keepAliveIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback((apiKey: string) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) return;

    try {
      // nova-2 model, 日本語, スマートフォーマット有効
      const url =
        'wss://api.deepgram.com/v1/listen?model=nova-2&language=ja&smart_format=true&interim_results=true&encoding=linear16&sample_rate=16000';

      const socket = new WebSocket(url, ['token', apiKey]);
      socketRef.current = socket;

      socket.onopen = () => {
        console.log('Deepgram WebSocket connected');
        setIsConnected(true);
        setError(null);

        // KeepAlive (10秒ごとに送信)
        keepAliveIntervalRef.current = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'KeepAlive' }));
          }
        }, 10000);
      };

      socket.onmessage = (event) => {
        console.log('📩 Deepgram message received:', event.data);
        try {
          const data = JSON.parse(event.data);
          console.log('📊 Parsed data:', data);

          // メタデータなどはスキップ
          if (data.type === 'Metadata') {
            console.log('⏭️  Skipping metadata');
            return;
          }

          const result = data.channel?.alternatives?.[0];
          console.log('🔍 Extracted result:', result);
          console.log('🎯 is_final:', data.is_final);

          if (result && result.transcript) {
            console.log('📝 Transcript found:', result.transcript);
            if (data.is_final) {
              console.log('✅ Final transcript:', result.transcript);
              setTranscript((prev) => prev + (prev ? ' ' : '') + result.transcript);
              setInterimTranscript(''); // 確定したら暫定テキストはクリア
            } else {
              console.log('🔄 Interim transcript:', result.transcript);
              setInterimTranscript(result.transcript);
            }
          } else {
            console.log('⚠️  No transcript in result');
          }
        } catch (e) {
          console.error('❌ Deepgram parse error:', e);
        }
      };

      socket.onclose = () => {
        console.log('Deepgram WebSocket closed');
        setIsConnected(false);
        if (keepAliveIntervalRef.current) {
          clearInterval(keepAliveIntervalRef.current);
        }
      };

      socket.onerror = (e) => {
        console.error('Deepgram WebSocket error:', e);
        setError('Deepgram接続エラーが発生しました');
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
  };
}
