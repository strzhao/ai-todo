"use client";

import { Mic } from "lucide-react";

interface VoiceRecordingOverlayProps {
  duration: number;
}

export function VoiceRecordingOverlay({ duration }: VoiceRecordingOverlayProps) {
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-foreground/60 pointer-events-none">
      <div className="flex flex-col items-center gap-4">
        <div className="size-20 rounded-full bg-sage flex items-center justify-center animate-pulse">
          <Mic className="size-10 text-white" />
        </div>
        <span className="text-2xl font-medium text-white tabular-nums">
          {duration}s
        </span>
        <span className="text-sm text-white/70">松开 结束录音</span>
      </div>
    </div>
  );
}
