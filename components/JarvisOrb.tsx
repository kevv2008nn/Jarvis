"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createOrbScene, type OrbSceneApi } from "@/lib/orbScene";
import { HandTracker, type TrackerStatus } from "@/lib/handTracker";
import PhoneLink from "@/components/PhoneLink";
import {
  describeVoiceAction,
  DEFAULT_FAVORITE_SONG_URL,
  normalizeSpeech,
  parseVoiceCommand,
  saveVoiceCommand,
  type VoiceAction,
} from "@/lib/voiceCommands";

type CameraState = "off" | "starting" | "on" | "error";
type VoiceState = "off" | "listening" | "speaking" | "unsupported";

type SpeechRecognitionEventLike = Event & {
  resultIndex: number;
  results: { [index: number]: { isFinal?: boolean; [index: number]: { transcript: string } } };
};
type SpeechRecognitionErrorEventLike = Event & { error?: string };
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

const MODE_LABEL: Record<TrackerStatus["mode"], string> = {
  idle: "STANDBY",
  spin: "SPIN",
  zoom: "ZOOM",
};

export default function JarvisOrb() {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<OrbSceneApi | null>(null);
  const trackerRef = useRef<HandTracker | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const restartVoiceRef = useRef<(() => void) | null>(null);
  const lastTranscriptRef = useRef<{ text: string; time: number }>({ text: "", time: 0 });
  const lastActionRef = useRef<{ text: string; time: number }>({ text: "", time: 0 });
  const [voice, setVoice] = useState<VoiceState>("off");
  const [voiceText, setVoiceText] = useState("VOICE LINK STANDBY");
  const [assignment, setAssignment] = useState("");
  const [favoriteSongUrl, setFavoriteSongUrl] = useState("");
  const [callStatus, setCallStatus] = useState("CALL JARVIS");
  const assignmentTargetRef = useRef<string | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem("jarvis-voice-commands");
    if (!saved) return;
    try {
      const commands = JSON.parse(saved) as Array<{ phrase?: string; action?: { command?: string } }>;
      const filtered = commands.filter((command) => command.action?.command !== "calculator" && command.action?.command !== "calc");
      window.localStorage.setItem("jarvis-voice-commands", JSON.stringify(filtered));
    } catch {
      window.localStorage.removeItem("jarvis-voice-commands");
    }
  }, []);

  const [camera, setCamera] = useState<CameraState>("off");
  const [status, setStatus] = useState<TrackerStatus>({ hands: 0, mode: "idle" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const scene = createOrbScene(container);
    sceneRef.current = scene;
    return () => {
      trackerRef.current?.stop();
      trackerRef.current = null;
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    const savedUrl = window.localStorage.getItem("jarvis-favorite-song") ?? DEFAULT_FAVORITE_SONG_URL;
    setFavoriteSongUrl(savedUrl);
    window.localStorage.setItem("jarvis-favorite-song", savedUrl);
  }, []);

  const stopGestures = useCallback(() => {
    trackerRef.current?.stop();
    trackerRef.current = null;
    setCamera("off");
    setStatus({ hands: 0, mode: "idle" });
  }, []);

  const startGestures = useCallback(async () => {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    if (!video || !overlay || trackerRef.current) return;

    setCamera("starting");
    setError(null);

    const tracker = new HandTracker(video, overlay, {
      onRotate: (dt, dp) => sceneRef.current?.rotateBy(dt, dp),
      onZoom: (factor) => sceneRef.current?.zoomBy(factor),
      onStatus: setStatus,
    });
    trackerRef.current = tracker;

    try {
      await tracker.start();
      setCamera("on");
    } catch (err) {
      trackerRef.current = null;
      tracker.stop();
      setCamera("error");
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "CAMERA ACCESS DENIED"
          : "TRACKING INIT FAILED",
      );
    }
  }, []);

  const toggleGestures = useCallback(() => {
    if (trackerRef.current) stopGestures();
    else void startGestures();
  }, [startGestures, stopGestures]);

  const speak = useCallback((message: string, afterSpeech?: () => void) => {
    setVoiceText(message.toUpperCase());
    if (!("speechSynthesis" in window)) {
      afterSpeech?.();
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.rate = 0.92;
    utterance.pitch = 0.72;
    utterance.onstart = () => setVoice("speaking");
    utterance.onend = () => {
      setVoice(recognitionRef.current ? "listening" : "off");
      afterSpeech?.();
    };
    window.speechSynthesis.speak(utterance);
  }, []);

  const askAssistant = useCallback(async (text: string) => {
    setVoiceText("JARVIS IS THINKING");
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const result = await response.json() as { reply?: string };
      speak(result.reply ?? "I am ready. Tell me what you want to do next.", () => restartVoiceRef.current?.());
    } catch {
      speak("I am ready, but Gemini is unavailable. Check the server API key and ask again.", () => restartVoiceRef.current?.());
    }
  }, [speak]);

  const runVoiceAction = useCallback((action: VoiceAction) => {
    if (action.type === "scene") {
      if (action.command === "zoom-in") sceneRef.current?.zoomIn();
      if (action.command === "zoom-out") sceneRef.current?.zoomOut();
      if (action.command === "reset") sceneRef.current?.resetView();
    }
    if (action.type === "music") {
      const favoriteUrl = window.localStorage.getItem("jarvis-favorite-song");
      const target = action.query === "favorite song" && favoriteUrl
        ? favoriteUrl
        : `https://music.youtube.com/search?q=${encodeURIComponent(action.query)}`;
      window.open(target, "_blank", "noopener,noreferrer");
    }
    if (action.type === "open") {
      const target = action.target.startsWith("search:")
        ? `https://www.google.com/search?q=${encodeURIComponent(action.target.slice(7))}`
        : /^https?:\/\//i.test(action.target)
          ? action.target
          : `https://www.google.com/search?q=${encodeURIComponent(action.target)}`;
      window.open(target, "_blank", "noopener,noreferrer");
    }
    if (action.type === "app") {
      void fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app: action.command }),
      }).then(async (response) => {
        if (!response.ok) throw new Error("launch failed");
      }).catch(() => speak(`I cannot open ${action.command} on this PC yet.`));
    }
    speak(describeVoiceAction(action), () => restartVoiceRef.current?.());
  }, [speak]);

  const startVoice = useCallback(() => {
    const browserWindow = window as Window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
    const SpeechRecognition = browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoice("unsupported");
      speak("Voice control is not supported in this browser.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      const result = event.results[event.resultIndex];
      if (result?.isFinal === false) return;
      const transcript = result?.[0]?.transcript?.trim();
      if (!transcript) return;
      recognitionRef.current = null;
      recognition.stop();
      const now = Date.now();
      if (lastTranscriptRef.current.text === transcript && now - lastTranscriptRef.current.time < 2500) {
        window.setTimeout(() => restartVoiceRef.current?.(), 300);
        return;
      }
      lastTranscriptRef.current = { text: transcript, time: now };
      setVoiceText(transcript.toUpperCase());
      if (assignmentTargetRef.current) {
        const location = normalizeSpeech(transcript);
        const target = assignmentTargetRef.current;
        assignmentTargetRef.current = null;
        if (location.includes("my pc") || location.includes("computer")) {
          saveVoiceCommand({ phrase: normalizeSpeech(assignment), action: { type: "app", command: target } });
          setAssignment("");
          speak(`Assigned. I will open ${target} on your PC.`);
        } else {
          speak("Please say my PC to save this as a computer command.");
        }
        return;
      }
      const action = parseVoiceCommand(transcript);
      const normalized = normalizeSpeech(transcript);
      if (action) {
        if (lastActionRef.current.text !== normalized || now - lastActionRef.current.time >= 2500) {
          lastActionRef.current = { text: normalized, time: now };
          runVoiceAction(action);
        } else {
          window.setTimeout(() => restartVoiceRef.current?.(), 300);
        }
      } else {
        void askAssistant(transcript);
      }
    };
    recognition.onerror = (event) => {
      recognitionRef.current = null;
      setVoice("off");
      const isNetworkError = event.error === "network";
      const message = event.error === "not-allowed" || event.error === "service-not-allowed"
        ? "Microphone access is blocked. Allow microphone access and try again."
        : isNetworkError
          ? "PC speech service unavailable. Use the phone link or Chrome online."
        : event.error === "no-speech"
          ? "I heard nothing. Press talk and speak a command."
          : event.error === "audio-capture"
            ? "No microphone was found. Check your microphone and try again."
            : `Voice link error: ${event.error ?? "unknown"}.`;
      setVoiceText(message.toUpperCase());
      if (isNetworkError) {
        setVoiceText("PC VOICE UNAVAILABLE - USE PHONE LINK");
        return;
      }
      speak(message);
    };
    recognition.onend = () => {
      if (recognitionRef.current === recognition) {
        try {
          recognition.start();
        } catch {
          setVoice("off");
        }
      }
    };
    recognitionRef.current = recognition;
    restartVoiceRef.current = startVoice;
    setVoice("listening");
    setVoiceText("LISTENING FOR COMMAND");
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setVoice("off");
      speak("Voice link could not start. Try again.");
    }
  }, [askAssistant, runVoiceAction, speak]);

  const stopVoice = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    window.speechSynthesis?.cancel();
    setVoice("off");
    setVoiceText("VOICE LINK STANDBY");
  }, []);

  useEffect(() => {
    startVoice();
    return stopVoice;
  }, [startVoice, stopVoice]);

  const toggleVoice = useCallback(() => {
    if (voice === "listening" || voice === "speaking") stopVoice();
    else startVoice();
  }, [startVoice, stopVoice, voice]);

  const assignVoiceCommand = useCallback(() => {
    const phrase = normalizeSpeech(assignment);
    if (!phrase) return;
    const target = phrase.replace(/^open\s+(the\s+)?/, "").trim();
    assignmentTargetRef.current = target;
    stopVoice();
    speak("Where should I open it? Say my PC.", startVoice);
  }, [assignment, speak, startVoice, stopVoice]);

  const saveFavoriteSong = useCallback(() => {
    const url = favoriteSongUrl.trim();
    if (!url) return;
    window.localStorage.setItem("jarvis-favorite-song", url);
    setFavoriteSongUrl(url);
    speak("Favorite track saved. Say play my favorite song.");
  }, [favoriteSongUrl, speak]);

  const callJarvis = useCallback(async () => {
    setCallStatus("CALLING…");
    try {
      const response = await fetch("/api/call", { method: "POST" });
      if (!response.ok) throw new Error("call failed");
      setCallStatus("CALL STARTED");
    } catch {
      setCallStatus("CONFIGURE PHONE");
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case "+":
        case "=":
          sceneRef.current?.zoomIn();
          break;
        case "-":
        case "_":
          sceneRef.current?.zoomOut();
          break;
        case "r":
        case "R":
          sceneRef.current?.resetView();
          break;
        case "g":
        case "G":
          toggleGestures();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleGestures]);

  const cameraOn = camera === "on";

  return (
    <>
      <div ref={containerRef} className="orb-root" />

      <div className="overlay-vignette" />
      <div className="overlay-grain" />
      <div className="overlay-scanlines" />

      <div className="hud hud-title">J.A.R.V.I.S.</div>

      <div className="hud hud-voice" aria-live="polite">
        <div className={`voice-core voice-${voice}`} />
        <div className="voice-label">{voiceText}</div>
        <button type="button" className="hud-btn voice-btn" onClick={toggleVoice} aria-pressed={voice === "listening"}>
          {voice === "off" || voice === "unsupported" ? "TURN ON VOICE COMMANDS" : "TURN OFF VOICE COMMANDS"}
        </button>
        <div className="assign-row">
          <input value={assignment} onChange={(event) => setAssignment(event.target.value)} placeholder="assign a phrase" aria-label="Custom command phrase" />
          <button type="button" className="hud-btn assign-btn" onClick={assignVoiceCommand} aria-label="Assign custom command">+</button>
        </div>
        <div className="assign-row">
          <input value={favoriteSongUrl} onChange={(event) => setFavoriteSongUrl(event.target.value)} placeholder="favorite song URL" aria-label="Favorite song URL" />
          <button type="button" className="hud-btn assign-btn" onClick={saveFavoriteSong} aria-label="Save favorite song">♪</button>
        </div>
        <button type="button" className="hud-btn call-btn" onClick={callJarvis}>{callStatus}</button>
        <PhoneLink onAction={runVoiceAction} />
      </div>

      <div className="hud hud-controls">
        <div className={`camera-panel${cameraOn ? " visible" : ""}`}>
          {/* Mirrored preview so it behaves like a mirror */}
          <video ref={videoRef} muted playsInline className="camera-video" />
          <canvas ref={overlayRef} width={208} height={156} className="camera-overlay" />
          <div className="camera-status">
            {status.hands > 0
              ? `${status.hands} HAND${status.hands > 1 ? "S" : ""} · ${MODE_LABEL[status.mode]}`
              : "SHOW HANDS"}
          </div>
        </div>

        {error && <div className="hud-error">{error}</div>}

        <div className="hud-row">
          <button
            type="button"
            className="hud-btn"
            aria-pressed={cameraOn}
            onClick={toggleGestures}
            disabled={camera === "starting"}
          >
            {camera === "starting" ? "INITIALIZING…" : cameraOn ? "GESTURES ON" : "GESTURES OFF"}
          </button>
        </div>
        <div className="hud-row">
          <button type="button" className="hud-btn" onClick={() => sceneRef.current?.zoomIn()} aria-label="Zoom in">
            +
          </button>
          <button type="button" className="hud-btn" onClick={() => sceneRef.current?.zoomOut()} aria-label="Zoom out">
            −
          </button>
          <button type="button" className="hud-btn" onClick={() => sceneRef.current?.resetView()}>
            RESET
          </button>
        </div>
      </div>
    </>
  );
}
