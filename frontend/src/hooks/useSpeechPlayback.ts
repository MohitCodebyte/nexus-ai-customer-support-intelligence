import { useState, useRef, useCallback, useEffect } from 'react';

export type SpeechPlaybackState = 'idle' | 'playing' | 'paused';
export type SpeechSpeed = 0.75 | 1 | 1.25 | 1.5;

/**
 * Strips raw markdown syntax, code blocks, URLs, and bullet points
 * so SpeechSynthesis reads only conversational, human-friendly text.
 * Never reads internal metadata.
 */
export function cleanTextForSpeech(text: string): string {
  if (!text) return '';
  return text
    // Remove markdown code blocks
    .replace(/```[\s\S]*?```/g, '')
    // Remove inline code
    .replace(/`([^`]+)`/g, '$1')
    // Remove bold and italics
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    // Remove markdown links [text](url) -> text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Replace bare URLs with "website link"
    .replace(/https?:\/\/[^\s]+/g, 'website link')
    // Remove markdown headers
    .replace(/^#{1,6}\s+/gm, '')
    // Remove blockquotes
    .replace(/^>\s+/gm, '')
    // Replace bullet points and numbered lists with commas for natural pauses
    .replace(/^[*\-+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    // Remove excessive symbols/decorations
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
    // Normalize newlines and consecutive whitespace
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Automatically chooses the best installed voice for the language:
 * - Hindi (Devanagari): prefers hi-IN voices (e.g. Google हिन्दी, Microsoft Hemant/Kalpana)
 * - Hinglish: prefers hi-IN or en-IN voices (Indian accent handles Roman Hindi naturally)
 * - English: prefers en-IN, en-US, en-GB natural voices
 */
export function selectBestVoice(
  text: string,
  voices: SpeechSynthesisVoice[]
): SpeechSynthesisVoice | null {
  if (!voices || voices.length === 0) return null;

  const isHindi = /[\u0900-\u097F]/.test(text);
  const isHinglish =
    /karein|kare|hai|aapka|turant|paise|kese|kho gya|nahi|nhi|chahiye|karna/i.test(text);

  if (isHindi) {
    // 1. Exact Hindi voice
    const hindiVoice = voices.find((v) => v.lang.toLowerCase().startsWith('hi'));
    if (hindiVoice) return hindiVoice;
    // Fallback: Indian English voice (often understands Hindi phonetics)
    const enInVoice = voices.find((v) => v.lang.toLowerCase() === 'en-in');
    if (enInVoice) return enInVoice;
  } else if (isHinglish) {
    // For Hinglish, Indian English or Hindi voice pronounces Hindi loan words correctly
    const enInVoice = voices.find(
      (v) =>
        v.lang.toLowerCase() === 'en-in' ||
        v.name.toLowerCase().includes('india') ||
        v.name.toLowerCase().includes('ravi')
    );
    if (enInVoice) return enInVoice;

    const hindiVoice = voices.find((v) => v.lang.toLowerCase().startsWith('hi'));
    if (hindiVoice) return hindiVoice;
  }

  // English fallback: Prioritize Indian English, then natural US/GB voices
  const preferredEn =
    voices.find((v) => v.lang.toLowerCase() === 'en-in') ||
    voices.find(
      (v) =>
        v.lang.toLowerCase().startsWith('en') &&
        (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Online'))
    ) ||
    voices.find((v) => v.lang.toLowerCase().startsWith('en'));

  return preferredEn || voices[0] || null;
}

interface UseSpeechPlaybackProps {
  onSpeakingChange?: (isSpeaking: boolean) => void;
}

export function useSpeechPlayback({ onSpeakingChange }: UseSpeechPlaybackProps = {}) {
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [playbackState, setPlaybackState] = useState<SpeechPlaybackState>('idle');
  const [playbackSpeed, setPlaybackSpeed] = useState<SpeechSpeed>(1);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const currentTextRef = useRef<string>('');
  const currentMessageIdRef = useRef<string | null>(null);

  const isSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  // Load available speech synthesis voices
  useEffect(() => {
    if (!isSupported) return;

    const updateVoices = () => {
      const available = window.speechSynthesis.getVoices();
      if (available.length > 0) {
        setVoices(available);
      }
    };

    updateVoices();
    window.speechSynthesis.onvoiceschanged = updateVoices;

    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, [isSupported]);

  // Clean up speech on unmount
  useEffect(() => {
    return () => {
      if (isSupported && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, [isSupported]);

  // Stop active speech completely
  const stop = useCallback(() => {
    if (isSupported && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    activeUtteranceRef.current = null;
    currentMessageIdRef.current = null;
    currentTextRef.current = '';
    setActiveMessageId(null);
    setPlaybackState('idle');
    onSpeakingChange?.(false);
  }, [isSupported, onSpeakingChange]);

  // Pause playback
  const pause = useCallback(() => {
    if (isSupported && window.speechSynthesis && playbackState === 'playing') {
      window.speechSynthesis.pause();
      setPlaybackState('paused');
      onSpeakingChange?.(false);
    }
  }, [isSupported, onSpeakingChange, playbackState]);

  // Resume playback
  const resume = useCallback(() => {
    if (isSupported && window.speechSynthesis && playbackState === 'paused') {
      window.speechSynthesis.resume();
      setPlaybackState('playing');
      onSpeakingChange?.(true);
    }
  }, [isSupported, onSpeakingChange, playbackState]);

  // Play speech for a specific message
  const play = useCallback(
    (messageId: string, rawText: string, speedOverride?: SpeechSpeed) => {
      if (!isSupported || !window.speechSynthesis) return;

      // Rule: Stop previous speech when another message starts playing
      window.speechSynthesis.cancel();

      const speedToUse = speedOverride ?? playbackSpeed;
      const cleanText = cleanTextForSpeech(rawText);
      if (!cleanText) return;

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = speedToUse;
      utterance.pitch = 1.0;

      // Select appropriate voice based on English / Hindi / Hinglish content
      const chosenVoice = selectBestVoice(cleanText, voices);
      if (chosenVoice) {
        utterance.voice = chosenVoice;
      }

      utterance.onstart = () => {
        setPlaybackState('playing');
        onSpeakingChange?.(true);
      };

      utterance.onend = () => {
        if (activeUtteranceRef.current === utterance) {
          setActiveMessageId(null);
          setPlaybackState('idle');
          activeUtteranceRef.current = null;
          currentMessageIdRef.current = null;
          onSpeakingChange?.(false);
        }
      };

      utterance.onerror = (e) => {
        // 'interrupted' or 'canceled' happens naturally when replaced or stopped
        if (e.error !== 'interrupted' && e.error !== 'canceled') {
          console.warn('SpeechSynthesis error:', e.error);
        }
        if (activeUtteranceRef.current === utterance) {
          setActiveMessageId(null);
          setPlaybackState('idle');
          activeUtteranceRef.current = null;
          currentMessageIdRef.current = null;
          onSpeakingChange?.(false);
        }
      };

      activeUtteranceRef.current = utterance;
      currentMessageIdRef.current = messageId;
      currentTextRef.current = rawText;
      setActiveMessageId(messageId);
      setPlaybackState('playing');
      onSpeakingChange?.(true);

      window.speechSynthesis.speak(utterance);
    },
    [isSupported, onSpeakingChange, playbackSpeed, voices]
  );

  // Change speed and restart current utterance if playing
  const setSpeed = useCallback(
    (newSpeed: SpeechSpeed) => {
      setPlaybackSpeed(newSpeed);
      if (activeMessageId && currentTextRef.current && playbackState !== 'idle') {
        play(activeMessageId, currentTextRef.current, newSpeed);
      }
    },
    [activeMessageId, play, playbackState]
  );

  return {
    isSupported,
    activeMessageId,
    playbackState,
    playbackSpeed,
    play,
    pause,
    resume,
    stop,
    setSpeed,
  };
}
