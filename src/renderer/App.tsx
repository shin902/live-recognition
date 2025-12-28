import { Component, type ErrorInfo, type ReactNode, useCallback, useEffect, useState } from 'react';
import './App.css';
import { useVoiceInput } from './hooks/use-voice-input';
import { useDeepgram } from './hooks/use-deepgram';
import { VoiceStatus } from './components/VoiceStatus';

interface ConfigInfo {
  appVersion: string;
  nodeVersion: string;
  platform: string;
  hasElevenLabsKey: boolean;
  hasGroqKey: boolean;
  deepgramKey: string;
  error?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message?: string;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: undefined };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('レンダリング中にエラーが発生しました:', error, info);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="app-root">
          <div className="floating-bar state error" role="alert">
            <span className="icon" aria-hidden>
              ⚠️
            </span>
            <span>予期しないエラーが発生しました</span>
            {this.state.message && <span className="meta">{this.state.message}</span>}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App(): JSX.Element {
  const [config, setConfig] = useState<ConfigInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [micPermission, setMicPermission] = useState<PermissionState | 'unknown'>('unknown');

  const loadConfig = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      if (!window.electronAPI?.getConfig) {
        throw new Error('Electron API is not available');
      }
      const configData = await window.electronAPI.getConfig();
      if (configData.error) {
        throw new Error(configData.error);
      }
      setConfig(configData);
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '設定の読み込みに失敗しました';
      console.error('設定読み込みエラー:', errorMessage);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  const checkMicPermission = useCallback(async () => {
    try {
      const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      setMicPermission(result.state);
      result.onchange = () => setMicPermission(result.state);
    } catch (err) {
      console.warn('Permissions API not fully supported, falling back to getUserMedia check');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
        setMicPermission('granted');
      } catch (e) {
        setMicPermission('denied');
      }
    }
  }, []);

  useEffect(() => {
    void loadConfig();
    void checkMicPermission();
  }, [loadConfig, checkMicPermission]);

  // Deepgram Hook
  const { 
    connect, 
    disconnect, 
    sendAudio, 
    transcript, 
    interimTranscript, 
    isConnected: isDeepgramConnected,
    error: deepgramError 
  } = useDeepgram();

  // Voice Input Hook
  const { status, isListening, toggleListening, loading: vadLoading } = useVoiceInput({
    onAudioData: (data) => {
      // 録音中かつ接続済みなら送信
      if (isListening && isDeepgramConnected) {
        sendAudio(data);
      }
    },
    onError: (err) => {
      setError(`音声入力エラー: ${err}`);
    }
  });

  // Toggle処理: VADとDeepgramの接続を同期させる
  const handleToggle = useCallback(() => {
    if (!config?.deepgramKey) {
      setError('Deepgram APIキーが設定されていません');
      return;
    }

    if (isListening) {
      // 停止処理
      toggleListening(); // VAD停止
      disconnect();      // Deepgram切断
    } else {
      // 開始処理
      connect(config.deepgramKey); // Deepgram接続
      toggleListening();           // VAD開始
    }
  }, [isListening, toggleListening, connect, disconnect, config]);

  // Deepgramのエラーを画面に反映
  useEffect(() => {
    if (deepgramError) {
      setError(deepgramError);
      // エラー時は停止する
      if (isListening) {
        toggleListening();
        disconnect();
      }
    }
  }, [deepgramError, isListening, toggleListening, disconnect]);

  // コンポーネントがアンマウントされる際のクリーンアップ
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return (
    <ErrorBoundary>
      <div className="app-root">
        <div className="floating-bar" role="status" aria-live="polite">
          {loading && (
            <div className="state">
              <span className="icon" aria-hidden>
                ⏳
              </span>
              <span>設定を読み込み中...</span>
            </div>
          )}

          {error && !vadLoading && (
            <div className="state error" title={error}>
              <span className="icon" aria-hidden>
                ⚠️
              </span>
              <span>{error.length > 30 ? 'エラーが発生しました' : error}</span>
              <button type="button" className="retry" onClick={() => { setError(null); loadConfig(); }}>
                再試行
              </button>
            </div>
          )}

          {config && !loading && !error && (
            <div className="status-row">
              <VoiceStatus 
                status={status}
                isListening={isListening}
                onToggle={handleToggle}
                loading={vadLoading}
              />
              
              {/* テキスト表示エリア */}
              <div className="transcript-container">
                {transcript && <span className="transcript-final">{transcript}</span>}
                {interimTranscript && <span className="transcript-interim"> {interimTranscript}</span>}
                {!transcript && !interimTranscript && isListening && (
                  <span className="transcript-placeholder">お話しください...</span>
                )}
              </div>

              <div className="pills">
                <span className={`pill ${isDeepgramConnected ? 'ok' : 'ng'}`}>
                  DG: {isDeepgramConnected ? 'ON' : 'OFF'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}
