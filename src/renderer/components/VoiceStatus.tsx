import React from 'react';
import { VoiceInputStatus } from '../hooks/use-voice-input';

interface VoiceStatusProps {
  status: VoiceInputStatus;
  isListening: boolean;
  onToggle: () => void;
  loading: boolean;
}

export const VoiceStatus: React.FC<VoiceStatusProps> = ({
  status,
  isListening,
  onToggle,
  loading,
}) => {
  const getStatusDisplay = () => {
    switch (status) {
      case 'idle':
        return { icon: '🎤', text: '待機中', class: 'idle' };
      case 'listening':
        return { icon: '👂', text: '聞き取り中...', class: 'listening' };
      case 'speech_detected':
        return { icon: '🗣️', text: '発話検知！', class: 'speech' };
      case 'processing':
        return { icon: '⏳', text: '音声処理中...', class: 'processing' };
      case 'error':
        return { icon: '⚠️', text: 'エラー', class: 'error' };
      default:
        return { icon: '❓', text: '不明', class: '' };
    }
  };

  const display = getStatusDisplay();

  return (
    <div className={`voice-status-container ${display.class}`}>
      <button
        className={`voice-toggle-button ${isListening ? 'active' : ''}`}
        onClick={onToggle}
        disabled={loading}
        title={isListening ? '録音停止' : '録音開始'}
      >
        <span className="icon">{loading ? '⌛' : display.icon}</span>
      </button>
      <div className="status-info">
        <span className="status-text">{display.text}</span>
      </div>
    </div>
  );
};
