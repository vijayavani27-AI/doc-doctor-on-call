import { ArrowDown, ArrowUp, Minus, HeartPulse, Radar, Pill, FlaskConical, HelpCircle, ShieldAlert, Thermometer, TrendingDown } from "lucide-react";
import { conditionLabels, fmtDate, fmtNum, statusStyles } from "../lib/format";
import type { Level, Status } from "../lib/types";
import { StatusChip } from "./ui";

export interface Summary {
  patient: { name: string; age: number | null; sex: string; conditions: string[]; relation: string };
  generated_at: string;
  score: { value: number; label: string };
  risks: { name: string; condition: string; value: number; status: Status; label: string; text: string; date: string; equation: string; inputs: string[]; trend: { first: number; first_date: string } | null; citation: string }[];
  alerts: { level: Level; title: string; text: string }[];
  drifts: { name: string; message: string }[];
  medicines: { brand: string; generic: string | null; dose: string | null; frequency: string | null; since: string | null; reason: string | null }[];
  symptoms: { label: string; onset: string; notes: string | null }[];
  wellness?: { label: string; unit: string; latest: number; latest2: number | null; avg30: number | null; avg30_2: number | null; note: string | null; status: Status; count: number }[];
  labs: { code: string; name: string; value: number; unit: string; date: string; flag: string | null; previous: number | null; trend: "up" | "down" | "stable" | null; lab: string | null }[];
  questions: string[];
  next_tests: { name: string; price_inr: number }[];
  disclaimer: string;
  expires_at?: string;
}

function H({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return <h3 className="mb-3 mt-6 flex items-center gap-2 border-b border-slate-100 pb-2 text-sm font-extrabold uppercase tracking-wider text-brand-800 dark:border-white/10 dark:text-brand-300">{icon}{children}</h3>;
}

export function SummaryView({ s }: { s: Summary }) {
  return (
    <div className="card p-6 sm:p-8 print:border-0 print:shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl bg-gradient-to-r from-brand-600 to-brand-800 p-5 text-white">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-brand-100">Doctor visit summary</p>
          <p className="text-2xl font-extrabold">{s.patient.name}</p>
          <p className="text-sm text-brand-100">{s.patient.age} y · {s.patient.sex === "F" ? "Female" : "Male"} · {s.patient.conditions.map((c) => conditionLabels[c] ?? c).join(", ") || "no known conditions"}</p>
        </div>
        <div className="text-right text-xs text-brand-100">Prepared {fmtDate(s.generated_at)}<br />by DOC from the patient's records</div>
      </div>

      {!!s.risks.length && (<>
        <H icon={<Radar className="h-4 w-4" />}>Hidden risks (calculated by combining reports)</H>
        <div className="space-y-3">
          {s.risks.map((r) => (
            <div key={r.name} className={`rounded-xl border-l-4 p-3 ${statusStyles[r.status].soft}`} style={{ borderColor: statusStyles[r.status].hex }}>
              <div className="flex flex-wrap items-center gap-2"><b>{r.name} = {fmtNum(r.value)}</b><StatusChip status={r.status}>{r.label}</StatusChip><span className="text-xs muted">{r.condition}</span></div>
              <p className="mt-1 text-sm">{r.text}</p>
              <p className="mt-1 text-xs muted">{r.equation} · Inputs: {r.inputs.join("; ")}{r.trend ? ` · Trend: ${r.trend.first} (${r.trend.first_date}) → ${fmtNum(r.value)}` : ""}</p>
            </div>
          ))}
        </div>
      </>)}

      {!!s.alerts.length && (<>
        <H icon={<ShieldAlert className="h-4 w-4" />}>Medicine & care alerts</H>
        <ul className="space-y-2 text-sm">{s.alerts.map((a) => <li key={a.title}><b style={{ color: statusStyles[a.level].hex }}>● {a.title}.</b> <span className="muted">{a.text}</span></li>)}</ul>
      </>)}

      <div className="grid gap-x-8 md:grid-cols-2">
        <div>
          <H icon={<Pill className="h-4 w-4" />}>Current medicines</H>
          <ul className="space-y-1.5 text-sm">{s.medicines.map((m) => <li key={m.brand}><b>{m.brand}</b> <span className="muted">({m.generic}) {m.dose} {m.frequency} · since {fmtDate(m.since)}</span></li>)}</ul>
          {!!s.symptoms.length && (<>
            <H icon={<Thermometer className="h-4 w-4" />}>Symptoms (last 12 months)</H>
            <ul className="space-y-1 text-sm">{s.symptoms.map((x) => <li key={x.label + x.onset}>{fmtDate(x.onset)}: <b>{x.label}</b> <span className="muted">{x.notes}</span></li>)}</ul>
          </>)}
        </div>
        <div>
          <H icon={<FlaskConical className="h-4 w-4" />}>Key results</H>
          <table className="w-full text-sm">
            <tbody>
              {s.labs.map((l) => (
                <tr key={l.code} className="border-b border-slate-50 dark:border-white/5">
                  <td className="py-1.5">{l.name}</td>
                  <td className={`py-1.5 text-right font-bold ${l.flag && l.flag !== "N" ? "text-red-600" : ""}`}>{fmtNum(l.value)} <span className="text-xs font-normal muted">{l.unit}</span></td>
                  <td className="w-16 py-1.5 text-right text-xs muted">{l.previous !== null ? fmtNum(l.previous) : ""}</td>
                  <td className="w-6 py-1.5 text-right">{l.trend === "up" ? <ArrowUp className="inline h-3.5 w-3.5" /> : l.trend === "down" ? <ArrowDown className="inline h-3.5 w-3.5" /> : l.trend ? <Minus className="inline h-3.5 w-3.5" /> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {!!s.wellness?.length && (<>
        <H icon={<HeartPulse className="h-4 w-4" />}>Home readings (wellness data)</H>
        <div className="grid gap-2 sm:grid-cols-2">
          {s.wellness.map((w) => (
            <div key={w.label} className={`rounded-xl p-3 text-sm ${statusStyles[w.status].soft}`}>
              <b>{w.label}</b>: latest {w.latest2 != null ? `${Math.round(w.latest)}/${Math.round(w.latest2)}` : fmtNum(w.latest, 1)} {w.unit}
              {w.avg30 != null && <span className="muted"> · 30-day avg {w.avg30_2 ? `${Math.round(w.avg30)}/${Math.round(w.avg30_2)}` : fmtNum(w.avg30, 1)}</span>}
              <span className="block text-xs muted">{w.count} readings{w.note ? ` · ${w.note}` : ""}</span>
            </div>
          ))}
        </div>
      </>)}

      {!!s.drifts.length && (<>
        <H icon={<TrendingDown className="h-4 w-4" />}>Silent trends</H>
        <ul className="space-y-1 text-sm">{s.drifts.map((d) => <li key={d.name}>{d.message}</li>)}</ul>
      </>)}

      {!!s.questions.length && (<>
        <H icon={<HelpCircle className="h-4 w-4" />}>Questions for the doctor</H>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm">{s.questions.map((q) => <li key={q}>{q}</li>)}</ol>
      </>)}
      <p className="mt-8 text-[11px] muted">{s.disclaimer}</p>
    </div>
  );
}
