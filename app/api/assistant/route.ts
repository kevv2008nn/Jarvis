import { NextResponse } from "next/server";
import { readMemory, remember } from "@/lib/jarvisMemory";

export async function POST(request: Request) {
  const body = (await request.json()) as { text?: string };
  const text = body.text?.trim();
  if (!text) return NextResponse.json({ reply: "I am listening." });

  const model = process.env.OLLAMA_MODEL ?? "llama3.2:3b";
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

  try {
    const response = await fetch("http://127.0.0.1:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt, stream: false }),
    });
    if (!response.ok) throw new Error("Ollama unavailable");
    const result = (await response.json()) as { response?: string };
    const reply = result.response?.trim() || "I am ready. Tell me what you want to do next.";
    await remember([
      { role: "user", content: text, createdAt: new Date().toISOString() },
      { role: "assistant", content: reply, createdAt: new Date().toISOString() },
    ]);
    return NextResponse.json({ reply });
  } catch {
    return NextResponse.json({
      reply: "I can understand that request once my local AI model is online. Start Ollama and load the configured model, then ask me again.",
      setup: "ollama run llama3.2:3b",
    });
  }
}