import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useElevenLabs, MIN_API_KEY_LENGTH } from '../hooks/use-elevenlabs';

/**
 * Test suite for useElevenLabs hook
 *
 * Coverage:
 * - Connection lifecycle (connect, disconnect, reconnect)
 * - WebSocket state management and cleanup
 * - API key validation
 * - Transcript handling (partial and committed)
 * - Base64 audio encoding
 * - Message type handling (session_started, errors)
 * - Error scenarios and recovery
 * - Race conditions (rapid connect/disconnect, duplicate connections)
 * - Audio data transmission
 */
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readyState = MockWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  });

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }

  /** Simulate WebSocket opening */
  triggerOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  /** Simulate receiving a message */
  triggerMessage(data: unknown) {
    this.onmessage?.({ data } as MessageEvent);
  }

  /** Simulate WebSocket error */
  triggerError(error: Event) {
    this.onerror?.(error);
  }
}

let originalWebSocket: typeof WebSocket | undefined;

// Valid ElevenLabs API key format for testing (sufficient length)
const VALID_API_KEY = 'sk_1234567890abcdef1234567890abcdef';

beforeEach(() => {
  MockWebSocket.instances = [];
  originalWebSocket = globalThis.WebSocket;
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = MockWebSocket;
});

afterEach(() => {
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = originalWebSocket;
  vi.clearAllMocks();
});

describe('useElevenLabs', () => {
  /**
   * Test complete workflow: connect, authentication, transcript aggregation
   * Verifies that partial and committed transcripts are handled correctly
   */
  it('connects, authenticates, and aggregates transcripts', async () => {
    const onFinalTranscript = vi.fn();
    const { result } = renderHook(() => useElevenLabs({ onFinalTranscript }));

    act(() => {
      result.current.connect(VALID_API_KEY);
    });

    const socket = MockWebSocket.instances[0];
    expect(socket.url).toContain('wss://api.elevenlabs.io');
    expect(socket.url).toContain('model_id=scribe_v2_realtime');
    expect(socket.url).toContain('language_code=ja');

    act(() => {
      socket.triggerOpen();
    });

    expect(result.current.isConnected).toBe(true);
    expect(result.current.error).toBeNull();

    // Verify authentication message was sent
    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ xi_api_key: VALID_API_KEY }));

    // Session started message
    act(() => {
      socket.triggerMessage(
        JSON.stringify({
          message_type: 'session_started',
        })
      );
    });

    // Partial transcript
    act(() => {
      socket.triggerMessage(
        JSON.stringify({
          message_type: 'partial_transcript',
          text: '聞き取り中',
        })
      );
    });

    expect(result.current.interimTranscript).toBe('聞き取り中');

    // Committed transcript
    act(() => {
      socket.triggerMessage(
        JSON.stringify({
          message_type: 'committed_transcript',
          text: '確定テキスト',
        })
      );
    });

    expect(result.current.transcript).toBe('確定テキスト');
    expect(result.current.interimTranscript).toBe(''); // Cleared after commit
    expect(onFinalTranscript).toHaveBeenCalledWith('確定テキスト');

    // Another committed transcript
    act(() => {
      socket.triggerMessage(
        JSON.stringify({
          message_type: 'committed_transcript',
          text: '追記',
        })
      );
    });

    expect(result.current.transcript).toBe('確定テキスト 追記');
    expect(onFinalTranscript).toHaveBeenCalledTimes(2);
  });

  /**
   * Test audio data transmission with Base64 encoding
   */
  it('sends audio data as Base64 encoded JSON', async () => {
    const { result } = renderHook(() => useElevenLabs());

    act(() => {
      result.current.connect(VALID_API_KEY);
    });

    const socket = MockWebSocket.instances[0];
    act(() => {
      socket.triggerOpen();
    });

    const audioData = new Int16Array([100, 200, 300]);
    act(() => {
      result.current.sendAudio(audioData);
    });

    // Find the audio message (skip authentication message)
    const calls = socket.send.mock.calls;
    const audioCall = calls.find((call) => {
      try {
        const msg = JSON.parse(call[0]);
        return msg.message_type === 'input_audio_chunk';
      } catch {
        return false;
      }
    });

    expect(audioCall).toBeDefined();
    const message = JSON.parse(audioCall![0]);
    expect(message.message_type).toBe('input_audio_chunk');
    expect(message.audio_base_64).toBeDefined();
    expect(typeof message.audio_base_64).toBe('string');
    expect(message.commit).toBe(false);
  });

  /**
   * Test error handling and resource cleanup
   */
  it('handles errors and closes connection', async () => {
    const { result } = renderHook(() => useElevenLabs());

    act(() => {
      result.current.connect(VALID_API_KEY);
    });

    const socket = MockWebSocket.instances[0];

    act(() => {
      socket.triggerOpen();
    });

    expect(result.current.isConnected).toBe(true);

    act(() => {
      socket.triggerError(new Event('error'));
    });

    expect(result.current.error).toBe('ElevenLabs接続エラーが発生しました');
    expect(result.current.isConnected).toBe(false);
  });

  /**
   * Test various error message types
   */
  it('handles different error message types', async () => {
    const { result } = renderHook(() => useElevenLabs());

    act(() => {
      result.current.connect(VALID_API_KEY);
    });

    const socket = MockWebSocket.instances[0];
    act(() => {
      socket.triggerOpen();
    });

    // Test error message
    act(() => {
      socket.triggerMessage(
        JSON.stringify({
          message_type: 'error',
          message: 'Test error message',
        })
      );
    });

    expect(result.current.error).toBe('Test error message');

    // Test auth_error
    act(() => {
      socket.triggerMessage(
        JSON.stringify({
          message_type: 'auth_error',
          error: 'Invalid API key',
        })
      );
    });

    expect(result.current.error).toBe('Invalid API key');

    // Test quota_exceeded
    act(() => {
      socket.triggerMessage(
        JSON.stringify({
          message_type: 'quota_exceeded',
        })
      );
    });

    expect(result.current.error).toBe('ElevenLabs APIエラーが発生しました');
  });

  it('does not reconnect when already connected', () => {
    const { result } = renderHook(() => useElevenLabs());

    act(() => {
      result.current.connect(VALID_API_KEY);
    });

    const firstSocket = MockWebSocket.instances[0];
    act(() => {
      firstSocket.triggerOpen();
    });

    act(() => {
      result.current.connect(VALID_API_KEY);
    });

    expect(MockWebSocket.instances.length).toBe(1);
  });

  it('warns when sending audio before connection', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useElevenLabs());

    try {
      act(() => {
        result.current.sendAudio(new Int16Array([1, 2]));
      });

      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('clears transcripts', () => {
    const { result } = renderHook(() => useElevenLabs());

    act(() => {
      result.current.connect(VALID_API_KEY);
    });
    const socket = MockWebSocket.instances[0];
    act(() => socket.triggerOpen());

    act(() => {
      socket.triggerMessage(
        JSON.stringify({
          message_type: 'committed_transcript',
          text: 'テスト',
        })
      );
    });

    expect(result.current.transcript).toBe('テスト');

    act(() => {
      result.current.clearTranscript();
    });

    expect(result.current.transcript).toBe('');
    expect(result.current.interimTranscript).toBe('');
  });

  it('ignores malformed JSON messages', () => {
    const { result } = renderHook(() => useElevenLabs());

    act(() => {
      result.current.connect(VALID_API_KEY);
    });

    const socket = MockWebSocket.instances[0];
    act(() => socket.triggerOpen());

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      act(() => {
        socket.triggerMessage('not-json');
      });

      expect(result.current.transcript).toBe('');
      expect(result.current.interimTranscript).toBe('');
      expect(errorSpy).toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('rejects invalid API keys', () => {
    const { result } = renderHook(() => useElevenLabs());

    // Empty key
    act(() => {
      result.current.connect('');
    });
    expect(result.current.error).toBe('APIキーが無効です');

    // Whitespace only
    act(() => {
      result.current.connect('   ');
    });
    expect(result.current.error).toBe('APIキーが無効です');

    // Too short
    act(() => {
      result.current.connect('short');
    });
    expect(result.current.error).toBe('APIキーの形式が正しくありません');

    // Test exact minimum length boundary
    act(() => {
      result.current.connect('a'.repeat(MIN_API_KEY_LENGTH - 1));
    });
    expect(result.current.error).toBe('APIキーの形式が正しくありません');

    // Invalid format (doesn't start with sk_)
    act(() => {
      result.current.connect('this-is-not-a-valid-elevenlabs-key!');
    });
    expect(result.current.error).toBe(
      'ElevenLabs APIキーの形式が正しくありません（sk_で始まる必要があります）'
    );

    // Valid length but invalid format
    act(() => {
      result.current.connect('a'.repeat(40));
    });
    expect(result.current.error).toBe(
      'ElevenLabs APIキーの形式が正しくありません（sk_で始まる必要があります）'
    );
  });

  it('prevents duplicate connections while CONNECTING', () => {
    const { result } = renderHook(() => useElevenLabs());

    // First connect call creates socket in CONNECTING state
    act(() => {
      result.current.connect(VALID_API_KEY);
    });

    const firstSocket = MockWebSocket.instances[0];
    expect(firstSocket.readyState).toBe(MockWebSocket.CONNECTING);

    // Second connect call should be ignored while still CONNECTING
    act(() => {
      result.current.connect(VALID_API_KEY);
    });

    // Should still have only one socket instance
    expect(MockWebSocket.instances.length).toBe(1);
  });

  it('allows reconnection after disconnect', () => {
    const { result } = renderHook(() => useElevenLabs());

    // First connection
    act(() => {
      result.current.connect(VALID_API_KEY);
    });

    const firstSocket = MockWebSocket.instances[0];
    act(() => {
      firstSocket.triggerOpen();
    });

    expect(result.current.isConnected).toBe(true);

    // Disconnect
    act(() => {
      result.current.disconnect();
    });

    expect(result.current.isConnected).toBe(false);

    // Reconnect should work
    act(() => {
      result.current.connect(VALID_API_KEY);
    });

    const secondSocket = MockWebSocket.instances[1];
    act(() => {
      secondSocket.triggerOpen();
    });

    expect(result.current.isConnected).toBe(true);
    expect(MockWebSocket.instances.length).toBe(2);
  });

  it('handles rapid connect/disconnect cycles', () => {
    const { result } = renderHook(() => useElevenLabs());

    // Rapid connect/disconnect/connect
    act(() => {
      result.current.connect(VALID_API_KEY);
    });

    const firstSocket = MockWebSocket.instances[0];
    act(() => {
      firstSocket.triggerOpen();
    });

    expect(result.current.isConnected).toBe(true);

    act(() => {
      result.current.disconnect();
    });

    expect(result.current.isConnected).toBe(false);

    act(() => {
      result.current.connect(VALID_API_KEY);
    });

    const secondSocket = MockWebSocket.instances[1];
    act(() => {
      secondSocket.triggerOpen();
    });

    expect(result.current.isConnected).toBe(true);
  });

  it('handles many rapid sequential committed transcripts', () => {
    const onFinalTranscript = vi.fn();
    const { result } = renderHook(() => useElevenLabs({ onFinalTranscript }));

    act(() => {
      result.current.connect(VALID_API_KEY);
    });

    const socket = MockWebSocket.instances[0];
    act(() => {
      socket.triggerOpen();
    });

    // Send 15 rapid committed transcripts
    act(() => {
      for (let i = 1; i <= 15; i++) {
        socket.triggerMessage(
          JSON.stringify({
            message_type: 'committed_transcript',
            text: `文${i}`,
          })
        );
      }
    });

    // Verify all transcripts were aggregated correctly
    expect(result.current.transcript).toBe(
      '文1 文2 文3 文4 文5 文6 文7 文8 文9 文10 文11 文12 文13 文14 文15'
    );
    expect(onFinalTranscript).toHaveBeenCalledTimes(15);
    expect(onFinalTranscript).toHaveBeenLastCalledWith('文15');
  });

  it('allows reconnection after error', () => {
    const { result } = renderHook(() => useElevenLabs());

    // First connection
    act(() => {
      result.current.connect(VALID_API_KEY);
    });

    const firstSocket = MockWebSocket.instances[0];
    act(() => {
      firstSocket.triggerOpen();
    });

    expect(result.current.isConnected).toBe(true);
    expect(result.current.error).toBeNull();

    // Trigger error
    act(() => {
      firstSocket.triggerError(new Event('error'));
    });

    expect(result.current.isConnected).toBe(false);
    expect(result.current.error).toBe('ElevenLabs接続エラーが発生しました');

    // Reconnect should work after error
    act(() => {
      result.current.connect(VALID_API_KEY);
    });

    const secondSocket = MockWebSocket.instances[1];
    act(() => {
      secondSocket.triggerOpen();
    });

    expect(result.current.isConnected).toBe(true);
    expect(result.current.error).toBeNull();
    expect(MockWebSocket.instances.length).toBe(2);
  });

  it('handles committed_transcript_with_timestamps message type', () => {
    const onFinalTranscript = vi.fn();
    const { result } = renderHook(() => useElevenLabs({ onFinalTranscript }));

    act(() => {
      result.current.connect(VALID_API_KEY);
    });

    const socket = MockWebSocket.instances[0];
    act(() => {
      socket.triggerOpen();
    });

    act(() => {
      socket.triggerMessage(
        JSON.stringify({
          message_type: 'committed_transcript_with_timestamps',
          text: 'タイムスタンプ付き',
        })
      );
    });

    expect(result.current.transcript).toBe('タイムスタンプ付き');
    expect(onFinalTranscript).toHaveBeenCalledWith('タイムスタンプ付き');
  });

  it('ignores unknown message types', () => {
    const { result } = renderHook(() => useElevenLabs());

    act(() => {
      result.current.connect(VALID_API_KEY);
    });

    const socket = MockWebSocket.instances[0];
    act(() => {
      socket.triggerOpen();
    });

    act(() => {
      socket.triggerMessage(
        JSON.stringify({
          message_type: 'unknown_type',
          data: 'should be ignored',
        })
      );
    });

    expect(result.current.transcript).toBe('');
    expect(result.current.interimTranscript).toBe('');
    expect(result.current.error).toBeNull();
  });
});
