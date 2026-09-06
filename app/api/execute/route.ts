import { NextResponse } from "next/server";
import { launchPcApp } from "@/lib/pcApps";

export async function POST(request: Request) {
  const body = (await request.json()) as { app?: string };
  const app = body.app?.toLowerCase().trim();
  if (!app || !launchPcApp(app)) return NextResponse.json({ error: "App is not allowed" }, { status: 400 });
  return NextResponse.json({ ok: true });
}