import { useState, useRef, useCallback, useEffect } from 'react';
import type { SupportedLanguage, VoiceInputStatus } from '../types/chat';
import { transcribeSpeechAudio } from '../services/api';

// SpeechRecognition type definitions for cross-browser compatibility
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [index: number]: {
        transcript: string;
      };
    };
  };
}

interface SpeechRecognitionErrorEventLike {
  error: string;
  message?: string;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onspeechend: (() => void) | null;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionLike;
}

interface WindowWithSpeech {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

interface UseVoiceInputOptions {
  onTranscriptUpdate?: (text: string, isFinal: boolean) => void;
  onFinalTranscript?: (text: string) => void;
  onStatusChange?: (status: VoiceInputStatus) => void;
}

/**
 * Maps application SupportedLanguage to standard BCP 47 language tags for SpeechRecognition.
 * Banking intelligence targets English (India), Hindi, and Hinglish.
 */
export function mapLanguageToBCP47(lang: SupportedLanguage): string {
  switch (lang) {
    case 'hi':
      return 'hi-IN';
    case 'hinglish':
      // hi-IN recognizes Indian phonetic phrases and Hindi loan words accurately
      return 'hi-IN';
    case 'en':
      return 'en-IN';
    case 'auto':
    default:
      return 'en-IN';
  }
}

export function useVoiceInput({
  onTranscriptUpdate,
  onFinalTranscript,
  onStatusChange,
}: UseVoiceInputOptions = {}) {
  const [status, setStatus] = useState<VoiceInputStatus>('idle');
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastLanguage, setLastLanguage] = useState<SupportedLanguage>('auto');
  const [isRecordingFallback, setIsRecordingFallback] = useState<boolean>(false);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const currentSessionTranscriptRef = useRef<string>('');
  const fallbackTimeoutRef = useRef<number | null>(null);

  // Check if Web Speech API is supported
  const win = typeof window !== 'undefined' ? (window as unknown as WindowWithSpeech) : undefined;
  const isSpeechRecognitionSupported = Boolean(win?.SpeechRecognition || win?.webkitSpeechRecognition);
  const isMediaRecorderSupported = typeof window !== 'undefined' && Boolean(window.MediaRecorder);
  const isSupported = isSpeechRecognitionSupported || isMediaRecorderSupported;

  const updateStatus = useCallback(
    (newStatus: VoiceInputStatus) => {
      setStatus(newStatus);
      onStatusChange?.(newStatus);
    },
    [onStatusChange]
  );

  // Stop any active hardware media stream tracks immediately to safeguard privacy
  const releaseMediaStream = useCallback(() => {
    if (mediaStreamRef.current) {
      try {
        mediaStreamRef.current.getTracks().forEach((track) => {
          track.stop();
        });
      } catch {
        // Safe no-op
      }
      mediaStreamRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (fallbackTimeoutRef.current) {
        clearTimeout(fallbackTimeoutRef.current);
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // ignore
        }
      }
      releaseMediaStream();
    };
  }, [releaseMediaStream]);

  // Cancel listening and discard session
  const cancelListening = useCallback(() => {
    if (fallbackTimeoutRef.current) {
      clearTimeout(fallbackTimeoutRef.current);
      fallbackTimeoutRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
      mediaRecorderRef.current = null;
    }
    releaseMediaStream();
    audioChunksRef.current = [];
    currentSessionTranscriptRef.current = '';
    setIsRecordingFallback(false);
    setInterimTranscript('');
    setErrorMessage(null);
    updateStatus('idle');
  }, [releaseMediaStream, updateStatus]);

  // Stop listening gracefully and finalize
  const stopListening = useCallback(() => {
    if (fallbackTimeoutRef.current) {
      clearTimeout(fallbackTimeoutRef.current);
      fallbackTimeoutRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    updateStatus('processing');
  }, [updateStatus]);

  // MediaRecorder Fallback for browsers with blocked/unreachable cloud recognition (e.g. Brave, adblockers, offline)
  const startMediaRecorderFallback = useCallback(
    async (lang: SupportedLanguage) => {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        setErrorMessage(
          'Speech recognition service is unreachable and audio recording is unsupported on this browser.'
        );
        updateStatus('error');
        return;
      }

      try {
        setIsRecordingFallback(true);
        updateStatus('listening');

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;

        // Auto-detect optimal mime type
        let mimeType = 'audio/webm';
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
          mimeType = 'audio/ogg';
        }

        const recorder = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = recorder;
        audioChunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };

        recorder.onstop = async () => {
          releaseMediaStream();
          const recordedBlobs = [...audioChunksRef.current];
          audioChunksRef.current = [];

          const totalSize = recordedBlobs.reduce((acc, c) => acc + c.size, 0);
          if (recordedBlobs.length === 0 || totalSize === 0) {
            setIsRecordingFallback(false);
            setErrorMessage('No speech or audio captured in recording. Please check your mic and try speaking again.');
            updateStatus('error');
            return;
          }

          updateStatus('processing');
          try {
            const combinedBlob = new Blob(recordedBlobs, { type: mimeType });
            const result = await transcribeSpeechAudio(combinedBlob, lang);

            if (result.transcript && result.transcript.trim()) {
              const clean = result.transcript.trim();
              currentSessionTranscriptRef.current = clean;
              onTranscriptUpdate?.(clean, true);
              onFinalTranscript?.(clean);
              updateStatus('idle');
            } else {
              setErrorMessage('No speech was detected in the audio recording. Please speak clearly.');
              updateStatus('error');
            }
          } catch (err: unknown) {
            const msg =
              err instanceof Error
                ? err.message
                : 'Speech service unreachable. Please ensure internet connectivity or type your query.';
            setErrorMessage(msg);
            updateStatus('error');
          } finally {
            setIsRecordingFallback(false);
          }
        };

        recorder.start(250); // collect chunks every 250ms

        // Safety timeout: automatically stop after 20 seconds
        fallbackTimeoutRef.current = window.setTimeout(() => {
          if (recorder.state === 'recording') {
            stopListening();
          }
        }, 20000);
      } catch (recErr) {
        setIsRecordingFallback(false);
        releaseMediaStream();
        const err = recErr as Error;
        if (err.name === 'NotAllowedError') {
          setErrorMessage('Microphone access denied. Please click the padlock or mic icon in your address bar.');
        } else {
          setErrorMessage('Failed to start microphone recording: ' + err.message);
        }
        updateStatus('error');
      }
    },
    [onFinalTranscript, onTranscriptUpdate, releaseMediaStream, stopListening, updateStatus]
  );

  // Start listening with chosen language
  const startListening = useCallback(
    async (lang: SupportedLanguage = 'auto') => {
      setErrorMessage(null);
      setLastLanguage(lang);
      currentSessionTranscriptRef.current = '';
      setInterimTranscript('');

      // Browser compatibility check
      if (!isSupported) {
        setErrorMessage(
          'Speech recognition is not supported in this browser. Please use Google Chrome, Microsoft Edge, or a modern browser.'
        );
        updateStatus('error');
        return;
      }

      // Check / request microphone permission safely without holding audio lock
      updateStatus('requesting_permission');
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          // Acquire and immediately release stream to verify permissions without blocking SpeechRecognition device handle
          const probeStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          probeStream.getTracks().forEach((track) => track.stop());
        }
      } catch (err) {
        const error = err as Error;
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          setErrorMessage(
            'Microphone access denied. Please allow microphone permission in your browser address bar.'
          );
        } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
          setErrorMessage(
            'No microphone device found. Please connect an audio input device to continue.'
          );
        } else {
          setErrorMessage('Unable to access microphone: ' + (error.message || 'Permission failed'));
        }
        updateStatus('error');
        return;
      }

      // 1. Try Browser-Native SpeechRecognition
      const winLocal = typeof window !== 'undefined' ? (window as unknown as WindowWithSpeech) : undefined;
      const SpeechRecognitionClass = winLocal?.SpeechRecognition || winLocal?.webkitSpeechRecognition;

      if (!SpeechRecognitionClass) {
        // Fallback directly to MediaRecorder if SpeechRecognition is missing (e.g. Firefox)
        void startMediaRecorderFallback(lang);
        return;
      }

      try {
        // Abort any existing instance if lingering
        if (recognitionRef.current) {
          try {
            recognitionRef.current.abort();
          } catch {
            // no-op
          }
          recognitionRef.current = null;
        }

        const recognition: SpeechRecognitionLike = new SpeechRecognitionClass();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;
        recognition.lang = mapLanguageToBCP47(lang);

        recognition.onstart = () => {
          updateStatus('listening');
        };

        recognition.onresult = (event: SpeechRecognitionEventLike) => {
          let interim = '';
          let final = '';

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              final += transcript;
            } else {
              interim += transcript;
            }
          }

          if (interim) {
            setInterimTranscript(interim);
            onTranscriptUpdate?.(interim, false);
          }

          if (final) {
            const trimmed = final.trim();
            currentSessionTranscriptRef.current = trimmed;
            setInterimTranscript('');
            onTranscriptUpdate?.(trimmed, true);
            onFinalTranscript?.(trimmed);
          }
        };

        recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
          if (event.error === 'aborted') {
            // User or system stopped recognition, quiet reset
            return;
          }

          // In case of network error (Brave shields blocking Google servers, network drop), attempt MediaRecorder fallback
          if (event.error === 'network') {
            recognitionRef.current = null;
            void startMediaRecorderFallback(lang);
            return;
          }

          let msg = 'Speech recognition encountered an issue.';
          if (event.error === 'not-allowed') {
            msg = 'Microphone access denied. Please click the padlock or mic icon in your browser address bar to allow.';
          } else if (event.error === 'service-not-allowed') {
            msg = 'Speech recognition service is disabled by your browser or OS privacy settings.';
          } else if (event.error === 'no-speech') {
            msg = 'No speech was detected. Please check your mic and speak clearly.';
          } else if (event.error === 'audio-capture') {
            msg = 'No audio input detected. Please verify your microphone is plugged in and unmuted.';
          } else if (event.error === 'language-not-supported') {
            msg = 'Selected language is not supported by your browser voice service. Switched to English.';
          }

          setErrorMessage(msg);
          updateStatus('error');
          releaseMediaStream();
        };

        recognition.onspeechend = () => {
          updateStatus('processing');
        };

        recognition.onend = () => {
          releaseMediaStream();
          recognitionRef.current = null;
          if (currentSessionTranscriptRef.current) {
            onFinalTranscript?.(currentSessionTranscriptRef.current);
          }
          setStatus((prev) => (prev === 'error' ? 'error' : 'idle'));
        };

        recognitionRef.current = recognition;
        recognition.start();
      } catch {
        // Fallback to MediaRecorder on exception
        void startMediaRecorderFallback(lang);
      }
    },
    [isSupported, onFinalTranscript, onTranscriptUpdate, releaseMediaStream, startMediaRecorderFallback, updateStatus]
  );

  // Retry previous attempt
  const retry = useCallback(() => {
    void startListening(lastLanguage);
  }, [lastLanguage, startListening]);

  const clearError = useCallback(() => {
    setErrorMessage(null);
    updateStatus('idle');
  }, [updateStatus]);

  return {
    status,
    isSupported,
    interimTranscript,
    errorMessage,
    isRecordingFallback,
    startListening,
    stopListening,
    cancelListening,
    retry,
    clearError,
  };
}
