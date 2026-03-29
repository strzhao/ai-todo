"use client";

import { useState, useEffect } from "react";
import { useVoiceInput } from "./use-voice-input";

export type VoiceNoteState = "idle" | "recording" | "summarizing";

interface UseVoiceNoteOptions {
  onResult: (title: string, rawText: string, tags: string[]) => void;
  onError?: () => void;
}

interface UseVoiceNoteReturn {
  voiceState: VoiceNoteState;
  isTranscribing: boolean;
  isSupported: boolean;
  duration: number;
  toggleListening: () => void;
}

/**
 * Higher-level hook for voice note input.
 * Wraps useVoiceInput with /api/summarize-voice AI summarization.
 */
export function useVoiceNote(options: UseVoiceNoteOptions): UseVoiceNoteReturn {
  const { onResult, onError } = options;
  const [voiceState, setVoiceState] = useState<VoiceNoteState>("idle");

  const { isListening, isTranscribing, isSupported, duration, toggleListening } =
    useVoiceInput({
      lang: "zh",
      onResult: async (transcript) => {
        setVoiceState("summarizing");
        try {
          const res = await fetch("/api/summarize-voice", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: transcript }),
          });
          if (!res.ok) throw new Error("summarize failed");
          const data = await res.json();
          const title = data.title || transcript;
          const tags: string[] = Array.isArray(data.tags) ? data.tags : [];
          onResult(title, transcript, tags);
        } catch {
          onResult(transcript, transcript, []);
        } finally {
          setVoiceState("idle");
        }
      },
      onError: () => {
        setVoiceState("idle");
        onError?.();
      },
    });

  useEffect(() => {
    if (isListening) setVoiceState("recording");
  }, [isListening]);

  return { voiceState, isTranscribing, isSupported, duration, toggleListening };
}
