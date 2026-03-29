"use client";

import { Mic, MicOff, Loader2 } from "lucide-react";
import type { VoiceNoteState } from "@/lib/use-voice-note";

interface VoiceButtonProps {
  voiceState: VoiceNoteState;
  isTranscribing: boolean;
  duration: number;
  disabled?: boolean;
  onClick: () => void;
}

function getButtonClass(voiceState: VoiceNoteState): string {
  if (voiceState === "recording") {
    return "bg-sage text-white animate-pulse";
  }
  if (voiceState === "summarizing") {
    return "bg-muted text-muted-foreground";
  }
  return "text-muted-foreground hover:text-foreground hover:bg-muted";
}

function getTitle(voiceState: VoiceNoteState): string {
  if (voiceState === "recording") return "停止录制";
  if (voiceState === "summarizing") return "AI 整理中...";
  return "语音输入";
}

export function VoiceButton({ voiceState, isTranscribing, duration, disabled, onClick }: VoiceButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || voiceState === "summarizing"}
      className={`inline-flex items-center justify-center rounded-md h-8 px-2 text-sm transition-colors ${getButtonClass(voiceState)}`}
      title={getTitle(voiceState)}
    >
      {voiceState === "recording" ? (
        <>
          <MicOff className="w-4 h-4 mr-1" />
          <span className="text-xs tabular-nums">{duration}s</span>
        </>
      ) : voiceState === "summarizing" || isTranscribing ? (
        <>
          <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          <span className="text-xs">{isTranscribing ? "识别中..." : "整理中..."}</span>
        </>
      ) : (
        <Mic className="w-4 h-4" />
      )}
    </button>
  );
}
