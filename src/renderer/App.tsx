import { Component, type ErrorInfo, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import './App.css';
import { useVoiceInput } from './hooks/use-voice-input';
import { useDeepgram } from './hooks/use-deepgram';
import { VoiceStatus } from './components/VoiceStatus';
import refinePromptTemplate from './prompts/refine-text.txt?raw';

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
  const [_micPermission, setMicPermission] = useState<PermissionState | 'unknown'>('unknown');

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
        stream.getTracks().forEach((track) => track.stop());
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

  // 整形済みテキストの状態
  const [refinedText, setRefinedText] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const [refineError, setRefineError] = useState<string | null>(null);
  const processedTranscriptsRef = useRef(new Set<string>()); // 処理済みテキストを追跡
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isUserScrolling, setIsUserScrolling] = useState(false);

  // 順序保証のためのキュー管理
  const sequenceIdRef = useRef(0); // 発話のシーケンスID
  const completedResultsRef = useRef<Map<number, string>>(new Map()); // 完了した整形結果
  const nextToDisplayRef = useRef(0); // 次に表示すべきシーケンスID

  // Groq API経由でテキスト整形（IPC使用）
  const refineText = useCallback(async (rawText: string): Promise<string> => {
    if (!rawText.trim()) {
      return rawText;
    }

    setIsRefining(true);
    setRefineError(null);

    try {
      const prompt = refinePromptTemplate.replace('{{text}}', rawText);
      const result = await window.electronAPI.groqRefineText(prompt);

      if (!result.success) {
        throw new Error(result.error || '整形に失敗しました');
      }

      return result.text || rawText;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '整形に失敗しました';
      setRefineError(errorMsg);
      console.error('Groq refine error:', err);
      return rawText;
    } finally {
      setIsRefining(false);
    }
  }, []);

  // 完了した整形結果を順序通りに表示
  const displayCompletedResults = useCallback(() => {
    let hasNewText = false;
    let newText = refinedText;

    // 次に表示すべきシーケンスIDから順に処理
    while (completedResultsRef.current.has(nextToDisplayRef.current)) {
      const result = completedResultsRef.current.get(nextToDisplayRef.current)!;
      newText = newText + (newText ? '\n' : '') + result;
      completedResultsRef.current.delete(nextToDisplayRef.current);
      nextToDisplayRef.current++;
      hasNewText = true;
      console.info(`📝 Displaying sequence ${nextToDisplayRef.current - 1}: ${result}`);
    }

    if (hasNewText) {
      setRefinedText(newText);
    }
  }, [refinedText]);

  // 確定テキストを受け取ったら即座に整形開始（非同期・順序保証付き）
  const handleFinalTranscript = useCallback(
    async (text: string) => {
      // 既に処理済みのテキストはスキップ
      if (processedTranscriptsRef.current.has(text)) {
        console.info('⏭️  Skipping duplicate transcript:', text);
        return;
      }
      
      const sequenceId = sequenceIdRef.current++;
      console.info(`🎯 Final transcript received [seq:${sequenceId}], starting refinement:`, text);
      processedTranscriptsRef.current.add(text);
      
      // 即座に整形開始（非同期で待たない）
      void (async () => {
        try {
          console.info(`🔄 Refining text [seq:${sequenceId}]:`, text);
          const refined = await refineText(text);
          console.info(`✨ Refined result [seq:${sequenceId}]:`, refined);

          // 整形完了をキューに格納
          completedResultsRef.current.set(sequenceId, refined);
          
          // 順序通りに表示
          displayCompletedResults();
        } catch (err) {
          console.error(`❌ Refinement error [seq:${sequenceId}]:`, err);
        }
      })();
    },
    [refineText, displayCompletedResults]
  );

  // Deepgram Hook
  const {
    connect,
    disconnect,
    sendAudio,
    interimTranscript,
    isConnected: isDeepgramConnected,
    error: deepgramError,
    clearTranscript,
  } = useDeepgram({ onFinalTranscript: handleFinalTranscript });

  // onAudioDataコールバックをuseCallbackでメモ化
  const handleAudioData = useCallback(
    (data: Int16Array) => {
      console.info('🎙️  Audio data received from VAD, length:', data.length);
      // Deepgramに接続済みなら送信
      if (isDeepgramConnected) {
        console.info('✅ Sending to Deepgram (connected:', isDeepgramConnected, ')');
        sendAudio(data);
      } else {
        console.warn('⏸️  Not sending (connected:', isDeepgramConnected, ')');
      }
    },
    [isDeepgramConnected, sendAudio]
  );

  // VAD onSpeechEnd時の処理（transcriptのクリアのみ）
  const handleSpeechEnd = useCallback(
    async (_blob: Blob) => {
      console.info('🎤 Speech ended, clearing interim transcript');
      clearTranscript(); // Deepgramのinterim transcriptをクリア
    },
    [clearTranscript]
  );

  // Voice Input Hook
  const {
    status,
    isListening,
    toggleListening,
    loading: vadLoading,
  } = useVoiceInput({
    onAudioData: handleAudioData,
    onSpeechEnd: handleSpeechEnd,
    onError: (err) => {
      setError(`音声入力エラー: ${err}`);
    },
  });

  // Toggle処理: VADとDeepgramの接続を同期させる
  const handleToggle = useCallback(async () => {
    console.info('🔘 Toggle button clicked. Current state - isListening:', isListening);

    if (!config?.deepgramKey) {
      console.error('❌ No Deepgram API key found');
      setError('Deepgram APIキーが設定されていません');
      return;
    }

    if (isListening) {
      // 停止処理：まずVADを停止してから接続を切断
      console.info('⏹️  Stopping: VAD and Deepgram');
      await toggleListening(); // VAD停止（非同期）
      disconnect(); // Deepgram切断
    } else {
      // 開始処理：まずDeepgramに接続してからVADを開始
      console.info('▶️  Starting: Deepgram connection and VAD');
      connect(config.deepgramKey); // Deepgram接続（即座にWebSocket接続開始）
      await toggleListening(); // VAD開始（非同期で待機）
      console.info('✅ VAD started, now listening');
    }
  }, [isListening, toggleListening, connect, disconnect, config]);

  // Deepgramのエラーを画面に反映
  useEffect(() => {
    if (deepgramError) {
      setError(deepgramError);
      // エラー時は停止する
      if (isListening) {
        void toggleListening();
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

  // 起動時に自動的に文字起こしモードを開始
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (config?.deepgramKey && !loading && !error && !vadLoading && !autoStartedRef.current) {
      autoStartedRef.current = true;
      void handleToggle();
    }
  }, [config, loading, error, vadLoading, handleToggle]);

  // textareaの高さが変わったらウィンドウをリサイズ
  useEffect(() => {
    if (!textareaRef.current) return;

    const updateWindowSize = async () => {
      if (!textareaRef.current) return;
      
      // textareaの高さ + コントロールバーの高さ + padding
      const textareaHeight = textareaRef.current.scrollHeight;
      const controlBarHeight = 60;
      const padding = 24; // 上下のpadding
      const totalHeight = Math.max(160, textareaHeight + controlBarHeight + padding);
      
      try {
        await window.electronAPI.resizeWindow(totalHeight);
      } catch (err) {
        console.error('Failed to resize window:', err);
      }
    };

    void updateWindowSize();
  }, [refinedText]);

  // textareaの自動スクロール
  useEffect(() => {
    if (!textareaRef.current || isUserScrolling) return;
    
    textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
  }, [refinedText, isUserScrolling]);

  // スクロール検出
  const handleScroll = useCallback(() => {
    if (!textareaRef.current) return;
    
    const { scrollTop, scrollHeight, clientHeight } = textareaRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 10;
    
    setIsUserScrolling(!isAtBottom);
  }, []);

  // Enterキーで整形済みテキストをアクティブウィンドウに貼り付け
  const handlePasteTranscript = useCallback(async () => {
    // 整形後テキストを優先、なければ整形中のinterimを使用
    const textToPaste = refinedText || interimTranscript;
    if (!textToPaste) return;

    try {
      const result = await window.electronAPI.pasteToActiveWindow(textToPaste);
      if (result.success) {
        console.info('✅ Pasted transcript to active window');
        setRefinedText(''); // 貼り付け後にクリア
        clearTranscript();
      } else {
        console.error('❌ Failed to paste:', result.error);
        setError(`貼り付けに失敗しました: ${result.error}`);
      }
    } catch (err) {
      console.error('❌ Paste error:', err);
      setError('貼り付けに失敗しました');
    }
  }, [refinedText, interimTranscript, clearTranscript]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && !event.repeat) {
        event.preventDefault();
        void handlePasteTranscript();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePasteTranscript]);

  return (
    <ErrorBoundary>
      <div className="app-root">
        {config && !loading && !error && (
          <>
            {/* テキストエリア */}
            <div className="transcript-area-container">
              <textarea
                ref={textareaRef}
                className="transcript-textarea"
                value={refinedText}
                onChange={(e) => setRefinedText(e.target.value)}
                onScroll={handleScroll}
                placeholder={isListening ? 'お話しください...' : '文字起こしされたテキストがここに表示されます'}
                spellCheck={false}
              />
            </div>

            {/* コントロールバー */}
            <div className="floating-bar" role="status" aria-live="polite">
              <div className="status-row">
                <VoiceStatus
                  status={status}
                  isListening={isListening}
                  onToggle={handleToggle}
                  loading={vadLoading}
                />

                {/* リアルタイムプレビュー */}
                <div className="transcript-preview">
                  {isRefining && <span className="transcript-interim">整形中...</span>}
                  {refineError && (
                    <span className="transcript-error" title={refineError}>
                      整形エラー
                    </span>
                  )}
                  {interimTranscript && !isRefining && (
                    <span className="transcript-interim">{interimTranscript}</span>
                  )}
                </div>

                <div className="pills">
                  <span className={`pill ${isDeepgramConnected ? 'ok' : 'ng'}`}>
                    DG: {isDeepgramConnected ? 'ON' : 'OFF'}
                  </span>
                </div>
              </div>
            </div>
          </>
        )}

        {loading && (
          <div className="floating-bar" role="status" aria-live="polite">
            <div className="state">
              <span className="icon" aria-hidden>
                ⏳
              </span>
              <span>設定を読み込み中...</span>
            </div>
          </div>
        )}

        {error && !vadLoading && (
          <div className="floating-bar" role="status" aria-live="polite">
            <div className="state error" title={error}>
              <span className="icon" aria-hidden>
                ⚠️
              </span>
              <span>{error.length > 30 ? 'エラーが発生しました' : error}</span>
              <button
                type="button"
                className="retry"
                onClick={() => {
                  setError(null);
                  loadConfig();
                }}
              >
                再試行
              </button>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
