import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDeepgram, KEEPALIVE_INTERVAL_MS, MIN_API_KEY_LENGTH } from '../hooks/use-deepgram';

/**
 * Mock WebSocket implementation for testing
 * Provides controlled WebSocket behavior with manual event triggering
 */
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readyState = MockWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: any }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  });

  constructor(public url: string, public protocols?: string | string[]) {
    MockWebSocket.instances.push(this);
  }

  /** Simulate WebSocket opening */
  triggerOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  /** Simulate receiving a message */
  triggerMessage(data: any) {
    this.onmessage?.({ data } as MessageEvent);
  }

  /** Simulate WebSocket error */
  triggerError(error: any) {
    this.onerror?.(error);
  }
}

let originalWebSocket: typeof WebSocket | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  MockWebSocket.instances = [];
  originalWebSocket = globalThis.WebSocket;
  (globalThis as any).WebSocket = MockWebSocket as any;
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  (globalThis as any).WebSocket = originalWebSocket;
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
      result.current.connect('valid-api-key-with-sufficient-length');
    });

    const socket = MockWebSocket.instances[0];
    expect(socket.protocols).toEqual(['token', 'valid-api-key-with-sufficient-length']);

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
      result.current.connect('valid-api-key-with-sufficient-length');
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
      result.current.connect('valid-api-key-with-sufficient-length');
    });

    const firstSocket = MockWebSocket.instances[0];
    act(() => {
      firstSocket.triggerOpen();
    });

    act(() => {
      result.current.connect('valid-api-key-with-sufficient-length');
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
      result.current.connect('valid-api-key-with-sufficient-length');
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
      result.current.connect('valid-api-key-with-sufficient-length');
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

    act(() => {
      result.current.connect('');
    });
    expect(result.current.error).toBe('APIキーが無効です');

    act(() => {
      result.current.connect('   ');
    });
    expect(result.current.error).toBe('APIキーが無効です');

    act(() => {
      result.current.connect('short');
    });
    expect(result.current.error).toBe('APIキーの形式が正しくありません');

    // Test exact minimum length boundary
    act(() => {
      result.current.connect('a'.repeat(MIN_API_KEY_LENGTH - 1));
    });
    expect(result.current.error).toBe('APIキーの形式が正しくありません');
  });

  it('prevents duplicate connections while CONNECTING', () => {
    const { result } = renderHook(() => useDeepgram());

    // First connect call creates socket in CONNECTING state
    act(() => {
      result.current.connect('valid-api-key-with-sufficient-length');
    });

    const firstSocket = MockWebSocket.instances[0];
    expect(firstSocket.readyState).toBe(MockWebSocket.CONNECTING);

    // Second connect call should be ignored while still CONNECTING
    act(() => {
      result.current.connect('valid-api-key-with-sufficient-length');
    });

    // Should still have only one socket instance
    expect(MockWebSocket.instances.length).toBe(1);
  });

  it('allows reconnection after disconnect', () => {
    const { result } = renderHook(() => useDeepgram());

    // First connection
    act(() => {
      result.current.connect('valid-api-key-with-sufficient-length');
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
      result.current.connect('valid-api-key-with-sufficient-length');
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
      result.current.connect('valid-api-key-with-sufficient-length');
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
      result.current.connect('valid-api-key-with-sufficient-length');
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
});
