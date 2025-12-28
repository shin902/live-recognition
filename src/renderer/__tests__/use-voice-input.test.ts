import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useVoiceInput } from '../hooks/use-voice-input';
import * as wavUtils from '../utils/wav-utils';
import { MicVAD } from '@ricky0123/vad-web';

const mockStart = vi.fn();
const mockPause = vi.fn();
const mockDestroy = vi.fn();
type VadOptions = Parameters<typeof MicVAD.new>[0];
let latestOptions: VadOptions | null;

vi.mock('@ricky0123/vad-web', () => ({
  MicVAD: {
    new: vi.fn(async (options) => {
      latestOptions = options;
      return { start: mockStart, pause: mockPause, destroy: mockDestroy };
    }),
  },
}));

const mockedNew = MicVAD.new as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  latestOptions = null;
  vi.clearAllMocks();
});

afterEach(() => {
  latestOptions = null;
});

describe('useVoiceInput', () => {
  it('initializes VAD and toggles listening state', async () => {
    const { result } = renderHook(() => useVoiceInput());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockedNew).toHaveBeenCalled();

    await act(async () => {
      await result.current.toggleListening();
    });

    expect(mockStart).toHaveBeenCalled();
    expect(result.current.isListening).toBe(true);
    expect(result.current.status).toBe('listening');

    await act(async () => {
      await result.current.toggleListening();
    });

    expect(mockPause).toHaveBeenCalled();
    expect(result.current.isListening).toBe(false);
    expect(result.current.status).toBe('idle');
  });

  it('no-ops toggle when VAD not ready', async () => {
    const { result } = renderHook(() => useVoiceInput());

    await act(async () => {
      await result.current.toggleListening();
    });

    expect(result.current.isListening).toBe(false);
    expect(result.current.status).toBe('idle');
  });

  it('surfaces initialization failure', async () => {
    mockedNew.mockRejectedValueOnce(new Error('Mic permission denied'));
    const onError = vi.fn();

    const { result } = renderHook(() => useVoiceInput({ onError }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.errored).toBe('Mic permission denied');
    expect(onError).toHaveBeenCalledWith('Mic permission denied');
  });

  it('emits callbacks on speech events and audio frames', async () => {
    const onSpeechStart = vi.fn();
    const onSpeechEnd = vi.fn();
    const onAudioData = vi.fn();

    const { result } = renderHook(() =>
      useVoiceInput({ onSpeechStart, onSpeechEnd, onAudioData })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockedNew).toHaveBeenCalled();

    act(() => {
      latestOptions?.onSpeechStart?.();
    });
    expect(onSpeechStart).toHaveBeenCalled();

    const frame = new Float32Array([0, 0.25]);
    act(() => {
      latestOptions?.onFrameProcessed?.(undefined, frame);
    });
    expect(onAudioData).toHaveBeenCalledWith(expect.any(Int16Array));

    await act(async () => {
      latestOptions?.onSpeechEnd?.(new Float32Array([0, 0.5]));
    });

    await waitFor(() => expect(result.current.status).toBe('listening'));
    expect(onSpeechEnd).toHaveBeenCalledWith(expect.any(Blob));
  });

  it('handles conversion errors on speech end', async () => {
    const onError = vi.fn();
    const convertSpy = vi
      .spyOn(wavUtils, 'convertFloat32ToWav')
      .mockImplementation(() => {
        throw new Error('conversion failed');
      });

    const { result } = renderHook(() => useVoiceInput({ onError }));

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      latestOptions?.onSpeechEnd?.(new Float32Array([0.1]));
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(onError).toHaveBeenCalledWith('音声変換に失敗しました');

    convertSpy.mockRestore();
  });
});
