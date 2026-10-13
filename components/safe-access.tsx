"use client";

import type { DictKey } from "@/lib/i18n";

/** Tools for reaching Pulso Global (and the open web) from countries that block it. */
export function SafeAccess({ t, onDownload, canDownload }: { t: (key: DictKey) => string; onDownload: () => void; canDownload: boolean }) {
  const tools = [
    { icon: "🧅", name: "Tor Browser", text: t("safe.torText"), href: "https://www.torproject.org/download/" },
    { icon: "🛰️", name: "Psiphon", text: t("safe.psiphonText"), href: "https://psiphon.ca/" },
    { icon: "❄️", name: "Snowflake", text: t("safe.snowflakeText"), href: "https://snowflake.torproject.org/" },
  ];
  return <section className="safe" aria-label={t("safe.title")}>
    <div className="safe-head">
      <h2>🛡️ {t("safe.title")}</h2>
      <p>{t("safe.intro")}</p>
    </div>
    <div className="safe-grid">
      {tools.map((tool) => <a key={tool.name} className="safe-card" href={tool.href} target="_blank" rel="noopener noreferrer">
        <span className="safe-icon" aria-hidden="true">{tool.icon}</span>
        <strong>{tool.name} ↗</strong>
        <p>{tool.text}</p>
      </a>)}
      <div className="safe-card safe-offline">
        <span className="safe-icon" aria-hidden="true">💾</span>
        <strong>{t("safe.offline")}</strong>
        <p>{t("safe.offlineText")}</p>
        <button className="btn btn-primary" onClick={onDownload} disabled={!canDownload}>⬇ {t("safe.download")}</button>
      </div>
      <div className="safe-card safe-tips">
        <span className="safe-icon" aria-hidden="true">🤫</span>
        <strong>{t("safe.tips")}</strong>
        <p>{t("safe.tipsText")}</p>
      </div>
    </div>
  </section>;
}
