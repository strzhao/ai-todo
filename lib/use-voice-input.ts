"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface UseVoiceInputOptions {
  lang?: string;
  onResult?: (transcript: string) => void;
  onError?: (error: string) => void;
}

interface UseVoiceInputReturn {
  isListening: boolean;
  isTranscribing: boolean;
  isSupported: boolean;
  duration: number;
  method: "webspeech" | "whisper" | null;
  startListening: () => void;
  stopListening: () => void;
  toggleListening: () => void;
}

const MAX_DURATION_S = 30;

// ─── Web Speech API detection ────────────────────────────────────────────────

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

function getWebSpeechConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  // iOS Safari's Web Speech API is unreliable - force Whisper fallback
  const ua = navigator.userAgent;
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isChrome = /CriOS|Chrome/.test(ua) && !/Edge/.test(ua);
  if (isIOS && !isChrome) return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

// ─── MediaRecorder helpers (Whisper fallback) ────────────────────────────────

function getPreferredMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const type of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useVoiceInput(
  options: UseVoiceInputOptions = {}
): UseVoiceInputReturn {
  const { lang = "zh", onResult, onError } = options;

  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [duration, setDuration] = useState(0);
  const [method, setMethod] = useState<"webspeech" | "whisper" | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const accumulatedRef = useRef<string>("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);

  onResultRef.current = onResult;
  onErrorRef.current = onError;

  useEffect(() => {
    const hasWebSpeech = !!getWebSpeechConstructor();
    const hasMediaRecorder =
      typeof window !== "undefined" &&
      typeof MediaRecorder !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia;
    setIsSupported(hasWebSpeech || hasMediaRecorder);
    if (hasWebSpeech) {
      setMethod("webspeech");
    } else if (hasMediaRecorder) {
      setMethod("whisper");
    }
  }, []);

  const clearTimers = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
  }, []);

  const cleanup = useCallback(() => {
    clearTimers();
    // Clean up Web Speech
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    accumulatedRef.current = "";
    // Clean up MediaRecorder
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
  }, [clearTimers]);

  // ─── Whisper (MediaRecorder) path ──────────────────────────────────────────

  const transcribe = useCallback(
    async (blob: Blob) => {
      setIsTranscribing(true);
      try {
        const form = new FormData();
        const ext = blob.type.includes("mp4") ? "mp4" : "webm";
        form.append("file", blob, `recording.${ext}`);
        form.append("language", lang);

        const res = await fetch("/api/transcribe", {
          method: "POST",
          body: form,
        });

        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(data.error || "语音识别失败");
        }

        const data = (await res.json()) as { text?: string };
        const text = data.text?.trim();
        if (text) {
          onResultRef.current?.(text);
        } else {
          onErrorRef.current?.("未识别到语音内容，请重试");
        }
      } catch (err) {
        onErrorRef.current?.(
          err instanceof Error ? err.message : "语音识别失败"
        );
      } finally {
        setIsTranscribing(false);
      }
    },
    [lang]
  );

  // ─── Duration timer helper ─────────────────────────────────────────────────

  const startDurationTimer = useCallback(() => {
    setDuration(0);
    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      setDuration(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
  }, []);

  // ─── Stop ──────────────────────────────────────────────────────────────────

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      // Web Speech path: stop() triggers onend which delivers result
      recognitionRef.current.stop();
      // Don't set isListening here; onend handler will do it
    } else {
      // MediaRecorder path
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.stop(); // triggers onstop -> transcribe
      }
      setIsListening(false);
      setDuration(0);
    }
    clearTimers();
  }, [clearTimers]);

  // ─── Start ─────────────────────────────────────────────────────────────────

  const startListening = useCallback(async () => {
    const WebSpeechCtor = getWebSpeechConstructor();

    if (WebSpeechCtor) {
      // ── Web Speech API path ──
      try {
        const recognition = new WebSpeechCtor();
        // Map lang codes
        const langMap: Record<string, string> = { zh: "zh-CN", en: "en-US", ja: "ja-JP" };
        recognition.lang = langMap[lang] || lang;
        recognition.continuous = true;
        recognition.interimResults = false;

        accumulatedRef.current = "";

        recognition.onresult = (event: SpeechRecognitionEvent) => {
          for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
              accumulatedRef.current += event.results[i][0].transcript;
            }
          }
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
          const errorMap: Record<string, string> = {
            "not-allowed": "麦克风权限被拒绝，请在浏览器设置中允许",
            "no-speech": "未检测到语音，请重试",
            "audio-capture": "无法访问麦克风",
            network: "网络连接问题，请检查网络",
            aborted: "",
          };
          const msg = errorMap[event.error] || `语音识别出错: ${event.error}`;
          if (msg) onErrorRef.current?.(msg);
        };

        recognition.onend = () => {
          const text = accumulatedRef.current.trim();
          if (text) {
            onResultRef.current?.(text);
          }
          accumulatedRef.current = "";
          recognitionRef.current = null;
          setIsListening(false);
          setDuration(0);
        };

        recognitionRef.current = recognition;
        recognition.start();
        setIsListening(true);

        startDurationTimer();

        // Auto-stop after max duration
        maxTimerRef.current = setTimeout(() => {
          stopListening();
        }, MAX_DURATION_S * 1000);
      } catch (err) {
        cleanup();
        onErrorRef.current?.(
          err instanceof DOMException && err.name === "NotAllowedError"
            ? "麦克风权限被拒绝，请在浏览器设置中允许"
            : "语音识别启动失败"
        );
      }
    } else {
      // ── MediaRecorder (Whisper) path ──
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;

        const mimeType = getPreferredMimeType();
        const recorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);

        chunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.onstop = () => {
          const chunks = chunksRef.current;
          stream.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          mediaRecorderRef.current = null;

          if (chunks.length > 0) {
            const blob = new Blob(chunks, {
              type: recorder.mimeType || "audio/webm",
            });
            transcribe(blob);
          }
          chunksRef.current = [];
        };

        mediaRecorderRef.current = recorder;
        recorder.start();
        setIsListening(true);

        startDurationTimer();

        // Auto-stop after max duration
        maxTimerRef.current = setTimeout(() => {
          stopListening();
        }, MAX_DURATION_S * 1000);
      } catch (err) {
        cleanup();
        if (err instanceof DOMException && err.name === "NotAllowedError") {
          onErrorRef.current?.("麦克风权限被拒绝，请在浏览器设置中允许");
        } else {
          onErrorRef.current?.("无法访问麦克风");
        }
      }
    }
  }, [lang, stopListening, transcribe, cleanup, startDurationTimer]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  // Cleanup on unmount
  useEffect(() => cleanup, [cleanup]);

  return {
    isListening,
    isTranscribing,
    isSupported,
    duration,
    method,
    startListening,
    stopListening,
    toggleListening,
  };
}
