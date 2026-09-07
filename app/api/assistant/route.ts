import { NextResponse } from "next/server";
import { readMemory, remember } from "@/lib/jarvisMemory";

export async function POST(request: Request) {
  const body = (await request.json()) as { text?: string };
  const text = body.text?.trim();
  if (!text) return NextResponse.json({ reply: "I am listening." });

  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
  const memory = await readMemory();
  const context = memory.slice(-12).map((item) => `${item.role}: ${item.content}`).join("\n");
  const prompt = [
    "You are Jarvis, a concise, calm, helpful desktop assistant.",
    "Answer naturally like Siri or GPT. Never say you do not know. If information is missing, say what you need or offer the safest next step.",
    "Do not claim to have opened, changed, or completed something unless the app explicitly confirms it.",
    context ? `Recent memory:\n${context}` : "No previous memory is available.",
    `User request: ${text}`,
    "Reply in one or two short spoken sentences.",
  ].join("\n\n");

  if (!apiKey) {
    return NextResponse.json({
      reply: "My Gemini connection is not configured yet. Add GEMINI_API_KEY to the server environment, then try again.",
    }, { status: 503 });
  }

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 180 },
      }),
    });
    if (!response.ok) throw new Error(`Gemini request failed: ${response.status}`);
    const result = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const reply = result.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim()
      || "I am ready. Tell me what you want to do next.";
    await remember([
      { role: "user", content: text, createdAt: new Date().toISOString() },
      { role: "assistant", content: reply, createdAt: new Date().toISOString() },
    ]);
    return NextResponse.json({ reply });
  } catch {
    return NextResponse.json({
      reply: "I could not reach Gemini right now. Check the API key and server connection, then try again.",
    }, { status: 502 });
  }
}