import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDeepgram, KEEPALIVE_INTERVAL_MS, MIN_API_KEY_LENGTH } from '../hooks/use-deepgram';

/**
 * Test suite for useDeepgram hook
 *
 * Coverage:
 * - Connection lifecycle (connect, disconnect, reconnect)
 * - WebSocket state management and cleanup
 * - Keepalive interval management and memory leak prevention
 * - API key validation
 * - Transcript handling (interim and final)
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

  constructor(
    public url: string,
    public protocols?: string | string[]
  ) {
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

// Valid Deepgram API key format for testing (40 hex characters)
const VALID_API_KEY = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0';

beforeEach(() => {
  vi.useFakeTimers();
  MockWebSocket.instances = [];
  originalWebSocket = globalThis.WebSocket;
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = MockWebSocket;
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = originalWebSocket;
  vi.clearAllMocks();
});

describe('useDeepgram', () => {
  /**
   * Test complete workflow: connect, keepalive, transcript aggregation
   * Verifies that interim and final transcripts are handled correctly
   */
  it('connects, sends keepalive, and aggregates transcripts', async () => {
    const onFinalTranscript = vi.fn();
    const { result } = renderHook(() => useDeepgram({ onFinalTranscript }));

    act(() => {
      result.current.connect(VALID_API_KEY);
    });

    const socket = MockWebSocket.instances[0];
    expect(socket.protocols).toEqual(['token', VALID_API_KEY]);

    act(() => {
      socket.triggerOpen();
    });

    expect(result.current.isConnected).toBe(true);
    expect(result.current.error).toBeNull();

    act(() => {
      socket.triggerMessage(
        JSON.stringify({
          channel: { alternatives: [{ transcript: '聞き取り中' }] },
          is_final: false,
        })
      );
    });

    expect(result.current.interimTranscript).toBe('聞き取り中');

    act(() => {
      socket.triggerMessage(
        JSON.stringify({
          channel: { alternatives: [{ transcript: '確定テキスト' }] },
          is_final: true,
        })
      );
    });

    expect(result.current.transcript).toBe('確定テキスト');
    expect(onFinalTranscript).toHaveBeenCalledWith('確定テキスト');

    act(() => {
      socket.triggerMessage(
        JSON.stringify({
          channel: { alternatives: [{ transcript: '追記' }] },
          is_final: true,
        })
      );
    });

    expect(result.current.transcript).toBe('確定テキスト 追記');

    act(() => {
      result.current.sendAudio(new Int16Array([1, 2, 3]));
    });

    const calls = socket.send.mock.calls;
    const hasBinary = calls.some((c) => c[0] instanceof ArrayBuffer);
    expect(hasBinary).toBe(true);

    vi.advanceTimersByTime(KEEPALIVE_INTERVAL_MS);
    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'KeepAlive' }));
    const countBeforeClose = socket.send.mock.calls.length;
    act(() => {
      socket.onclose?.();
    });

    vi.advanceTimersByTime(KEEPALIVE_INTERVAL_MS);
    expect(socket.send).toHaveBeenCalledTimes(countBeforeClose);
  });

  /**
   * Test error handling and resource cleanup
   * Ensures keepalive stops after error
   */
  it('handles errors and closes connection', async () => {
    const { result } = renderHook(() => useDeepgram());

    act(() => {
      result.current.connect(VALID_API_KEY);
    });

    const socket = MockWebSocket.instances[0];

    act(() => {
      socket.triggerOpen();
    });

    vi.advanceTimersByTime(KEEPALIVE_INTERVAL_MS);
    const keepaliveBefore = socket.send.mock.calls.length;

    act(() => {
      socket.triggerError(new Event('error'));
    });

    expect(result.current.error).toBe('Deepgram接続エラーが発生しました');

    vi.advanceTimersByTime(KEEPALIVE_INTERVAL_MS);
    const keepaliveAfter = socket.send.mock.calls.length;
    expect(keepaliveAfter).toBe(keepaliveBefore);

    expect(result.current.isConnected).toBe(false);
  });

  it('does not reconnect when already connected', () => {
    const { result } = renderHook(() => useDeepgram());

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
    const { result } = renderHook(() => useDeepgram());

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
    const { result } = renderHook(() => useDeepgram());

    act(() => {
      result.current.connect(VALID_API_KEY);
    });
    const socket = MockWebSocket.instances[0];
    act(() => socket.triggerOpen());

    act(() => {
      socket.triggerMessage(
        JSON.stringify({
          channel: { alternatives: [{ transcript: 'a' }] },
          is_final: true,
        })
      );
    });

    expect(result.current.transcript).toBe('a');

    act(() => {
      result.current.clearTranscript();
    });

    expect(result.current.transcript).toBe('');
    expect(result.current.interimTranscript).toBe('');
  });

  it('ignores malformed JSON messages', () => {
    const { result } = renderHook(() => useDeepgram());

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
    const { result } = renderHook(() => useDeepgram());

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

    // Invalid format (not 40 hex characters)
    act(() => {
      result.current.connect('this-is-not-a-valid-deepgram-api-key!');
    });
    expect(result.current.error).toBe(
      'Deepgram APIキーの形式が正しくありません（40文字の16進数である必要があります）'
    );

    // Valid length but invalid characters
    act(() => {
      result.current.connect('z'.repeat(40));
    });
    expect(result.current.error).toBe(
      'Deepgram APIキーの形式が正しくありません（40文字の16進数である必要があります）'
    );
  });

  it('prevents duplicate connections while CONNECTING', () => {
    const { result } = renderHook(() => useDeepgram());

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
    const { result } = renderHook(() => useDeepgram());

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
    const { result } = renderHook(() => useDeepgram());

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

    // Verify keepalive is working for second connection
    vi.advanceTimersByTime(KEEPALIVE_INTERVAL_MS);
    expect(secondSocket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'KeepAlive' }));

    // Verify first socket's keepalive is not still running
    const firstSocketCallCount = firstSocket.send.mock.calls.length;
    vi.advanceTimersByTime(KEEPALIVE_INTERVAL_MS);
    expect(firstSocket.send.mock.calls.length).toBe(firstSocketCallCount);
  });

  it('handles many rapid sequential final transcripts', () => {
    const onFinalTranscript = vi.fn();
    const { result } = renderHook(() => useDeepgram({ onFinalTranscript }));

    act(() => {
      result.current.connect(VALID_API_KEY);
    });

    const socket = MockWebSocket.instances[0];
    act(() => {
      socket.triggerOpen();
    });

    // Send 15 rapid final transcripts
    act(() => {
      for (let i = 1; i <= 15; i++) {
        socket.triggerMessage(
          JSON.stringify({
            channel: { alternatives: [{ transcript: `文${i}` }] },
            is_final: true,
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
    const { result } = renderHook(() => useDeepgram());

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
    expect(result.current.error).toBe('Deepgram接続エラーが発生しました');

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

    // Verify keepalive works on reconnected socket
    vi.advanceTimersByTime(KEEPALIVE_INTERVAL_MS);
    expect(secondSocket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'KeepAlive' }));
  });
});
