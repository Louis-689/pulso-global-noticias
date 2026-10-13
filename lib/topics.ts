import type { PulseCategory } from "./pulse-types";

/** Each topic gets an icon and a vivid color so the feed reads at a glance. */
export const TOPICS: Record<PulseCategory, { icon: string; color: string }> = {
  all: { icon: "🌍", color: "#2f6bff" },
  politics: { icon: "🏛️", color: "#8b5cf6" },
  economy: { icon: "💰", color: "#f59e0b" },
  security: { icon: "🕊️", color: "#ef4444" },
  technology: { icon: "🤖", color: "#06b6d4" },
  science: { icon: "🔬", color: "#6366f1" },
  health: { icon: "🩺", color: "#10b981" },
  climate: { icon: "🌱", color: "#22c55e" },
  culture: { icon: "🎭", color: "#ec4899" },
  sports: { icon: "⚽", color: "#f97316" },
  education: { icon: "📚", color: "#0ea5e9" },
  factcheck: { icon: "🕵️", color: "#e11d48" },
};

export function topicOf(value: string | undefined) {
  return value && value in TOPICS ? TOPICS[value as PulseCategory] : TOPICS.all;
}
