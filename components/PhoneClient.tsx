"use client";

import { useEffect, useRef, useState } from "react";

type Recognition = {
  lang: string;
  start: () => void;
  onerror: ((event: { error?: string }) => void) | null;
  onresult: ((event: { results: { [index: number]: { [index: number]: { transcript: string } } } }) => void) | null;
  onend: (() => void) | null;
};

export default function PhoneClient() {
  const channelRef = useRef<RTCDataChannel | null>(null);
  const [status, setStatus] = useState("CONNECTING");
  const [heard, setHeard] = useState("Say a command");
  const [listening, setListening] = useState(false);

  useEffect(() => {
    const room = new URLSearchParams(window.location.search).get("room");
    if (!room) { setStatus("MISSING ROOM CODE"); return; }
    const peer = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "failed") setStatus("CONNECTION FAILED - TRY SAME WIFI");
      if (peer.connectionState === "disconnected") setStatus("CONNECTION INTERRUPTED");
    };
    peer.oniceconnectionstatechange = () => {
      if (peer.iceConnectionState === "checking") setStatus("CONNECTING TO PC");
      if (peer.iceConnectionState === "failed") setStatus("ICE FAILED - TRY SAME WIFI");
    };
    peer.ondatachannel = (event) => {
      channelRef.current = event.channel;
      event.channel.onopen = () => setStatus("CONNECTED TO JARVIS");
      event.channel.onerror = () => setStatus("LINK ERROR - REOPEN PC LINK");
      event.channel.onclose = () => setStatus("LINK CLOSED");
      event.channel.onmessage = (message) => {
        const payload = JSON.parse(message.data) as { type?: string; text?: string };
        if (payload.text) { setHeard(payload.text); window.speechSynthesis?.speak(new SpeechSynthesisUtterance(payload.text)); }
      };
    };
    let timer = 0;
    const poll = async () => {
      const response = await fetch(`/api/rtc?room=${room}`);
      if (!response.ok) { setStatus("ROOM EXPIRED - CREATE A NEW LINK"); window.clearInterval(timer); return; }
      const result = await response.json() as { offer?: string | null };
      if (!result.offer || peer.remoteDescription) return;
      setStatus("OFFER FOUND - CONNECTING");
      await peer.setRemoteDescription({ type: "offer", sdp: result.offer });
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await new Promise<void>((resolve) => {
        if (peer.iceGatheringState === "complete") resolve();
        else peer.addEventListener("icegatheringstatechange", () => peer.iceGatheringState === "complete" && resolve(), { once: true });
      });
      await fetch("/api/rtc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "answer", room, sdp: peer.localDescription?.sdp }) });
      setStatus("ANSWER SENT - WAITING FOR PC");
      window.clearInterval(timer);
    };
    timer = window.setInterval(() => void poll().catch(() => setStatus("CANNOT REACH JARVIS")), 1000);
    void poll().catch(() => setStatus("CANNOT REACH JARVIS"));
    return () => { window.clearInterval(timer); peer.close(); };
  }, []);

  const listen = () => {
    const Constructor = (window as Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition
      ?? (window as Window & { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;
    if (!Constructor) { setStatus("USE CHROME OR EDGE"); return; }
    const recognition = new Constructor();
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      const text = event.results[0][0].transcript;
      setHeard(text.toUpperCase());
      channelRef.current?.send(JSON.stringify({ type: "command", text }));
      setListening(false);
    };
    recognition.onerror = (event) => {
      setListening(false);
      setStatus(event.error === "not-allowed" ? "ALLOW MICROPHONE IN BROWSER" : `VOICE ERROR: ${event.error ?? "UNKNOWN"}`);
    };
    recognition.onend = () => setListening(false);
    setListening(true);
    recognition.start();
  };

  return <main className="phone-page"><div className="phone-card"><div className="phone-orb">◉</div><h1>JARVIS LINK</h1><div className="phone-status">{status}</div><div className="phone-heard">{heard}</div><button type="button" className="phone-talk" onClick={listen} disabled={listening || status !== "CONNECTED TO JARVIS"}>{listening ? "LISTENING…" : "TALK TO JARVIS"}</button></div></main>;
}