/**
 * Voice input hook upgrade — acceptance test (Red Team)
 *
 * Based on design document — Voice Input for Notes.
 *
 * Design spec:
 * 1. Web Speech API as primary method, Whisper as fallback
 * 2. New return value `method: "webspeech" | "whisper" | null`
 * 3. `isSupported` is true when either Web Speech API or MediaRecorder is available
 * 4. iOS Safari: forces whisper fallback (Web Speech API unreliable on iOS)
 *
 * Acceptance criteria:
 * AC-1: When Web Speech API available → method = "webspeech", isSupported = true
 * AC-2: When Web Speech API NOT available but MediaRecorder is → method = "whisper", isSupported = true
 * AC-3: When neither is available → isSupported = false, method = null
 * AC-4: iOS Safari detection forces whisper fallback even if Web Speech API exists
 */

import { describe, it, expect } from "vitest";

// ── Pure logic tests (no React hooks, no DOM) ────────────────────────────────
// We test the detection/selection logic that the hook should implement,
// without importing React or the actual hook (Red Team: test design, not impl).

/**
 * Simulates the voice method detection logic as specified in the design doc.
 * The hook should implement equivalent logic.
 */
function detectVoiceMethod(env: {
  hasSpeechRecognition: boolean;
  hasMediaRecorder: boolean;
  isIOS: boolean;
}): { method: "webspeech" | "whisper" | null; isSupported: boolean } {
  const { hasSpeechRecognition, hasMediaRecorder, isIOS } = env;

  // iOS Safari: force whisper fallback (design spec point 4)
  if (isIOS && hasMediaRecorder) {
    return { method: "whisper", isSupported: true };
  }

  // Primary: Web Speech API
  if (hasSpeechRecognition && !isIOS) {
    return { method: "webspeech", isSupported: true };
  }

  // Fallback: Whisper via MediaRecorder
  if (hasMediaRecorder) {
    return { method: "whisper", isSupported: true };
  }

  // Nothing available
  return { method: null, isSupported: false };
}

/**
 * Simulates iOS detection logic (userAgent-based).
 */
function isIOSSafari(userAgent: string): boolean {
  return /iPhone|iPad|iPod/.test(userAgent);
}

describe("Voice input method detection logic", () => {
  it("AC-1: Web Speech API available → method is webspeech, isSupported is true", () => {
    const result = detectVoiceMethod({
      hasSpeechRecognition: true,
      hasMediaRecorder: true,
      isIOS: false,
    });
    expect(result.method).toBe("webspeech");
    expect(result.isSupported).toBe(true);
  });

  it("AC-1b: Web Speech API available without MediaRecorder → still webspeech", () => {
    const result = detectVoiceMethod({
      hasSpeechRecognition: true,
      hasMediaRecorder: false,
      isIOS: false,
    });
    expect(result.method).toBe("webspeech");
    expect(result.isSupported).toBe(true);
  });

  it("AC-2: No Web Speech API but MediaRecorder available → method is whisper, isSupported is true", () => {
    const result = detectVoiceMethod({
      hasSpeechRecognition: false,
      hasMediaRecorder: true,
      isIOS: false,
    });
    expect(result.method).toBe("whisper");
    expect(result.isSupported).toBe(true);
  });

  it("AC-3: Neither available → isSupported is false, method is null", () => {
    const result = detectVoiceMethod({
      hasSpeechRecognition: false,
      hasMediaRecorder: false,
      isIOS: false,
    });
    expect(result.method).toBeNull();
    expect(result.isSupported).toBe(false);
  });

  it("AC-4: iOS Safari forces whisper fallback even with Web Speech API", () => {
    const result = detectVoiceMethod({
      hasSpeechRecognition: true,
      hasMediaRecorder: true,
      isIOS: true,
    });
    expect(result.method).toBe("whisper");
    expect(result.isSupported).toBe(true);
  });

  it("AC-4b: iOS without MediaRecorder and with Speech API → not supported (iOS blocks webspeech)", () => {
    const result = detectVoiceMethod({
      hasSpeechRecognition: true,
      hasMediaRecorder: false,
      isIOS: true,
    });
    // iOS forces whisper, but no MediaRecorder → can't use whisper either
    // Web Speech API on iOS is unreliable per design, so falls through
    expect(result.isSupported).toBe(false);
    expect(result.method).toBeNull();
  });
});

describe("iOS Safari detection", () => {
  it("detects iPhone user agent", () => {
    expect(
      isIOSSafari(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
      )
    ).toBe(true);
  });

  it("detects iPad user agent", () => {
    expect(
      isIOSSafari("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15")
    ).toBe(true);
  });

  it("does not match Android", () => {
    expect(
      isIOSSafari("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36")
    ).toBe(false);
  });

  it("does not match desktop Chrome", () => {
    expect(
      isIOSSafari(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      )
    ).toBe(false);
  });

  it("does not match desktop Firefox", () => {
    expect(
      isIOSSafari("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0")
    ).toBe(false);
  });
});

describe("isSupported semantics", () => {
  it("isSupported = true means at least one method is available", () => {
    // All combos where isSupported should be true
    const supportedCombos = [
      { hasSpeechRecognition: true, hasMediaRecorder: true, isIOS: false },
      { hasSpeechRecognition: true, hasMediaRecorder: false, isIOS: false },
      { hasSpeechRecognition: false, hasMediaRecorder: true, isIOS: false },
      { hasSpeechRecognition: true, hasMediaRecorder: true, isIOS: true },
      { hasSpeechRecognition: false, hasMediaRecorder: true, isIOS: true },
    ];
    for (const combo of supportedCombos) {
      const result = detectVoiceMethod(combo);
      expect(result.isSupported).toBe(true);
      expect(result.method).not.toBeNull();
    }
  });

  it("isSupported = false only when no method is available", () => {
    const unsupportedCombos = [
      { hasSpeechRecognition: false, hasMediaRecorder: false, isIOS: false },
      { hasSpeechRecognition: false, hasMediaRecorder: false, isIOS: true },
      // iOS with Speech API but no MediaRecorder — design says webspeech unreliable on iOS
      { hasSpeechRecognition: true, hasMediaRecorder: false, isIOS: true },
    ];
    for (const combo of unsupportedCombos) {
      const result = detectVoiceMethod(combo);
      expect(result.isSupported).toBe(false);
      expect(result.method).toBeNull();
    }
  });
});
