/**
 * Translation in the browser. The on-device translator (Chrome's Translator
 * API) comes first: private and offline once its model is installed. Otherwise
 * the local Pulso Global server translates. Results are remembered, so a
 * headline is translated once.
 */
type Engine = { translate(text: string): Promise<string> };
type TranslatorApi = {
  availability(options: { sourceLanguage: string; targetLanguage: string }): Promise<string>;
  create(options: { sourceLanguage: string; targetLanguage: string }): Promise<Engine>;
};

const STORE = "pulso-tr";
const MAX_STORED = 600;
let memory: Map<string, string> | null = null;
const engines = new Map<string, Promise<Engine | null>>();

function cache(): Map<string, string> {
  if (memory) return memory;
  memory = new Map();
  try { for (const [key, value] of JSON.parse(localStorage.getItem(STORE) ?? "[]") as Array<[string, string]>) memory.set(key, value); } catch { /* private mode */ }
  return memory;
}
function persist() {
  const map = cache();
  while (map.size > MAX_STORED) map.delete(map.keys().next().value!);
  try { localStorage.setItem(STORE, JSON.stringify([...map])); } catch { /* full or private */ }
}

// Some browsers expose the API but never answer: give up quickly and use the server.
const within = <T,>(promise: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([promise, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);

function onDevice(from: string, to: string): Promise<Engine | null> {
  const key = `${from}|${to}`;
  if (!engines.has(key)) engines.set(key, (async () => {
    const api = (globalThis as { Translator?: TranslatorApi }).Translator;
    if (!api || from === "auto") return null;
    try {
      const options = { sourceLanguage: from, targetLanguage: to };
      return await within(api.availability(options), 1500) === "available" ? await within(api.create(options), 3000) : null;
    } catch { return null; }
  })());
  return engines.get(key)!;
}

/** Long texts go in pieces of up to 480 characters, cut at sentence ends. */
export function pieces(text: string, size = 480): string[] {
  if (text.length <= size) return [text];
  const out: string[] = [];
  let current = "";
  for (const sentence of text.match(/[^.!?。！？]+[.!?。！？]*\s*/gu) ?? [text]) {
    if ((current + sentence).length > size && current) { out.push(current); current = ""; }
    current += sentence;
    while (current.length > size) { out.push(current.slice(0, size)); current = current.slice(size); }
  }
  if (current) out.push(current);
  return out;
}

/** Translates each text; null where it could not be translated. */
export async function translateMany(texts: string[], from: string | undefined, to: string): Promise<Array<string | null>> {
  const source = from ?? "auto";
  if (source === to) return texts;
  const map = cache();
  const key = (text: string) => `${source}|${to}|${text}`;
  const result: Array<string | null> = texts.map((text) => map.get(key(text)) ?? null);
  const missing = texts.map((text, index) => ({ text, index })).filter((item) => result[item.index] === null && item.text.trim());
  if (!missing.length) return result;

  const engine = await onDevice(source, to);
  if (engine) {
    for (const item of missing) {
      try { result[item.index] = await within(engine.translate(item.text), 5000); } catch { /* leave null */ }
    }
  }
  const left = missing.filter((item) => !result[item.index]);
  if (left.length) {
    // Split long texts, send at most 30 pieces per request.
    const parts = left.flatMap((item) => pieces(item.text).map((text) => ({ index: item.index, text })));
    const done = new Map<number, string[]>();
    let failed = new Set<number>();
    for (let start = 0; start < parts.length; start += 30) {
      const batch = parts.slice(start, start + 30);
      try {
        const response = await fetch("/api/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from: source, to, texts: batch.map((part) => part.text) }) });
        if (!response.ok) throw new Error(String(response.status));
        const body = await response.json() as { texts?: Array<string | null> };
        batch.forEach((part, offset) => {
          const out = body.texts?.[offset];
          if (typeof out === "string") done.set(part.index, [...(done.get(part.index) ?? []), out]);
          else failed.add(part.index);
        });
      } catch {
        failed = new Set([...failed, ...batch.map((part) => part.index)]);
        break;
      }
    }
    for (const item of left) {
      if (!failed.has(item.index) && done.has(item.index)) result[item.index] = done.get(item.index)!.join(" ");
    }
  }
  let changed = false;
  for (const item of missing) {
    const out = result[item.index];
    if (out) { map.set(key(item.text), out); changed = true; }
  }
  if (changed) persist();
  return result;
}
