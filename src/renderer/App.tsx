import { useEffect, useState } from 'react';
import './App.css';

interface ConfigInfo {
  appVersion: string;
  nodeVersion: string;
  platform: string;
  hasElevenLabsKey: boolean;
  hasGroqKey: boolean;
}

export default function App(): JSX.Element {
  const [config, setConfig] = useState<ConfigInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadConfig = async (): Promise<void> => {
      try {
        if (!window.electronAPI) {
          throw new Error('Electron API is not available');
        }
        const configData = await window.electronAPI.getConfig();
        setConfig(configData);
        setError(null);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '設定の読み込みに失敗しました';
        console.error('設定読み込みエラー:', errorMessage);
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    loadConfig();
  }, []);

  if (loading) {
    return <div className="container loading">読み込み中...</div>;
  }

  if (error) {
    return (
      <div className="container">
        <div className="card">
          <h1>エラーが発生しました</h1>
          <p className="error-message">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="card">
        <h1>Live Recognition</h1>
        <p className="subtitle">リアルタイム音声認識とLLM文章整形</p>

        {config && (
          <div className="info">
            <div className="info-section">
              <h2>アプリケーション情報</h2>
              <dl>
                <dt>バージョン</dt>
                <dd>{config.appVersion}</dd>
                <dt>Node.js</dt>
                <dd>{config.nodeVersion}</dd>
                <dt>プラットフォーム</dt>
                <dd>{config.platform}</dd>
              </dl>
            </div>

            <div className="info-section">
              <h2>API キー設定</h2>
              <div className="status">
                <div className={`status-item ${config.hasElevenLabsKey ? 'ok' : 'ng'}`}>
                  <span className="status-indicator"></span>
                  <span>
                    ElevenLabs API キー: {config.hasElevenLabsKey ? '✓ 設定済み' : '✗ 未設定'}
                  </span>
                </div>
                <div className={`status-item ${config.hasGroqKey ? 'ok' : 'ng'}`}>
                  <span className="status-indicator"></span>
                  <span>Groq API キー: {config.hasGroqKey ? '✓ 設定済み' : '✗ 未設定'}</span>
                </div>
              </div>
            </div>

            <div className="info-section">
              <p className="note">
                本セットアップでは、APIキーはまだ使用されていません。次段階で音声認識機能とLLM統合機能が追加されます。
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
