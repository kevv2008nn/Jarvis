import { NextResponse } from "next/server";

function twiml(publicUrl: string) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="speech" action="${publicUrl}/api/phone/command" method="POST" speechTimeout="auto" language="en-US"><Say voice="alice">Jarvis online. What can I do for you?</Say></Gather><Say voice="alice">I did not hear a command. Goodbye.</Say></Response>`;
}

export async function POST(request: Request) {
  const allowedNumber = process.env.JARVIS_MOBILE_NUMBER;
  const body = await request.formData();
  const caller = String(body.get("To") ?? "");
  if (allowedNumber && caller !== allowedNumber) return new NextResponse("Forbidden", { status: 403 });
  const publicUrl = process.env.JARVIS_PUBLIC_URL ?? new URL(request.url).origin;
  return new NextResponse(twiml(publicUrl.replace(/\/$/, "")), { headers: { "Content-Type": "text/xml" } });
}