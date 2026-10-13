import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PulseResponse } from "./pulse-types";
import { isTrustedHost } from "./trusted";

/**
 * The local news library. Every successful update is written to disk, with the
 * full text of the top stories, so the computer keeps serving news when the
 * Internet is cut: to its own browser and to every phone on its Wi‑Fi.
 * Read-only hosts (serverless) simply skip it.
 */
const DIR = process.env.PULSO_ARCHIVO || join(process.cwd(), "archivo-noticias");
const MAX_TEXTS = 400;

function hash(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}
const latestName = (mode: string, lang: string) => `ultimas-${mode}-${lang}.json`;

async function write(name: string, value: unknown) {
  try {
    await mkdir(DIR, { recursive: true });
    await writeFile(join(DIR, name), JSON.stringify(value));
  } catch { /* read-only disk */ }
}
async function read<T>(name: string): Promise<T | null> {
  try { return JSON.parse(await readFile(join(DIR, name), "utf8")) as T; } catch { return null; }
}

export type Archived = PulseResponse & { archivedAt: string };

export async function savePulse(key: string, mode: string, lang: string, response: PulseResponse): Promise<void> {
  if (!response.articles.length) return;
  const value: Archived = { ...response, archivedAt: new Date().toISOString() };
  await write(`pulso-${hash(key)}.json`, value);
  await write(latestName(mode, lang), value);
}

/** The same request as last saved, or else the latest news in that mode and language. */
export async function loadPulse(key: string, mode: string, lang: string): Promise<Archived | null> {
  return await read<Archived>(`pulso-${hash(key)}.json`) ?? await read<Archived>(latestName(mode, lang));
}

export type SavedText = { title?: string; paragraphs: string[]; url: string; fetchedAt: string };
export const saveText = (url: string, value: SavedText) => write(`texto-${hash(url)}.json`, value);
export const loadText = (url: string) => read<SavedText>(`texto-${hash(url)}.json`);

let warming = false;
/** Fetches, in the background and one by one, the full text of the top trusted stories. */
export async function warmTexts(urls: string[], reader: (url: string) => Promise<{ ok: boolean; value?: SavedText }>, limit = 20): Promise<void> {
  if (warming) return;
  warming = true;
  try {
    for (const url of urls.filter((item) => { try { return isTrustedHost(new URL(item).hostname); } catch { return false; } }).slice(0, limit)) {
      if (await loadText(url)) continue;
      const result = await reader(url).catch(() => ({ ok: false }));
      if (result.ok && "value" in result && result.value) await saveText(url, result.value);
    }
    await prune();
  } finally { warming = false; }
}

async function prune() {
  try {
    const files = (await readdir(DIR)).filter((name) => name.startsWith("texto-"));
    if (files.length <= MAX_TEXTS) return;
    const dated = await Promise.all(files.map(async (name) => ({ name, time: (await stat(join(DIR, name))).mtimeMs })));
    for (const old of dated.sort((a, b) => a.time - b.time).slice(0, files.length - MAX_TEXTS)) await unlink(join(DIR, old.name));
  } catch { /* nothing to prune */ }
}
