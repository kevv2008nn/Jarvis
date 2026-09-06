"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { describeVoiceAction, parseVoiceCommand, type VoiceAction } from "@/lib/voiceCommands";

type LinkState = "off" | "creating" | "waiting" | "connected" | "error";

async function waitForIce(peer: RTCPeerConnection) {
  if (peer.iceGatheringState === "complete") return;
  await new Promise<void>((resolve) => {
    const done = () => {
      if (peer.iceGatheringState === "complete") {
        peer.removeEventListener("icegatheringstatechange", done);
        resolve();
      }
    };
    peer.addEventListener("icegatheringstatechange", done);
  });
}

export default function PhoneLink({ onAction }: { onAction: (action: VoiceAction) => void }) {
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const pollRef = useRef<number | null>(null);
  const [state, setState] = useState<LinkState>("off");
  const [room, setRoom] = useState("");
  const [link, setLink] = useState("");
  const [error, setError] = useState("");

  const stop = useCallback(() => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    peerRef.current?.close();
    peerRef.current = null;
    channelRef.current = null;
    setState("off");
    setError("");
  }, []);

  const createLink = useCallback(async () => {
    stop();
    setState("creating");
    setError("");
    try {
      const createResponse = await fetch("/api/rtc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create" }) });
      if (!createResponse.ok) throw new Error("Signaling server unavailable");
      const created = await createResponse.json() as { room?: string };
      if (!created.room) throw new Error("No room was created");
      const code = created.room;
      const peer = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      peerRef.current = peer;
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "failed") {
          setState("error");
          setError("WebRTC could not connect. Keep both devices on the same Wi-Fi and create a new link.");
        }
      };
      peer.oniceconnectionstatechange = () => {
        if (peer.iceConnectionState === "failed") {
          setState("error");
          setError("ICE connection failed. Try the phone and PC on the same Wi-Fi.");
        }
      };
      const channel = peer.createDataChannel("jarvis");
      channelRef.current = channel;
      channel.onopen = () => setState("connected");
      channel.onclose = () => setState("off");
      channel.onmessage = (event) => {
        const payload = JSON.parse(event.data) as { type?: string; text?: string };
        if (payload.type !== "command" || !payload.text) return;
        const action = parseVoiceCommand(payload.text);
        if (action) {
          onAction(action);
          channel.send(JSON.stringify({ type: "response", text: describeVoiceAction(action) }));
          return;
        }
        void fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: payload.text }),
        }).then((response) => response.json() as Promise<{ reply?: string }>).then((result) => {
          channel.send(JSON.stringify({ type: "response", text: result.reply ?? "I am ready for your next command." }));
        });
      };
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await waitForIce(peer);
      const offerResponse = await fetch("/api/rtc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "offer", room: code, sdp: peer.localDescription?.sdp }) });
      if (!offerResponse.ok) throw new Error("Offer could not be published");
      setRoom(code);
      setLink(`${window.location.origin}/phone?room=${code}`);
      setState("waiting");
      pollRef.current = window.setInterval(async () => {
        const result = await fetch(`/api/rtc?room=${code}`).then((r) => r.json()) as { answer?: string | null };
        if (result.answer && !peer.remoteDescription) {
          await peer.setRemoteDescription({ type: "answer", sdp: result.answer });
          if (pollRef.current) window.clearInterval(pollRef.current);
        }
      }, 1000);
    } catch (cause) {
      setState("error");
      setError(cause instanceof Error ? cause.message : "Could not create phone link");
    }
  }, [onAction, stop]);

  useEffect(() => () => stop(), [stop]);

  return (
    <div className="phone-link">
      <button type="button" className="hud-btn call-btn" onClick={state === "off" || state === "error" ? createLink : stop}>
        {state === "off" || state === "error" ? "CONNECT PHONE" : state === "creating" ? "CREATING LINK…" : "DISCONNECT PHONE"}
      </button>
      {state === "waiting" && <div className="phone-link-code">WAITING FOR PHONE</div>}
      {state === "connected" && <div className="phone-link-code">PHONE CONNECTED</div>}
      {room && <div className="phone-link-code">ROOM {room}<input readOnly value={link} onFocus={(event) => event.currentTarget.select()} aria-label="Phone connection link" /></div>}
      {error && <div className="hud-error">{error}</div>}
    </div>
  );
}