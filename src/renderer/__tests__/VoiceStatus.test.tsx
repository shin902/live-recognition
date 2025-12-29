import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { VoiceStatus } from '../components/VoiceStatus';

/**
 * Test suite for VoiceStatus component
 * 
 * Coverage:
 * - All status states (idle, listening, speech_detected, processing, error)
 * - Button interaction and toggle callback
 * - Loading state and disabled button
 * - Status icon and text rendering
 */
describe('VoiceStatus', () => {
  afterEach(() => {
    cleanup();
  });
  it('renders status text and toggles button state', () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <VoiceStatus status="idle" isListening={false} loading={false} onToggle={onToggle} />
    );

    expect(screen.getByText('待機中')).toBeInTheDocument();
    const button = screen.getByRole('button');
    expect(button.className).not.toContain('active');
    expect(button.getAttribute('title')).toBe('録音開始');

    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(
      <VoiceStatus status="listening" isListening={true} loading={false} onToggle={onToggle} />
    );
    expect(screen.getByText('聞き取り中...')).toBeInTheDocument();
    expect(screen.getByRole('button').className).toContain('active');
    expect(screen.getByRole('button').getAttribute('title')).toBe('録音停止');

    rerender(
      <VoiceStatus status="error" isListening={true} loading={true} onToggle={onToggle} />
    );
    expect(screen.getByText('エラー')).toBeInTheDocument();
    expect(screen.getByRole('button').hasAttribute('disabled')).toBe(true);
  });

  it('renders speech_detected state correctly', () => {
    const onToggle = vi.fn();
    render(
      <VoiceStatus status="speech_detected" isListening={true} loading={false} onToggle={onToggle} />
    );

    expect(screen.getByText('発話検知！')).toBeInTheDocument();
    const container = screen.getByText('発話検知！').closest('.voice-status-container');
    expect(container?.className).toContain('speech');
  });

  it('renders processing state correctly', () => {
    const onToggle = vi.fn();
    render(
      <VoiceStatus status="processing" isListening={true} loading={false} onToggle={onToggle} />
    );

    expect(screen.getByText('音声処理中...')).toBeInTheDocument();
    const container = screen.getByText('音声処理中...').closest('.voice-status-container');
    expect(container?.className).toContain('processing');
  });

  it('shows loading icon when loading is true', () => {
    const onToggle = vi.fn();
    render(
      <VoiceStatus status="idle" isListening={false} loading={true} onToggle={onToggle} />
    );

    // Loading icon should be displayed in button
    const button = screen.getByRole('button');
    expect(button.querySelector('.icon')?.textContent).toBe('⌛');
    // Button should be disabled
    expect(button).toBeDisabled();
  });
});
