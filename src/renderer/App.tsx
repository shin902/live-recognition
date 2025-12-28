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

  return (
    <div className="container">
      <div className="floating-bar">
        {loading && <span>読み込み中...</span>}
        {error && <span>エラー</span>}
        {config && !loading && !error && <span>Live Recognition</span>}
      </div>
    </div>
  );
}
