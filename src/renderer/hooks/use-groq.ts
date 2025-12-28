import { useState, useCallback, useRef } from 'react';
import refinePromptTemplate from '../prompts/refine-text.txt?raw';

type UseGroqReturn = {
  refineText: (rawText: string) => Promise<string>;
  isRefining: boolean;
  error: string | null;
};

export function useGroq(apiKey: string): UseGroqReturn {
  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const refineText = useCallback(
    async (rawText: string): Promise<string> => {
      if (!apiKey) {
        setError('Groq APIキーが設定されていません');
        return rawText;
      }

      if (!rawText.trim()) {
        return rawText;
      }

      // 前のリクエストをキャンセル
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      setIsRefining(true);
      setError(null);

      try {
        const prompt = refinePromptTemplate.replace('{{text}}', rawText);

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'meta-llama/llama-4-scout-17b-16e-instruct',
            messages: [
              {
                role: 'user',
                content: prompt,
              },
            ],
            temperature: 0.3,
            max_tokens: 1024,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error?.message || `API error: ${response.status}`);
        }

        const data = await response.json();
        const refinedText = data.choices?.[0]?.message?.content?.trim();

        if (!refinedText) {
          throw new Error('整形結果が空です');
        }

        return refinedText;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          // キャンセルされた場合は元のテキストを返す
          return rawText;
        }
        const errorMsg = err instanceof Error ? err.message : '整形に失敗しました';
        setError(errorMsg);
        console.error('Groq refine error:', err);
        return rawText; // エラー時は元のテキストを返す
      } finally {
        setIsRefining(false);
      }
    },
    [apiKey]
  );

  return {
    refineText,
    isRefining,
    error,
  };
}
