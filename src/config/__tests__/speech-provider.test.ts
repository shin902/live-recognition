import { describe, it, expect, afterEach } from 'vitest';
import { getSpeechProvider, DEFAULT_SPEECH_PROVIDER, SpeechProvider } from '../speech-provider';

describe('speech-provider', () => {
  const originalEnv = process.env.SPEECH_PROVIDER;

  afterEach(() => {
    // Restore original environment
    if (originalEnv !== undefined) {
      process.env.SPEECH_PROVIDER = originalEnv;
    } else {
      delete process.env.SPEECH_PROVIDER;
    }
  });

  describe('DEFAULT_SPEECH_PROVIDER', () => {
    it('should be elevenlabs', () => {
      expect(DEFAULT_SPEECH_PROVIDER).toBe('elevenlabs');
    });
  });

  describe('getSpeechProvider', () => {
    it('returns deepgram when SPEECH_PROVIDER=deepgram', () => {
      process.env.SPEECH_PROVIDER = 'deepgram';
      expect(getSpeechProvider()).toBe('deepgram');
    });

    it('returns elevenlabs when SPEECH_PROVIDER=elevenlabs', () => {
      process.env.SPEECH_PROVIDER = 'elevenlabs';
      expect(getSpeechProvider()).toBe('elevenlabs');
    });

    it('returns default when SPEECH_PROVIDER is unset', () => {
      delete process.env.SPEECH_PROVIDER;
      expect(getSpeechProvider()).toBe(DEFAULT_SPEECH_PROVIDER);
    });

    it('returns default when SPEECH_PROVIDER is empty string', () => {
      process.env.SPEECH_PROVIDER = '';
      expect(getSpeechProvider()).toBe(DEFAULT_SPEECH_PROVIDER);
    });

    it('returns default when SPEECH_PROVIDER has invalid value', () => {
      process.env.SPEECH_PROVIDER = 'invalid-provider';
      expect(getSpeechProvider()).toBe(DEFAULT_SPEECH_PROVIDER);
    });

    it('handles case-insensitive input: DEEPGRAM', () => {
      process.env.SPEECH_PROVIDER = 'DEEPGRAM';
      expect(getSpeechProvider()).toBe('deepgram');
    });

    it('handles case-insensitive input: Deepgram', () => {
      process.env.SPEECH_PROVIDER = 'Deepgram';
      expect(getSpeechProvider()).toBe('deepgram');
    });

    it('handles case-insensitive input: ELEVENLABS', () => {
      process.env.SPEECH_PROVIDER = 'ELEVENLABS';
      expect(getSpeechProvider()).toBe('elevenlabs');
    });

    it('handles case-insensitive input: ElevenLabs', () => {
      process.env.SPEECH_PROVIDER = 'ElevenLabs';
      expect(getSpeechProvider()).toBe('elevenlabs');
    });

    it('handles whitespace in environment variable', () => {
      process.env.SPEECH_PROVIDER = '  deepgram  ';
      // Current implementation doesn't trim, so this returns default
      expect(getSpeechProvider()).toBe(DEFAULT_SPEECH_PROVIDER);
    });

    it('returns correct type: SpeechProvider', () => {
      process.env.SPEECH_PROVIDER = 'deepgram';
      const provider = getSpeechProvider();
      const validProviders: SpeechProvider[] = ['deepgram', 'elevenlabs'];
      expect(validProviders).toContain(provider);
    });
  });
});
