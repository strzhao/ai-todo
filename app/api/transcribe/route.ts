import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";

export const preferredRegion = "hkg1";
export const maxDuration = 30;

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB
const ALLOWED_PREFIXES = [
  "audio/",
  "video/webm", // some browsers report video/webm for audio-only
];

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const baseUrl = process.env.STT_BASE_URL;
  const apiKey = process.env.STT_API_KEY;
  const model = process.env.STT_MODEL || "whisper-large-v3";

  if (!baseUrl) {
    return NextResponse.json(
      { error: "语音识别服务未配置" },
      { status: 503 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "请求格式错误，需要 FormData" },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "缺少音频文件" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "音频文件过大（上限 4MB）" },
      { status: 400 }
    );
  }

  if (file.type && !ALLOWED_PREFIXES.some((p) => file.type.startsWith(p))) {
    return NextResponse.json(
      { error: `不支持的音频格式：${file.type}` },
      { status: 400 }
    );
  }

  const language = (formData.get("language") as string) || "zh";

  // Forward to Whisper-compatible API
  const sttForm = new FormData();
  sttForm.append("file", file, file.name || "audio.webm");
  sttForm.append("model", model);
  sttForm.append("language", language);
  sttForm.append("response_format", "json");
  // Guide Whisper to output Simplified Chinese (not Traditional)
  sttForm.append("prompt", "以下是普通话的句子。");

  try {
    const headers: Record<string, string> = {};
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    const res = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers,
      body: sttForm,
      signal: AbortSignal.timeout(25_000),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      console.error("[transcribe] STT API error:", res.status, errorText);
      return NextResponse.json(
        { error: "语音识别服务异常" },
        { status: 502 }
      );
    }

    const data = (await res.json()) as { text?: string };
    return NextResponse.json({ text: data.text || "" });
  } catch (err) {
    console.error("[transcribe] fetch error:", err);
    return NextResponse.json(
      { error: "语音识别服务不可用" },
      { status: 503 }
    );
  }
}
