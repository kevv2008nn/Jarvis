import { NextResponse } from "next/server";
import { launchPcApp } from "@/lib/pcApps";
import { describeVoiceAction, parseVoiceCommand } from "@/lib/voiceCommands";

function response(message: string, publicUrl: string) {
  return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="speech" action="${publicUrl}/api/phone/command" method="POST" speechTimeout="auto" language="en-US"><Say voice="alice">${message}</Say></Gather></Response>`, { headers: { "Content-Type": "text/xml" } });
}

export async function POST(request: Request) {
  const body = await request.formData();
  const publicUrl = (process.env.JARVIS_PUBLIC_URL ?? new URL(request.url).origin).replace(/\/$/, "");
  const action = parseVoiceCommand(String(body.get("SpeechResult") ?? ""));
  if (!action) return response("I did not understand that command. Please try again.", publicUrl);
  if (action.type === "app") {
    if (!launchPcApp(action.command)) return response(`I cannot open ${action.command} on this PC.`, publicUrl);
    return response(`${describeVoiceAction(action)}. What else can I do?`, publicUrl);
  }
  if (action.type === "music") return response(`I can open your music from the Jarvis screen. What else can I do?`, publicUrl);
  if (action.type === "scene") return response(`${describeVoiceAction(action)}. What else can I do?`, publicUrl);
  return response(`I can handle that from the Jarvis screen. What else can I do?`, publicUrl);
}