import { X, Loader2, AlertTriangle, Info, CheckCircle2, ShieldAlert } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { statusStyles } from "../lib/format";
import type { Level, Status } from "../lib/types";

export function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return <img src="/icon.svg" alt="" className={`${className} rounded-xl`} />;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm muted">
      <Loader2 className="h-5 w-5 animate-spin text-brand-600" /> {label ?? "Loading…"}
    </div>
  );
}

export function ErrorBox({ msg }: { msg: string }) {
  return <div className="card border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{msg}</div>;
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/10">{icon}</div>
      <h3 className="font-bold text-ink dark:text-white">{title}</h3>
      <p className="mt-1 max-w-sm text-sm muted">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, icon, right }: { title: string; subtitle?: string; icon?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3 animate-fade-up">
      <div className="flex items-start gap-3">
        {icon && <div className="mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-700 text-white shadow-lift">{icon}</div>}
        <div>
          <h1 className="h-page">{title}</h1>
          {subtitle && <p className="mt-1 max-w-2xl text-sm muted">{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

export function StatusChip({ status, children }: { status: Status | Level; children: ReactNode }) {
  return (
    <span className={`chip ${statusStyles[status].chip}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${statusStyles[status].dot}`} />
      {children}
    </span>
  );
}

export function FlagChip({ flag, computed }: { flag: string | null | undefined; computed?: string | null }) {
  if (computed === "critical_high") return <span className="chip bg-red-600 text-white">Critical high</span>;
  if (computed === "critical_low") return <span className="chip bg-red-600 text-white">Critical low</span>;
  if (flag === "H") return <span className="chip bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300">High</span>;
  if (flag === "L") return <span className="chip bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">Low</span>;
  if (flag === "N") return <span className="chip bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">Normal</span>;
  return null;
}

export function LevelIcon({ level, className = "h-5 w-5" }: { level: Level; className?: string }) {
  if (level === "red") return <ShieldAlert className={`${className} text-red-500`} />;
  if (level === "yellow") return <AlertTriangle className={`${className} text-amber-500`} />;
  return <Info className={`${className} text-sky-500`} />;
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  // Rendered into <body> so a modal opened from inside a table/card never inherits its layout or alignment.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 text-left backdrop-blur-sm sm:items-center sm:p-6" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div
        className={`card max-h-[92vh] w-full overflow-y-auto rounded-b-none p-5 animate-fade-up sm:rounded-2xl ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold text-ink dark:text-white">{title}</h2>
          <button className="btn-ghost -mr-2 -mt-1 p-2" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function ScoreRing({ value, size = 132, label }: { value: number; size?: number; label?: string }) {
  const r = (size - 16) / 2;
  const c = 2 * Math.PI * r;
  const color = value >= 85 ? "#10b981" : value >= 65 ? "#14b8a6" : value >= 40 ? "#f59e0b" : "#ef4444";
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="currentColor" className="text-slate-100 dark:text-white/10" strokeWidth={12} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={12}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value / 100)}
          style={{ transition: "stroke-dashoffset 1s ease" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="text-3xl font-extrabold text-ink dark:text-white">{value}</div>
          {label && <div className="text-[10px] font-semibold uppercase tracking-wider muted">{label}</div>}
        </div>
      </div>
    </div>
  );
}

export function Sparkline({ values, color = "#0d9488", w = 96, h = 28 }: { values: number[]; color?: string; w?: number; h?: number }) {
  if (values.length < 2) return <div style={{ width: w, height: h }} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * (w - 4) + 2},${h - 2 - ((v - min) / span) * (h - 4)}`).join(" ");
  const last = pts.split(" ").pop()!.split(",");
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r={3} fill={color} />
    </svg>
  );
}

export function ConfidenceBadge({ value }: { value: number }) {
  if (value >= 0.8) return <span className="chip bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"><CheckCircle2 className="h-3 w-3" />{Math.round(value * 100)}%</span>;
  return <span className="chip bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"><AlertTriangle className="h-3 w-3" />Check · {Math.round(value * 100)}%</span>;
}

export function Disclaimer({ text }: { text: string }) {
  return <p className="mt-10 flex items-start gap-2 text-xs muted"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />{text}</p>;
}
