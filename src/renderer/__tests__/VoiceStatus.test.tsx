import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VoiceStatus } from '../components/VoiceStatus';

describe('VoiceStatus', () => {
  it('renders status text and toggles button state', () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <VoiceStatus status="idle" isListening={false} loading={false} onToggle={onToggle} />
    );

    expect(screen.getByText('待機中')).toBeTruthy();
    const button = screen.getByRole('button');
    expect(button.className).not.toContain('active');
    expect(button.getAttribute('title')).toBe('録音開始');

    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(
      <VoiceStatus status="listening" isListening={true} loading={false} onToggle={onToggle} />
    );
    expect(screen.getByText('聞き取り中...')).toBeTruthy();
    expect(screen.getByRole('button').className).toContain('active');
    expect(screen.getByRole('button').getAttribute('title')).toBe('録音停止');

    rerender(
      <VoiceStatus status="error" isListening={true} loading={true} onToggle={onToggle} />
    );
    expect(screen.getByText('エラー')).toBeTruthy();
    expect(screen.getByRole('button').hasAttribute('disabled')).toBe(true);
  });
});
