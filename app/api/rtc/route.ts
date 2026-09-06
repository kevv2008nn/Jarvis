import { NextResponse } from "next/server";

type Room = { offer?: string; answer?: string; createdAt: number };
const runtime = globalThis as typeof globalThis & { __jarvisRtcRooms?: Map<string, Room> };
const rooms = runtime.__jarvisRtcRooms ?? new Map<string, Room>();
runtime.__jarvisRtcRooms = rooms;

function cleanRooms() {
  const expiry = Date.now() - 10 * 60 * 1000;
  for (const [code, room] of rooms) if (room.createdAt < expiry) rooms.delete(code);
}

export async function POST(request: Request) {
  cleanRooms();
  const body = (await request.json()) as { action?: string; room?: string; sdp?: string };
  if (body.action === "create") {
    const room = Math.random().toString(36).slice(2, 8).toUpperCase();
    rooms.set(room, { createdAt: Date.now() });
    return NextResponse.json({ room });
  }
  if (!body.room || !rooms.has(body.room) || !body.sdp) return NextResponse.json({ error: "Invalid room" }, { status: 400 });
  const session = rooms.get(body.room)!;
  if (body.action === "offer") session.offer = body.sdp;
  if (body.action === "answer") session.answer = body.sdp;
  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  cleanRooms();
  const room = new URL(request.url).searchParams.get("room")?.toUpperCase();
  const session = room ? rooms.get(room) : undefined;
  if (!session) return NextResponse.json({ error: "Room not found" }, { status: 404 });
  return NextResponse.json({ offer: session.offer ?? null, answer: session.answer ?? null });
}