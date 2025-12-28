import { Component, type ErrorInfo, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import './App.css';
import { useVoiceInput } from './hooks/use-voice-input';
import { useDeepgram } from './hooks/use-deepgram';
import { VoiceStatus } from './components/VoiceStatus';
import refinePromptTemplate from './prompts/refine-text.txt?raw';

// 定数（モジュールスコープ）
const TRANSCRIPT_CONFIG = {
  MAX_PROCESSED: 100,
  MAX_PASTE_LENGTH: 10000,
  CONTROL_BAR_HEIGHT: 60,
  VERTICAL_PADDING: 24,
  SCROLL_BOTTOM_THRESHOLD: 10,
  MIN_WINDOW_HEIGHT: 160,
  RESIZE_DEBOUNCE_MS: 100,
  MAX_SEQUENCE_GAP: 5,
  SEQUENCE_TIMEOUT_MS: 30000,
  CLEANUP_AGE_MS: 60000, // 1分以上前のエントリをクリーンアップ
  MAX_COMPLETED_RESULTS: 20, // completedResultsRefの最大サイズ
} as const;

// プロンプトテンプレートの検証（起動時に1回のみ）
const validatePromptTemplate = () => {
  try {
    const count = (refinePromptTemplate.match(/{{text}}/g) || []).length;
    if (count !== 1) {
      throw new Error('Invalid prompt template: {{text}} placeholder must appear exactly once');
    }
  } catch (error) {
    console.error('Failed to validate prompt template:', error);
    throw error;
  }
};
validatePromptTemplate();

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
  const refinedTextRef = useRef(''); // 最新のrefinedTextをrefで保持
  const [bufferText, setBufferText] = useState(''); // バッファのテキスト（未整形）を表示用に保持
  const [isRefining, setIsRefining] = useState(false);
  const [refineError, setRefineError] = useState<string | null>(null);
  const [isManuallyEdited, setIsManuallyEdited] = useState(false); // ユーザー編集フラグ
  const processedTranscriptsRef = useRef<Map<string, number>>(new Map()); // 処理済みテキストとタイムスタンプ
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const refiningCountRef = useRef(0); // 並行実行中の整形処理数
  const prevHeightRef = useRef(0); // 前回のtextarea高さ
  const isMountedRef = useRef(true); // コンポーネントのマウント状態
  const sentenceBufferRef = useRef(''); // 句点待ちのバッファ

  // 順序保証のためのキュー管理
  const sequenceIdRef = useRef(0); // 発話のシーケンスID
  const completedResultsRef = useRef<Map<number, string>>(new Map()); // 完了した整形結果
  const sequenceTimestampsRef = useRef<Map<number, number>>(new Map()); // シーケンス開始時刻
  const nextToDisplayRef = useRef(0); // 次に表示すべきシーケンスID
  const isDisplayingRef = useRef(false); // 表示処理中フラグ（競合状態防止）
  const displayRetryCountRef = useRef(0); // 再試行カウンター
  const MAX_DISPLAY_RETRIES = 10; // 最大再試行回数

  // コンポーネントのアンマウント検出
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Groq API経由でテキスト整形（IPC使用）
  const refineText = useCallback(async (rawText: string, context: string = ''): Promise<string> => {
    if (!rawText.trim()) {
      return rawText;
    }

    refiningCountRef.current++;
    if (isMountedRef.current) {
      setIsRefining(refiningCountRef.current > 0);
      setRefineError(null);
    }

    try {
      // コンテキストがある場合はプロンプトに追加
      const contextSection = context ? `## 前の文脈\n${context}\n\n` : '';
      const prompt = refinePromptTemplate
        .replace('{{context}}', contextSection)
        .replace('{{text}}', rawText);
      const result = await window.electronAPI.groqRefineText(prompt);

      if (!result.success) {
        throw new Error(result.error || '整形に失敗しました');
      }

      return result.text || rawText;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '整形に失敗しました';
      if (isMountedRef.current) {
        setRefineError(errorMsg);
      }
      console.error('Groq refine error:', err);
      return rawText;
    } finally {
      refiningCountRef.current--;
      if (isMountedRef.current) {
        setIsRefining(refiningCountRef.current > 0);
      }
    }
  }, []);

  // 完了した整形結果を順序通りに表示（タイムアウト・ギャップ処理付き）
  const displayCompletedResults = useCallback(() => {
    if (!isMountedRef.current) return; // アンマウント後は実行しない
    if (isDisplayingRef.current) return; // 既に表示処理中の場合はスキップ（競合状態防止）
    
    isDisplayingRef.current = true;
    const now = Date.now();
    
    setRefinedText(prev => {
      // 手動編集されている場合は既存のテキストをそのまま保持しつつ、新しい音声認識結果を追加
      const parts: string[] = prev ? [prev] : [];
      let shouldRetry = false;
      let hasDisplayedAny = false;
      
      // 次に表示すべきシーケンスIDから順に処理
      while (completedResultsRef.current.has(nextToDisplayRef.current)) {
        const result = completedResultsRef.current.get(nextToDisplayRef.current)!;
        parts.push(result);
        completedResultsRef.current.delete(nextToDisplayRef.current);
        sequenceTimestampsRef.current.delete(nextToDisplayRef.current);
        console.info(`📝 Displaying sequence ${nextToDisplayRef.current}: ${result}`);
        nextToDisplayRef.current++;
        hasDisplayedAny = true;
      }
      
      // 表示があった場合は再試行カウンターをリセット
      if (hasDisplayedAny) {
        displayRetryCountRef.current = 0;
      }
      
      // タイムアウトまたは大きなギャップがある場合、スタックしたシーケンスをスキップ
      const gap = sequenceIdRef.current - nextToDisplayRef.current;
      if (gap > TRANSCRIPT_CONFIG.MAX_SEQUENCE_GAP) {
        const oldestTimestamp = sequenceTimestampsRef.current.get(nextToDisplayRef.current);
        
        if (oldestTimestamp && now - oldestTimestamp > TRANSCRIPT_CONFIG.SEQUENCE_TIMEOUT_MS) {
          console.warn(`⚠️  Skipping stuck sequence ${nextToDisplayRef.current} (timeout)`);
          sequenceTimestampsRef.current.delete(nextToDisplayRef.current);
          nextToDisplayRef.current++;
          shouldRetry = true;
        } else if (!oldestTimestamp && gap > TRANSCRIPT_CONFIG.MAX_SEQUENCE_GAP * 2) {
          console.warn(`⚠️  Skipping missing sequence ${nextToDisplayRef.current} (large gap)`);
          nextToDisplayRef.current++;
          shouldRetry = true;
        }
      }
      
      // メモリリーク防止: completedResultsRefの最大サイズを常に強制
      if (completedResultsRef.current.size > TRANSCRIPT_CONFIG.MAX_COMPLETED_RESULTS) {
        const sortedEntries = Array.from(completedResultsRef.current.entries())
          .sort(([a], [b]) => a - b);
        const toKeep = sortedEntries.slice(-TRANSCRIPT_CONFIG.MAX_COMPLETED_RESULTS);
        completedResultsRef.current = new Map(toKeep);
        
        // 対応するタイムスタンプもクリーンアップ
        for (const [seqId] of sequenceTimestampsRef.current) {
          if (!completedResultsRef.current.has(seqId) && seqId < nextToDisplayRef.current) {
            sequenceTimestampsRef.current.delete(seqId);
          }
        }
      }
      
      // スキップ後に再試行が必要な場合、次のtickで再実行（最大回数制限付き）
      if (shouldRetry && isMountedRef.current) {
        displayRetryCountRef.current++;
        if (displayRetryCountRef.current < MAX_DISPLAY_RETRIES) {
          // queueMicrotaskでフラグクリア後に再試行をスケジュール
          queueMicrotask(() => {
            isDisplayingRef.current = false;
            displayCompletedResults();
          });
        } else {
          console.warn(`⚠️  Max display retries (${MAX_DISPLAY_RETRIES}) reached, stopping retry`);
          displayRetryCountRef.current = 0;
          queueMicrotask(() => {
            isDisplayingRef.current = false;
          });
        }
      } else {
        // 再試行しない場合もフラグをクリア
        queueMicrotask(() => {
          isDisplayingRef.current = false;
        });
      }
      
      const newText = parts.join('');
      refinedTextRef.current = newText; // refを更新
      return newText;
    });
    
    // 新しい音声認識結果が追加されたら手動編集フラグをリセット
    if (completedResultsRef.current.size > 0) {
      setIsManuallyEdited(false);
    }
  }, []);

  // 句点で区切って一文ごとに処理する関数
  const processSentence = useCallback(async (sentence: string) => {
    // 空のテキストはスキップ
    if (!sentence.trim()) {
      return;
    }
    
    // 既に処理済みのテキストはスキップ
    if (processedTranscriptsRef.current.has(sentence)) {
      console.info('⏭️  Skipping duplicate sentence:', sentence);
      return;
    }
    
    const sequenceId = sequenceIdRef.current++;
    const startTime = Date.now();
    console.info(`🎯 Processing sentence [seq:${sequenceId}]:`, sentence);
    processedTranscriptsRef.current.set(sentence, startTime);
    sequenceTimestampsRef.current.set(sequenceId, startTime);
    
    // メモリリーク防止: 古いエントリを削除（サイズベース）
    if (processedTranscriptsRef.current.size > TRANSCRIPT_CONFIG.MAX_PROCESSED) {
      const entries = Array.from(processedTranscriptsRef.current.entries());
      const keepEntries = entries.slice(-Math.floor(TRANSCRIPT_CONFIG.MAX_PROCESSED / 2));
      processedTranscriptsRef.current = new Map(keepEntries);
    }
    
    // メモリリーク防止: 古いエントリを削除（時間ベース - 1分以上前）
    const now = Date.now();
    for (const [seqId, timestamp] of sequenceTimestampsRef.current.entries()) {
      if (now - timestamp > TRANSCRIPT_CONFIG.CLEANUP_AGE_MS) {
        sequenceTimestampsRef.current.delete(seqId);
        completedResultsRef.current.delete(seqId);
      }
    }
    // processedTranscriptsRefも時間ベースでクリーンアップ
    for (const [txt, timestamp] of processedTranscriptsRef.current.entries()) {
      if (now - timestamp > TRANSCRIPT_CONFIG.CLEANUP_AGE_MS) {
        processedTranscriptsRef.current.delete(txt);
      }
    }
    
    // 即座に整形開始（非同期で待たない）
    void (async () => {
      try {
        console.info(`🔄 Refining sentence [seq:${sequenceId}]:`, sentence);
        // refinedTextRefから最新の文脈を取得
        const currentContext = refinedTextRef.current;
        const refined = await refineText(sentence, currentContext);
        // 改行を削除して1行のテキストにする
        const refinedWithoutNewlines = refined.replace(/\n+/g, '');
        console.info(`✨ Refined result [seq:${sequenceId}]:`, refinedWithoutNewlines);

        if (!isMountedRef.current) return; // アンマウント後は処理しない

        // 整形完了をキューに格納（タイムスタンプはdisplayCompletedResults内で削除）
        completedResultsRef.current.set(sequenceId, refinedWithoutNewlines);
        
        // 順序通りに表示
        displayCompletedResults();
      } catch (err) {
        console.error(`❌ Refinement error [seq:${sequenceId}]:`, err);
        
        if (!isMountedRef.current) return; // アンマウント後は処理しない
        
        // エラー時はフォールバックとして元のテキストを使用
        completedResultsRef.current.set(sequenceId, sentence);
        displayCompletedResults();
      }
    })();
  }, [refineText, displayCompletedResults]);

  // 確定テキストを受け取ったら句点・疑問符・感嘆符で区切って処理
  const handleFinalTranscript = useCallback(
    async (text: string) => {
      // 空のテキストはスキップ（VADは反応したが音声認識できなかった場合）
      if (!text.trim()) {
        console.info('⏭️  Skipping empty transcript');
        return;
      }
      
      console.info(`📥 Received transcript:`, text);
      
      // バッファに追加
      sentenceBufferRef.current += text;
      console.info(`📝 Buffer content:`, sentenceBufferRef.current);
      
      // 句点・疑問符・感嘆符で分割（。？！で区切る）
      // 正規表現で分割し、区切り文字も保持する
      const parts = sentenceBufferRef.current.split(/([。？！])/);
      
      // 文と区切り文字を結合
      const sentences: string[] = [];
      for (let i = 0; i < parts.length - 1; i += 2) {
        const sentence = parts[i];
        const delimiter = parts[i + 1];
        if (sentence.trim() && delimiter) {
          sentences.push(sentence.trim() + delimiter);
        }
      }
      
      // 最後の要素（区切り文字がない部分）はバッファに残す
      sentenceBufferRef.current = parts[parts.length - 1] || '';
      setBufferText(sentenceBufferRef.current); // バッファの内容を表示用ステートに反映
      console.info(`💾 Remaining buffer:`, sentenceBufferRef.current);
      
      // 区切り文字で終わる完全な文を処理
      for (const sentence of sentences) {
        if (sentence.trim()) {
          await processSentence(sentence.trim());
        }
      }
    },
    [processSentence]
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

  // textareaの高さが変わったらウィンドウをリサイズ（デバウンス付き・変更検出）
  useEffect(() => {
    if (!textareaRef.current) return;

    // 早期リターン: 高さが変わっていない場合はタイマーすら設定しない
    const newHeight = textareaRef.current.scrollHeight;
    if (newHeight === prevHeightRef.current) {
      return;
    }

    const timeoutId = setTimeout(async () => {
      if (!textareaRef.current) return;
      
      const currentHeight = textareaRef.current.scrollHeight;
      prevHeightRef.current = currentHeight;
      
      const totalHeight = Math.max(
        TRANSCRIPT_CONFIG.MIN_WINDOW_HEIGHT, 
        currentHeight + TRANSCRIPT_CONFIG.CONTROL_BAR_HEIGHT + TRANSCRIPT_CONFIG.VERTICAL_PADDING
      );
      
      try {
        await window.electronAPI.resizeWindow(totalHeight);
      } catch (err) {
        console.error('Failed to resize window:', err);
      }
    }, TRANSCRIPT_CONFIG.RESIZE_DEBOUNCE_MS);

    return () => clearTimeout(timeoutId);
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
    const isAtBottom = scrollHeight - scrollTop - clientHeight < TRANSCRIPT_CONFIG.SCROLL_BOTTOM_THRESHOLD;
    
    setIsUserScrolling(!isAtBottom);
  }, []);

  // バッファをフラッシュしてLLMで最終整形する
  const flushBufferAndRefine = useCallback(async () => {
    // バッファに残っているテキストがあれば処理
    if (sentenceBufferRef.current.trim()) {
      console.info('🔄 Flushing buffer:', sentenceBufferRef.current);
      await processSentence(sentenceBufferRef.current.trim());
      sentenceBufferRef.current = ''; // バッファをクリア
      setBufferText(''); // 表示もクリア
    }
    
    // 整形処理が完了するまで少し待つ
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // 全体を再整形（最終まとめ）
    const allText = refinedTextRef.current;
    if (allText.trim()) {
      console.info('✨ Final refinement of all text');
      try {
        const finalRefined = await refineText(allText, '');
        const finalWithoutNewlines = finalRefined.replace(/\n+/g, '');
        console.info('📋 Final refined text:', finalWithoutNewlines);
        
        // 最終整形結果で置き換え
        setRefinedText(finalWithoutNewlines);
        refinedTextRef.current = finalWithoutNewlines;
      } catch (err) {
        console.error('❌ Final refinement error:', err);
      }
    }
  }, [processSentence, refineText]);

  // Enterキーで整形済みテキストをアクティブウィンドウに貼り付け
  const handlePasteTranscript = useCallback(async () => {
    // まずバッファをフラッシュして最終整形
    await flushBufferAndRefine();
    
    // 整形後テキストを優先、なければ整形中のinterimを使用
    const textToPaste = refinedTextRef.current || interimTranscript;
    if (!textToPaste) return;

    // テキスト長の検証
    if (textToPaste.length > TRANSCRIPT_CONFIG.MAX_PASTE_LENGTH) {
      setError(`貼り付けるテキストが長すぎます（最大${TRANSCRIPT_CONFIG.MAX_PASTE_LENGTH}文字）`);
      return;
    }

    // 処理中のテキストを保持するために、まだ完了していない部分を記録
    const pendingInterim = interimTranscript;
    const hasPendingRefinement = isRefining;

    try {
      const result = await window.electronAPI.pasteToActiveWindow(textToPaste);
      if (result.success) {
        console.info('✅ Pasted transcript to active window');
        // 貼り付けたテキストの部分のみクリア（interimは保持）
        setRefinedText('');
        refinedTextRef.current = '';
        sentenceBufferRef.current = ''; // バッファもクリア
        setBufferText(''); // 表示もクリア
        // 整形中または認識中のテキストがある場合はclearTranscriptを呼ばない
        if (!pendingInterim && !hasPendingRefinement) {
          clearTranscript();
        }
        // 手動編集フラグをリセットして自動更新を再開
        setIsManuallyEdited(false);
      } else {
        console.error('❌ Failed to paste:', result.error);
        setError(`貼り付けに失敗しました: ${result.error}`);
      }
    } catch (err) {
      console.error('❌ Paste error:', err);
      setError('貼り付けに失敗しました');
    }
  }, [flushBufferAndRefine, interimTranscript, isRefining, clearTranscript]);

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
            <div className="transcript-area-container" style={{ position: 'relative' }}>
              {/* 表示用のdiv（色分け可能） */}
              <div
                className="transcript-display"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  padding: '12px 16px',
                  fontSize: '14px',
                  lineHeight: '1.6',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  color: '#fff',
                  whiteSpace: 'pre-wrap',
                  wordWrap: 'break-word',
                  overflowY: 'auto',
                  pointerEvents: 'none',
                  boxSizing: 'border-box',
                }}
              >
                <span style={{ color: '#fff' }}>{refinedText}</span>
                <span style={{ color: 'rgba(255, 255, 255, 0.4)' }}>{bufferText}</span>
              </div>
              {/* 編集用のtextarea（透明） */}
              <textarea
                ref={textareaRef}
                className="transcript-textarea"
                value={refinedText + (bufferText ? bufferText : '')}
                onChange={(e) => {
                  const newValue = e.target.value;
                  // バッファ分を除いた部分だけをrefinedTextとして扱う
                  const refinedPart = bufferText && newValue.endsWith(bufferText) 
                    ? newValue.slice(0, -bufferText.length)
                    : newValue;
                  setRefinedText(refinedPart);
                  refinedTextRef.current = refinedPart;
                  if (refinedPart !== refinedText) {
                    setIsManuallyEdited(true);
                  }
                }}
                onScroll={handleScroll}
                placeholder={isListening ? 'お話しください...' : '文字起こしされたテキストがここに表示されます'}
                spellCheck={false}
                aria-label="文字起こしテキスト"
                aria-live="polite"
                aria-atomic="false"
                aria-busy={isRefining}
                style={{
                  color: 'transparent',
                  caretColor: '#fff',
                }}
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
                  {bufferText && !isRefining && (
                    <span className="transcript-interim">{bufferText}</span>
                  )}
                  {interimTranscript && !isRefining && !bufferText && (
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
