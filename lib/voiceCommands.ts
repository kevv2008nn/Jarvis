export type VoiceAction =
  | { type: "music"; query: string }
  | { type: "open"; target: string }
  | { type: "app"; command: string }
  | { type: "scene"; command: "zoom-in" | "zoom-out" | "reset" };

export type VoiceCommand = {
  phrase: string;
  action: VoiceAction;
};

export const DEFAULT_FAVORITE_SONG_URL = "https://www.youtube.com/watch?v=jR3rWCBeO6M";

const BUILT_IN_COMMANDS: VoiceCommand[] = [
  { phrase: "open notepad", action: { type: "app", command: "notepad" } },
  { phrase: "open microsoft edge", action: { type: "app", command: "edge" } },
  { phrase: "open edge", action: { type: "app", command: "edge" } },
  { phrase: "open chrome", action: { type: "app", command: "chrome" } },
  { phrase: "open armoury crate", action: { type: "app", command: "armoury crate" } },
  { phrase: "open excel", action: { type: "app", command: "excel" } },
  { phrase: "open word", action: { type: "app", command: "word" } },
  { phrase: "zoom in", action: { type: "scene", command: "zoom-in" } },
  { phrase: "zoom out", action: { type: "scene", command: "zoom-out" } },
  { phrase: "reset the view", action: { type: "scene", command: "reset" } },
  { phrase: "reset view", action: { type: "scene", command: "reset" } },
];

export function normalizeSpeech(text: string) {
  return text.toLowerCase().replace(/[.!?,]/g, "").trim();
}

export function getVoiceCommands(): VoiceCommand[] {
  if (typeof window === "undefined") return BUILT_IN_COMMANDS;
  try {
    const saved = window.localStorage.getItem("jarvis-voice-commands");
    const custom = saved ? (JSON.parse(saved) as VoiceCommand[]) : [];
    const builtInPhrases = new Set(BUILT_IN_COMMANDS.map((command) => command.phrase));
    const nonConflictingCustom = custom.filter((command) => !builtInPhrases.has(command.phrase));
    return [...BUILT_IN_COMMANDS, ...nonConflictingCustom];
  } catch {
    return BUILT_IN_COMMANDS;
  }
}

export function saveVoiceCommand(command: VoiceCommand) {
  const saved = window.localStorage.getItem("jarvis-voice-commands");
  const existing = saved ? (JSON.parse(saved) as VoiceCommand[]) : [];
  const custom = existing.filter((item) => item.phrase !== command.phrase);
  if (BUILT_IN_COMMANDS.some((item) => item.phrase === command.phrase)) return;
  window.localStorage.setItem("jarvis-voice-commands", JSON.stringify([...custom, command]));
}

export function parseVoiceCommand(text: string): VoiceAction | null {
  const normalized = normalizeSpeech(text);

  const appMatch = normalized.match(
    /(?:open|launch|start) (?:the )?(microsoft edge|edge|chrome|notepad|armoury crate|excel|word)\b/,
  );
  if (appMatch?.[1]) {
    return {
      type: "app",
      command: appMatch[1],
    };
  }

  const direct = getVoiceCommands().find((command) => normalized.includes(normalizeSpeech(command.phrase)));
  if (direct) return direct.action;

  const searchMatch = normalized.match(/(?:search|look up|google) (?:for )?(.+)/);
  if (searchMatch?.[1]?.trim()) return { type: "open", target: `search:${searchMatch[1].trim()}` };

  if (normalized === "play my favorite song" || normalized === "play music") {
    return { type: "music", query: "favorite song" };
  }

  const musicMatch = normalized.match(/(?:play|search for) (?:my favorite song|music|the song)?\s*(.*)/);
  if (musicMatch?.[1]?.trim()) return { type: "music", query: musicMatch[1].trim() };

  const openMatch = normalized.match(/open (?:the )?(?:document|doc|file)?\s*(https?:\/\/\S+|.+)/);
  if (openMatch?.[1]?.trim()) return { type: "open", target: openMatch[1].trim() };

  return null;
}

export function describeVoiceAction(action: VoiceAction) {
  if (action.type === "music") return `Searching for ${action.query}`;
  if (action.type === "open") return `Opening ${action.target}`;
  if (action.type === "app") return `Opening ${action.command}`;
  return action.command === "reset" ? "View reset" : action.command === "zoom-in" ? "Zooming in" : "Zooming out";
}