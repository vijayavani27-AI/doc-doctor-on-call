import type { Level, Status } from "./types";

export function fmtDate(d: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  if (!d) return "-";
  const dt = new Date(d.length === 10 ? d + "T00:00:00" : d);
  return dt.toLocaleDateString("en-IN", opts);
}

export function fmtNum(v: number | null | undefined, digits = 2) {
  if (v === null || v === undefined) return "-";
  return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(digits)));
}

export const statusStyles: Record<Status | Level, { chip: string; dot: string; ring: string; text: string; soft: string; hex: string }> = {
  red: { chip: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300", dot: "bg-red-500", ring: "ring-red-200 dark:ring-red-500/30", text: "text-red-600 dark:text-red-400", soft: "bg-red-50 dark:bg-red-500/10", hex: "#ef4444" },
  yellow: { chip: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300", dot: "bg-amber-500", ring: "ring-amber-200 dark:ring-amber-500/30", text: "text-amber-600 dark:text-amber-400", soft: "bg-amber-50 dark:bg-amber-500/10", hex: "#f59e0b" },
  green: { chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300", dot: "bg-emerald-500", ring: "ring-emerald-200 dark:ring-emerald-500/30", text: "text-emerald-600 dark:text-emerald-400", soft: "bg-emerald-50 dark:bg-emerald-500/10", hex: "#10b981" },
  info: { chip: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300", dot: "bg-sky-500", ring: "ring-sky-200 dark:ring-sky-500/30", text: "text-sky-600 dark:text-sky-400", soft: "bg-sky-50 dark:bg-sky-500/10", hex: "#0ea5e9" },
};

export const profileColors: Record<string, string> = {
  teal: "from-teal-400 to-teal-600",
  violet: "from-violet-400 to-violet-600",
  amber: "from-amber-400 to-orange-500",
  rose: "from-rose-400 to-pink-600",
  sky: "from-sky-400 to-blue-600",
};

export function methodLabel(m: string | null | undefined) {
  return ({ claude: "Claude AI", gemini: "Gemini AI", ai: "AI", "text-parser": "offline parser", demo: "demo dataset", manual: "manual entry" } as Record<string, string>)[m ?? ""] ?? m ?? "-";
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");
}

export const conditionLabels: Record<string, string> = {
  diabetes: "Diabetes", hypertension: "High BP", hypothyroidism: "Thyroid (low)", ckd: "Kidney disease",
  heart_disease: "Heart disease", asthma: "Asthma", pcos: "PCOS", fatty_liver: "Fatty liver",
};
