#!/usr/bin/env node
/**
 * Pulso Global como programa: instala lo necesario la primera vez, prepara la
 * aplicación cuando el código cambia, la inicia y abre el navegador.
 * Uso: doble clic en iniciar.bat (Windows) / iniciar.command (Mac) / iniciar.sh (Linux),
 * o `npm run iniciar` desde una terminal.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const windows = process.platform === "win32";
const npm = windows ? "npm.cmd" : "npm";
const say = (text) => console.log(`\x1b[1;35m●\x1b[0m ${text}`);

const [major] = process.versions.node.split(".").map(Number);
if (major < 20) {
  say(`Necesitas Node.js 20 o superior (tienes ${process.versions.node}). Descárgalo en https://nodejs.org`);
  process.exit(1);
}

function run(args) {
  const result = spawnSync(npm, args, { cwd: root, stdio: "inherit", shell: windows });
  if (result.status !== 0) { say("Algo salió mal. Revisa los mensajes de arriba."); process.exit(result.status ?? 1); }
}

function newest(path) {
  if (!existsSync(path)) return 0;
  const info = statSync(path);
  if (!info.isDirectory()) return info.mtimeMs;
  return Math.max(info.mtimeMs, ...readdirSync(path).map((name) => newest(join(path, name))));
}

// Install the first time, and again when an update brings new dependencies.
const lock = join(root, "package-lock.json");
const installed = join(root, "node_modules", ".package-lock.json");
if (!existsSync(join(root, "node_modules")) || (existsSync(lock) && (!existsSync(installed) || statSync(installed).mtimeMs < statSync(lock).mtimeMs))) {
  say("Instalando lo necesario (tarda un par de minutos)…");
  // `npm ci` would delete node_modules first, which Windows refuses while another copy is running.
  run(existsSync(join(root, "node_modules")) || !existsSync(lock) ? ["install", "--no-audit", "--no-fund"] : ["ci", "--no-audit", "--no-fund"]);
}

const buildId = join(root, ".next", "BUILD_ID");
const sources = Math.max(...["app", "components", "lib", "public", "package.json", "next.config.ts"].map((item) => newest(join(root, item))));
if (!existsSync(buildId) || statSync(buildId).mtimeMs < sources) {
  say("Preparando la aplicación…");
  run(["run", "build"]);
}

const free = (port) => new Promise((resolve) => {
  const server = createServer().once("error", () => resolve(false)).once("listening", () => server.close(() => resolve(true)));
  server.listen(port, "127.0.0.1");
});
let port = Number(process.env.PORT) || 3000;
while (!(await free(port))) port++;
const url = `http://localhost:${port}`;

say(`Iniciando Pulso Global en ${url} (cierra esta ventana para apagarlo)`);
const server = spawn(npm, ["start", "--", "-p", String(port)], { cwd: root, stdio: "inherit", shell: windows });
server.on("exit", (code) => process.exit(code ?? 0));

// Open the browser once the server answers.
for (let i = 0; i < 60; i++) {
  try { await fetch(url); break; } catch { await new Promise((resolve) => setTimeout(resolve, 500)); }
}
const opener = windows ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
spawn(opener[0], opener[1], { stdio: "ignore", detached: true }).on("error", () => say(`Abre ${url} en tu navegador.`)).unref();
