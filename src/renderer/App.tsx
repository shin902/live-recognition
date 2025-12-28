import { Component, type ErrorInfo, type ReactNode, useCallback, useEffect, useState } from 'react';
import './App.css';
import { useVoiceInput } from './hooks/use-voice-input';
import { VoiceStatus } from './components/VoiceStatus';

interface ConfigInfo {
  appVersion: string;
  nodeVersion: string;
  platform: string;
  hasElevenLabsKey: boolean;
  hasGroqKey: boolean;
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

  const { status, isListening, toggleListening, loading: vadLoading } = useVoiceInput({
    onSpeechEnd: (blob) => {
      console.log('Generated WAV Blob:', blob);
      console.log('Size:', (blob.size / 1024).toFixed(2), 'KB');
      // 次のフェーズでここから Groq API を呼び出す
    },
    onError: (err) => {
      setError(`音声入力エラー: ${err}`);
    }
  });

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
                onToggle={toggleListening}
                loading={vadLoading}
              />
              
              <div className="pills">
                <span className={`pill ${micPermission === 'granted' ? 'ok' : 'ng'}`}>
                  マイク: {micPermission === 'granted' ? 'OK' : '要許可'}
                </span>
                <span className={`pill ${config.hasGroqKey ? 'ok' : 'ng'}`}>
                  Groq: {config.hasGroqKey ? 'OK' : '未設定'}
                </span>
              </div>
              
              <span className="meta">{config.appVersion}</span>
            </div>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}
