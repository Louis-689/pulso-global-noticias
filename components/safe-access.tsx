"use client";

import { useEffect, useState } from "react";
import type { DictKey } from "@/lib/i18n";
import { QrCode } from "./qr-code";

/** Tools for reaching Pulso Global (and the open web) from countries that block it, and ways news travels with no Internet. */
export function SafeAccess({ t, onDownload, canDownload, preparing }: { t: (key: DictKey) => string; onDownload: () => void; canDownload: boolean; preparing?: boolean }) {
  const tools = [
    { icon: "🧅", name: "Tor Browser", text: t("safe.torText"), href: "https://www.torproject.org/download/" },
    { icon: "🛰️", name: "Psiphon", text: t("safe.psiphonText"), href: "https://psiphon.ca/" },
    { icon: "❄️", name: "Snowflake", text: t("safe.snowflakeText"), href: "https://snowflake.torproject.org/" },
  ];
  const offline = [
    { icon: "📡", name: t("nonet.sat"), app: "Toosheh", text: t("nonet.satText"), href: "https://www.toosheh.org/" },
    { icon: "📲", name: t("nonet.mesh"), app: "Briar", text: t("nonet.meshText"), href: "https://briarproject.org/" },
    { icon: "📚", name: t("nonet.wiki"), app: "Kiwix", text: t("nonet.wikiText"), href: "https://www.kiwix.org/" },
    { icon: "📻", name: t("nonet.radio"), text: t("nonet.radioText") },
  ];
  const [lan, setLan] = useState<string[] | null>(null);
  useEffect(() => {
    fetch("/api/local").then((response) => response.json() as Promise<{ urls?: string[] }>).then((body) => setLan(body.urls ?? [])).catch(() => setLan([]));
  }, []);
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
      <div className="safe-card safe-tips">
        <span className="safe-icon" aria-hidden="true">🤫</span>
        <strong>{t("safe.tips")}</strong>
        <p>{t("safe.tipsText")}</p>
      </div>
    </div>

    <div className="safe-head nonet-head">
      <h2>📦 {t("nonet.title")}</h2>
      <p>{t("nonet.intro")}</p>
    </div>
    <div className="safe-lan">
      <div>
        <strong>📶 {t("nonet.lan")}</strong>
        <p>{t("nonet.lanText")}</p>
        {lan?.length ? <p className="safe-lan-url">{lan.join(" · ")}</p> : lan && <p>{t("nonet.lanNone")}</p>}
      </div>
      {lan?.[0] && <QrCode text={lan[0]} label={lan[0]} />}
    </div>
    <div className="safe-grid">
      <div className="safe-card safe-offline">
        <span className="safe-icon" aria-hidden="true">💾</span>
        <strong>{t("nonet.hand")}</strong>
        <p>{t("nonet.handText")} {t("safe.offlineText")}</p>
        <button className="btn btn-primary" onClick={onDownload} disabled={!canDownload || preparing}>⬇ {preparing ? t("offline.preparing") : t("safe.download")}</button>
      </div>
      {offline.map((item) => item.href
        ? <a key={item.name} className="safe-card" href={item.href} target="_blank" rel="noopener noreferrer">
          <span className="safe-icon" aria-hidden="true">{item.icon}</span>
          <strong>{item.name} · {item.app} ↗</strong>
          <p>{item.text}</p>
        </a>
        : <div key={item.name} className="safe-card">
          <span className="safe-icon" aria-hidden="true">{item.icon}</span>
          <strong>{item.name}</strong>
          <p>{item.text}</p>
        </div>)}
    </div>
  </section>;
}
