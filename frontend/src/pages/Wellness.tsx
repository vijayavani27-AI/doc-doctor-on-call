import { useRef, useState, type FormEvent } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid } from "recharts";
import { HeartPulse, Plus, Upload, Download, Trash2, Activity, Droplets, Scale, Footprints, Moon, Wind, Heart, BookOpen, CheckCircle2 } from "lucide-react";
import { api } from "../lib/api";
import { useApp, useFetch } from "../lib/store";
import { fmtDate, fmtNum, statusStyles } from "../lib/format";
import type { Alert, Status } from "../lib/types";
import { Disclaimer, Empty, ErrorBox, LevelIcon, Modal, PageHeader, Spinner, StatusChip } from "../components/ui";

interface Card {
  kind: string; label: string; unit: string; target: string; citation: string; count: number; status: Status;
  latest: number; latest2: number | null; latest_at: string; avg30: number | null; avg30_2: number | null; prev30: number | null;
  note: string | null; bmi?: number; change_6m_pct?: number;
  points: { at: string; value: number; value2: number | null; context: string | null }[];
}
interface Kind { label: string; unit: string; two_values?: boolean; value_label?: string; value2_label?: string; contexts?: string[]; target: string }
interface Data { cards: Card[]; alerts: Alert[]; kinds: Record<string, Kind>; recent: { id: number; kind: string; value: number; value2: number | null; context: string | null; measured_at: string; source: string }[] }

const ICON: Record<string, typeof Heart> = { bp: Activity, glucose: Droplets, weight: Scale, heart_rate: Heart, spo2: Wind, steps: Footprints, sleep: Moon };
const REF: Record<string, { y: number; label: string; color: string }[]> = {
  bp: [{ y: 135, label: "135", color: "#ef4444" }, { y: 85, label: "85", color: "#f59e0b" }],
  glucose: [{ y: 130, label: "130", color: "#f59e0b" }, { y: 70, label: "70", color: "#ef4444" }],
  steps: [{ y: 7000, label: "7k goal", color: "#10b981" }],
  sleep: [{ y: 7, label: "7 h", color: "#10b981" }],
  spo2: [{ y: 94, label: "94%", color: "#ef4444" }],
  heart_rate: [{ y: 100, label: "100", color: "#f59e0b" }],
};

function show(v: number | null | undefined, v2?: number | null, kind?: string) {
  if (v === null || v === undefined) return "-";
  if (kind === "steps") return Math.round(v).toLocaleString("en-IN");
  return v2 !== null && v2 !== undefined ? `${Math.round(v)}/${Math.round(v2)}` : fmtNum(v, 1);
}

function CardView({ c }: { c: Card }) {
  const Icon = ICON[c.kind] ?? HeartPulse;
  const data = c.points.map((p) => ({ ...p, d: p.at.slice(0, 10) }));
  const trend = c.prev30 && c.avg30 ? c.avg30 - c.prev30 : null;
  return (
    <div className={`card spotlight p-5 ring-1 ${statusStyles[c.status].ring}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`grid h-11 w-11 place-items-center rounded-2xl ${statusStyles[c.status].soft} ${statusStyles[c.status].text}`}><Icon className="h-5 w-5" /></div>
          <div>
            <p className="font-bold">{c.label}</p>
            <p className="text-xs muted">Target: {c.target}</p>
          </div>
        </div>
        <StatusChip status={c.status}>{c.status === "green" ? "On track" : c.status === "yellow" ? "Watch" : "Talk to doctor"}</StatusChip>
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide muted">Latest · {fmtDate(c.latest_at, { day: "numeric", month: "short" })}</p>
          <p className="text-3xl font-extrabold text-ink dark:text-white">{show(c.latest, c.latest2, c.kind)} <span className="text-sm font-medium muted">{c.unit}</span></p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-semibold uppercase tracking-wide muted">30-day average</p>
          <p className="text-lg font-bold">{show(c.avg30, c.avg30_2, c.kind)}</p>
          {trend !== null && Math.abs(trend) >= 0.5 && <p className={`text-[11px] font-semibold ${trend > 0 ? "text-amber-600" : "text-emerald-600"}`}>{trend > 0 ? "▲" : "▼"} {fmtNum(Math.abs(trend), 1)} vs previous 30 days</p>}
        </div>
      </div>
      {data.length > 1 && (
        <div className="mt-3 h-36">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-slate-100 dark:text-white/5" />
              <XAxis dataKey="d" tickFormatter={(x) => fmtDate(x, { day: "numeric", month: "short" })} tick={{ fontSize: 10 }} stroke="#94a3b8" minTickGap={30} />
              <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" domain={["auto", "auto"]} />
              <Tooltip labelFormatter={(x) => fmtDate(x as string)} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
              {(REF[c.kind] ?? []).map((r) => <ReferenceLine key={r.y} y={r.y} stroke={r.color} strokeDasharray="4 4" label={{ value: r.label, fontSize: 9, fill: r.color, position: "insideTopRight" }} />)}
              <Line type="monotone" dataKey="value" name={c.kind === "bp" ? "Systolic" : c.label} stroke="#0d9488" strokeWidth={2} dot={false} isAnimationActive={false} />
              {c.kind === "bp" && <Line type="monotone" dataKey="value2" name="Diastolic" stroke="#8b5cf6" strokeWidth={2} dot={false} isAnimationActive={false} />}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {c.note && <p className="mt-2 text-xs muted">{c.note}{c.change_6m_pct !== undefined ? ` · ${c.change_6m_pct > 0 ? "+" : ""}${c.change_6m_pct}% in 6 months` : ""}</p>}
      <p className="mt-2 flex gap-1 text-[10px] muted"><BookOpen className="mt-0.5 h-3 w-3 shrink-0" />{c.citation}</p>
    </div>
  );
}

export default function Wellness() {
  const { profile, bump } = useApp();
  const { data, error, reload } = useFetch<Data>(profile ? `/profiles/${profile.id}/wellness` : null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ kind: "bp", value: "", value2: "", context: "fasting", at: new Date().toISOString().slice(0, 16) });
  const [err, setErr] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (error) return <ErrorBox msg={error} />;
  if (!data || !profile) return <Spinner />;
  const k = data.kinds[form.kind];

  async function save(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await api.post(`/profiles/${profile!.id}/wellness`, {
        kind: form.kind, value: Number(form.value), value2: k?.two_values ? Number(form.value2) : null,
        context: form.kind === "glucose" ? form.context : null, measured_at: new Date(form.at).toISOString(),
      });
      setAdding(false);
      setForm({ ...form, value: "", value2: "" });
      reload();
      bump();
    } catch (x) { setErr((x as Error).message); }
  }

  async function importCsv(f: File) {
    const fd = new FormData();
    fd.append("file", f);
    try {
      const r = await api.upload<{ added: number; errors: string[] }>(`/profiles/${profile!.id}/wellness/import`, fd);
      setImportMsg(`Imported ${r.added} reading(s)${r.errors.length ? `; skipped ${r.errors.length}: ${r.errors.slice(0, 3).join("; ")}` : ""}.`);
      reload();
      bump();
    } catch (x) { setImportMsg((x as Error).message); }
  }

  return (
    <div>
      <PageHeader icon={<HeartPulse className="h-6 w-6" />} title="Wellness" subtitle="Home readings (BP, sugar, weight, heart rate, oxygen, steps, sleep), checked against guideline targets and linked with your medicines and reports."
        right={
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add reading</button>
            <button className="btn-outline" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Import CSV</button>
            <a className="btn-ghost" href="/api/wellness/template.csv" download><Download className="h-4 w-4" /> Template</a>
            <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])} />
          </div>
        } />
      {importMsg && <p className="mb-4 flex items-center gap-2 rounded-xl bg-brand-50 p-3 text-sm dark:bg-brand-500/10"><CheckCircle2 className="h-4 w-4 text-brand-600" />{importMsg}</p>}

      {!!data.alerts.length && (
        <section className="mb-6 grid gap-3 md:grid-cols-2">
          {data.alerts.map((a) => (
            <div key={a.id} className={`card p-4 ${a.level === "red" ? "border-red-200 dark:border-red-500/30" : ""}`}>
              <div className="flex gap-3">
                <LevelIcon level={a.level} />
                <div>
                  <p className="font-bold">{a.title}</p>
                  <p className="mt-0.5 text-sm muted">{a.text}</p>
                  {a.action && <p className="mt-2 text-sm font-medium text-brand-800 dark:text-brand-200">💬 {a.action}</p>}
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      {data.cards.length === 0 ? (
        <Empty icon={<HeartPulse className="h-7 w-7" />} title="No home readings yet" text="Add your BP, sugar, weight or steps, or import a CSV from your BP monitor / fitness app (use the template)." action={<button className="btn-primary" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add first reading</button>} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">{data.cards.map((c) => <CardView key={c.kind} c={c} />)}</div>
      )}

      {!!data.recent.length && (
        <section className="card mt-6 p-5">
          <h2 className="mb-3 font-bold">Recent readings</h2>
          <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto text-sm dark:divide-white/5">
            {data.recent.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 py-2">
                <span className="w-28 shrink-0 text-xs muted">{fmtDate(r.measured_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                <span className="flex-1 font-semibold">{data.kinds[r.kind]?.label ?? r.kind}</span>
                <span className="font-bold">{show(r.value, r.value2, r.kind)} <span className="text-xs font-normal muted">{data.kinds[r.kind]?.unit}{r.context ? ` · ${r.context.replace("_", " ")}` : ""}</span></span>
                <span className="chip bg-slate-100 text-[10px] text-slate-500 dark:bg-white/10">{r.source}</span>
                <button className="btn-ghost p-1.5 hover:text-red-600" aria-label="Delete reading" onClick={async () => { await api.del(`/wellness/${r.id}`); reload(); bump(); }}><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        </section>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="Add a home reading">
        <form onSubmit={save} className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {Object.entries(data.kinds).map(([key, kd]) => {
              const I = ICON[key] ?? HeartPulse;
              return <button type="button" key={key} onClick={() => setForm({ ...form, kind: key })} className={`chip px-3 py-2 ${form.kind === key ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200"}`}><I className="h-3.5 w-3.5" /> {kd.label}</button>;
            })}
          </div>
          <div className={`grid gap-3 ${k?.two_values ? "grid-cols-2" : ""}`}>
            <div><label className="label">{k?.value_label ?? `Value (${k?.unit})`}</label><input className="input" type="number" step="any" required value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder={form.kind === "bp" ? "130" : ""} /></div>
            {k?.two_values && <div><label className="label">{k.value2_label}</label><input className="input" type="number" step="any" required value={form.value2} onChange={(e) => setForm({ ...form, value2: e.target.value })} placeholder="85" /></div>}
          </div>
          {form.kind === "glucose" && (
            <div><label className="label">When</label>
              <select className="input" value={form.context} onChange={(e) => setForm({ ...form, context: e.target.value })}><option value="fasting">Fasting (before breakfast)</option><option value="after_meal">2 hours after a meal</option><option value="random">Random</option></select></div>
          )}
          <div><label className="label">Date & time</label><input className="input" type="datetime-local" value={form.at} onChange={(e) => setForm({ ...form, at: e.target.value })} /></div>
          <p className="text-xs muted">Target: {k?.target}</p>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button className="btn-primary w-full">Save reading</button>
        </form>
      </Modal>
      <Disclaimer text="Home readings help your doctor see the full picture. If a reading is very high or low and you feel unwell, seek medical help immediately." />
    </div>
  );
}
