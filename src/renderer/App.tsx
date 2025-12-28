import { Component, type ErrorInfo, type ReactNode, useCallback, useEffect, useState } from 'react';
import './App.css';

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

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

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

          {error && (
            <div className="state error" title={error}>
              <span className="icon" aria-hidden>
                ⚠️
              </span>
              <span>設定の取得に失敗しました</span>
              <button type="button" className="retry" onClick={() => loadConfig()}>
                再試行
              </button>
            </div>
          )}

          {config && !loading && !error && (
            <div className="state status-row">
              <span className="brand" title={`v${config.appVersion}`}>
                🎤 Live Recognition
              </span>
              <span className="pill ok">常時前面</span>
              <span
                className={`pill ${config.hasElevenLabsKey ? 'ok' : 'ng'}`}
                title="ElevenLabs API Key"
              >
                {config.hasElevenLabsKey ? 'ElevenLabs OK' : 'ElevenLabs 未設定'}
              </span>
              <span className={`pill ${config.hasGroqKey ? 'ok' : 'ng'}`} title="Groq API Key">
                {config.hasGroqKey ? 'Groq OK' : 'Groq 未設定'}
              </span>
              <span className="meta">{`${config.platform} · Node ${config.nodeVersion}`}</span>
            </div>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}
