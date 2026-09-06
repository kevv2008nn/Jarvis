import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type MemoryItem = { role: "user" | "assistant"; content: string; createdAt: string };

const memoryPath = path.join(process.cwd(), "data", "jarvis-memory.json");

export async function readMemory(): Promise<MemoryItem[]> {
  try {
    return JSON.parse(await readFile(memoryPath, "utf8")) as MemoryItem[];
  } catch {
    return [];
  }
}

export async function remember(items: MemoryItem[]) {
  await mkdir(path.dirname(memoryPath), { recursive: true });
  const current = await readMemory();
  await writeFile(memoryPath, JSON.stringify([...current, ...items].slice(-100), null, 2));
}