# ULTRON Orb UI

An Iron Man–inspired holographic orb built with **Next.js**, **Three.js**, and **MediaPipe** hand tracking — control it with your bare hands through your webcam.

> 🔮 This is the open-source **interface** of [ULTRON](https://sagartamang.com/projects/ultron) — my AI that talks in real time and controls Android devices by itself. **[Read the write-up](https://sagartamang.com/projects/ultron)** or **[the X post](https://x.com/sagar_builds/status/2077277583646101921)**

> 📱 **[Watch the demo on Instagram](https://www.instagram.com/p/DayJ17OTwvx/)**

![ULTRON orb UI](docs/screenshot.png)

https://github.com/user-attachments/assets/91578a83-9a27-44e8-84b0-96defcfd7366

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Phone calls

Jarvis can call your mobile through Twilio. Copy `.env.example` to `.env.local`,
fill in the Twilio account values and your phone number, then expose the app
through an HTTPS tunnel such as `ngrok http 3000`. Set `JARVIS_PUBLIC_URL` to
that public URL. Click **CALL JARVIS** and say commands such as `open notepad`.

The phone call can launch the allowlisted Windows apps. The browser voice mode
continues normally after the call ends. Never commit `.env.local`.

## Free phone voice link

For a no-payment option, use the WebRTC phone link instead of Twilio:

1. Start Jarvis with `npm run dev`.
2. Open the PC page and click **CONNECT PHONE**.
3. Open the displayed `/phone?room=XXXXXX` link on your mobile.
4. Tap **TALK TO JARVIS**, allow microphone access, and speak commands.

The phone sends recognized command text directly to the PC through WebRTC.
The PC can launch the allowlisted apps and send an acknowledgement back to the
phone. The room expires after ten minutes and the browser voice mode remains
independent after disconnecting.

Phone microphone permissions require a secure context. `localhost` works on the
PC, but a phone using a network address normally needs an HTTPS tunnel such as
`ngrok http 3000` or Cloudflare Tunnel. This is a browser connection, not a
cellular phone call, and no carrier payment is required.

## Local AI assistant

Jarvis uses Gemini for natural-language requests that are not direct commands.
Create a Gemini API key in Google AI Studio and add it to `.env.local`:

```env
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.0-flash
```

Keep the key only on the server. Conversations are saved locally in
`data/jarvis-memory.json` and the last 12 messages are used as context later.
This is persistent memory, not automatic model retraining. Gemini does not
execute arbitrary computer actions; only the explicit allowlisted commands can
launch PC applications.

On serverless hosting, local file memory is best-effort and may reset between
deployments. Use a hosted database later if shared persistent memory is needed.

## Controls

### Mouse / touch

| Input | Action |
| --- | --- |
| Drag | Spin the orb |
| Scroll / pinch | Zoom in & out |

### Hand gestures (webcam)

Click **GESTURES OFF** (or press `G`) and allow camera access, then:

| Gesture | Action |
| --- | --- |
| Pinch (thumb + index) one hand and move it | Spin the orb |
| Pinch with **both** hands, spread apart / bring together | Zoom in / out |

### Keyboard

| Key | Action |
| --- | --- |
| `G` | Toggle hand gestures |
| `R` | Reset the view |
| `+` / `−` | Zoom in / out |

## How it works

- **`lib/orbScene.ts`** — the Three.js scene: layered wireframe shells, a spiral
  inner core, floating code-text sprites, orbiting debris, dust particles, scan
  rings, and a bloom + chromatic-aberration post-processing stack.
- **`lib/handTracker.ts`** — MediaPipe HandLandmarker running on the webcam
  feed. Pinch detection with hysteresis: one pinched hand spins the orb, two
  pinched hands zoom by spreading apart or together.
- **`components/JarvisOrb.tsx`** — the HUD and glue between the scene, the
  tracker, and your inputs.

## License

SIET
