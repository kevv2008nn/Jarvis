import { spawn } from "node:child_process";

export const ALLOWED_APPS: Record<string, string> = {
  notepad: "notepad.exe",
  edge: "msedge.exe",
  chrome: "chrome.exe",
  excel: "excel.exe",
  word: "winword.exe",
  "armoury crate": "ArmouryCrate.exe",
};

export function launchPcApp(app: string) {
  const executable = ALLOWED_APPS[app.toLowerCase().trim()];
  if (!executable) return false;
  const child = process.platform === "win32"
    ? spawn("cmd.exe", ["/c", "start", "", executable], { detached: true, stdio: "ignore" })
    : spawn(executable, [], { detached: true, stdio: "ignore" });
  child.on("error", () => undefined);
  child.unref();
  return true;
}