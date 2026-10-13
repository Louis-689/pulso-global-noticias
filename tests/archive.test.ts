import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { PulseResponse } from "../lib/pulse-types";

process.env.PULSO_ARCHIVO = mkdtempSync(join(tmpdir(), "pulso-archivo-"));

test("sin Internet se sirven las últimas noticias y textos guardados", async () => {
  const { loadPulse, loadText, savePulse, warmTexts } = await import("../lib/archive");
  const response = { articles: [{ id: "a", title: "Hola" }], mode: "news" } as unknown as PulseResponse;
  await savePulse('{"q":"a"}', "news", "es", response);
  assert.equal((await loadPulse('{"q":"a"}', "news", "es"))?.articles.length, 1);
  // Another filter with nothing saved falls back to the latest news in that language.
  assert.equal((await loadPulse('{"q":"b"}', "news", "es"))?.articles.length, 1);
  assert.equal(await loadPulse('{"q":"b"}', "news", "zh"), null);
  const calls: string[] = [];
  await warmTexts(["https://www.bbc.com/a", "https://evil.example/b"], async (url) => { calls.push(url); return { ok: true, value: { paragraphs: ["Uno", "Dos"], url, fetchedAt: "x" } }; });
  assert.deepEqual(calls, ["https://www.bbc.com/a"]);
  assert.deepEqual((await loadText("https://www.bbc.com/a"))?.paragraphs, ["Uno", "Dos"]);
});
