import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  const to = process.env.JARVIS_MOBILE_NUMBER;
  const publicUrl = process.env.JARVIS_PUBLIC_URL;

  if (!accountSid || !authToken || !from || !to || !publicUrl) {
    return NextResponse.json(
      { error: "Configure Twilio and JARVIS_PUBLIC_URL in .env.local first." },
      { status: 503 },
    );
  }

  const form = new URLSearchParams({
    To: to,
    From: from,
    Url: `${publicUrl.replace(/\/$/, "")}/api/phone/voice`,
  });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });

  if (!response.ok) return NextResponse.json({ error: "Twilio could not start the call." }, { status: 502 });
  return NextResponse.json({ ok: true });
}