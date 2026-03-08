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
  startListening: () => void;
  stopListening: () => void;
  toggleListening: () => void;
}

const MAX_DURATION_S = 30;

function getPreferredMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  // Prefer webm (Chrome/Edge/Firefox), fall back to mp4 (iOS Safari)
  for (const type of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return ""; // let browser pick default
}

export function useVoiceInput(
  options: UseVoiceInputOptions = {}
): UseVoiceInputReturn {
  const { lang = "zh", onResult, onError } = options;

  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [duration, setDuration] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);

  onResultRef.current = onResult;
  onErrorRef.current = onError;

  useEffect(() => {
    setIsSupported(
      typeof window !== "undefined" &&
        typeof MediaRecorder !== "undefined" &&
        !!navigator.mediaDevices?.getUserMedia
    );
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

  const stopListening = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop(); // triggers onstop → transcribe
    }
    setIsListening(false);
    setDuration(0);
    clearTimers();
  }, [clearTimers]);

  const startListening = useCallback(async () => {
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
        // Release mic
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
      setDuration(0);

      // Duration counter
      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);

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
  }, [stopListening, transcribe, cleanup]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    isListening,
    isTranscribing,
    isSupported,
    duration,
    startListening,
    stopListening,
    toggleListening,
  };
}
