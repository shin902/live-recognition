import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDeepgram, KEEPALIVE_INTERVAL_MS } from '../hooks/use-deepgram';

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

  triggerOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  triggerMessage(data: any) {
    this.onmessage?.({ data } as MessageEvent);
  }

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
  it('connects, sends keepalive, and aggregates transcripts', async () => {
    const onFinalTranscript = vi.fn();
    const { result } = renderHook(() => useDeepgram({ onFinalTranscript }));

    act(() => {
      result.current.connect('api-key');
    });

    const socket = MockWebSocket.instances[0];
    expect(socket.protocols).toEqual(['token', 'api-key']);

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

  it('handles errors and closes connection', async () => {
    const { result } = renderHook(() => useDeepgram());

    act(() => {
      result.current.connect('api-key');
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
      result.current.connect('api-key');
    });

    const firstSocket = MockWebSocket.instances[0];
    act(() => {
      firstSocket.triggerOpen();
    });

    act(() => {
      result.current.connect('api-key');
    });

    expect(MockWebSocket.instances.length).toBe(1);
  });

  it('warns when sending audio before connection', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useDeepgram());

    act(() => {
      result.current.sendAudio(new Int16Array([1, 2]));
    });

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('clears transcripts', () => {
    const { result } = renderHook(() => useDeepgram());

    act(() => {
      result.current.connect('api-key');
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
      result.current.connect('api-key');
    });

    const socket = MockWebSocket.instances[0];
    act(() => socket.triggerOpen());

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    act(() => {
      socket.triggerMessage('not-json');
    });

    expect(result.current.transcript).toBe('');
    expect(result.current.interimTranscript).toBe('');
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
