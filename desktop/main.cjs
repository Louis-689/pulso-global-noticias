/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, shell, session } = require("electron");
const path = require("node:path");

const APP_URL = process.env.PULSO_GLOBAL_URL || "https://pulso-global-noticias.topos22.chatgpt.site/";
const APP_ORIGIN = new URL(APP_URL).origin;

function isPublicWebUrl(value) {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password;
  } catch {
    return false;
  }
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440, height: 920, minWidth: 900, minHeight: 640,
    backgroundColor: "#e9e4d2", show: false,
    icon: path.join(__dirname, "assets", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"), contextIsolation: true,
      nodeIntegration: false, sandbox: true, webSecurity: true, spellcheck: false,
    },
  });
  window.removeMenu();
  window.once("ready-to-show", () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isPublicWebUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin === APP_ORIGIN) return;
    event.preventDefault();
    if (isPublicWebUrl(url)) void shell.openExternal(url);
  });
  void window.loadURL(APP_URL);
}

app.setAppUserModelId("com.pulsoglobal.desktop");
app.whenReady().then(() => {
  const permissionAllowed = (webContents, permission) => {
    if (permission !== "notifications") return false;
    try { return new URL(webContents.getURL()).origin === APP_ORIGIN; }
    catch { return false; }
  };
  // Only first-party notifications are allowed. Camera, microphone,
  // geolocation, MIDI and every other web permission stay denied.
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => callback(permissionAllowed(webContents, permission)));
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => permissionAllowed(webContents, permission));
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
