import { useMemo, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceArea, ReferenceLine, CartesianGrid } from "recharts";
import { Activity, FlaskConical, Pill, Thermometer, Radar, GitBranch, LineChart as LineIcon } from "lucide-react";
import { useApp, useFetch } from "../lib/store";
import { fmtDate, fmtNum, statusStyles } from "../lib/format";
import type { Status } from "../lib/types";
import { Empty, ErrorBox, PageHeader, Spinner } from "../components/ui";

interface Series {
  code: string; name: string; unit: string; category: string; ref_low: number | null; ref_high: number | null; simple: string; latest_flag: string | null;
  points: { date: string; value: number; lab: string | null; result_id: number; flag: string | null; value_raw: string | null; unit_raw: string | null }[];
  lab_changes: { date: string; from: string | null; to: string | null }[];
}
interface Trends { series: Series[]; derived: { id: string; name: string; status: Status; points: { date: string; value: number; status: Status }[] }[] }
interface Event { date: string; type: "report" | "medicine" | "symptom" | "insight"; kind?: string; title: string; subtitle: string; report_id?: number; abnormal?: string[]; status?: Status }

const EV: Record<Event["type"], { icon: typeof Pill; cls: string }> = {
  report: { icon: FlaskConical, cls: "bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" },
  medicine: { icon: Pill, cls: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" },
  symptom: { icon: Thermometer, cls: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" },
  insight: { icon: Radar, cls: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" },
};

function TrendCard({ s }: { s: Series }) {
  const vals = s.points.map((p) => p.value);
  const lo = Math.min(...vals, s.ref_low ?? Infinity);
  const hi = Math.max(...vals, s.ref_high ?? -Infinity);
  const pad = (hi - lo) * 0.15 || 1;
  const step = 10 ** Math.floor(Math.log10(Math.max(hi - lo + 2 * pad, 1e-6))) / 2;
  const domain = [Math.max(0, Math.floor((lo - pad) / step) * step), Math.ceil((hi + pad) / step) * step].map((x) => Number(x.toPrecision(6)));
  return (
    <div className="card p-4">
      <div className="mb-1 flex items-start justify-between gap-2">
        <div>
          <p className="font-bold">{s.name}</p>
          <p className="text-[11px] muted">{s.category} · normal {s.ref_low ?? "–"}–{s.ref_high ?? "–"} {s.unit}</p>
        </div>
        <p className={`text-xl font-extrabold ${s.latest_flag === "N" ? "text-ink dark:text-white" : "text-red-600"}`}>{fmtNum(vals[vals.length - 1])}<span className="ml-1 text-xs font-medium muted">{s.unit}</span></p>
      </div>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={s.points} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-slate-100 dark:text-white/5" />
            {(s.ref_low !== null || s.ref_high !== null) && <ReferenceArea y1={Math.max(s.ref_low ?? domain[0], domain[0])} y2={Math.min(s.ref_high ?? domain[1], domain[1])} fill="#10b981" fillOpacity={0.08} ifOverflow="hidden" />}
            {s.lab_changes.map((c) => <ReferenceLine key={c.date} x={c.date} stroke="#a78bfa" strokeDasharray="3 3" />)}
            <XAxis dataKey="date" tickFormatter={(d) => fmtDate(d, { month: "short", year: "2-digit" })} tick={{ fontSize: 10 }} stroke="#94a3b8" />
            <YAxis domain={domain} tickFormatter={(v) => fmtNum(v, 2)} tick={{ fontSize: 10 }} stroke="#94a3b8" />
            <Tooltip
              contentStyle={{ borderRadius: 12, fontSize: 12 }}
              labelFormatter={(d) => fmtDate(d as string)}
              formatter={(v: number, _n, item) => [`${fmtNum(v)} ${s.unit}  (printed: ${item.payload.value_raw} ${item.payload.unit_raw ?? ""})`, item.payload.lab ?? ""]}
            />
            <Line isAnimationActive={false} type="monotone" dataKey="value" stroke="#0d9488" strokeWidth={2.5}
              dot={(p: { cx?: number; cy?: number; index?: number; payload?: { flag: string } }) => <circle key={p.index} cx={p.cx} cy={p.cy} r={4.5} fill={p.payload?.flag === "N" ? "#0d9488" : "#ef4444"} stroke="white" strokeWidth={2} />} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {s.lab_changes.length > 0 && <p className="mt-1 flex items-center gap-1 text-[11px] text-violet-600 dark:text-violet-300"><GitBranch className="h-3 w-3" /> {s.lab_changes.length} lab change(s), all converted to {s.unit}</p>}
    </div>
  );
}

export default function Timeline() {
  const { profile } = useApp();
  const [tab, setTab] = useState<"trends" | "timeline">("trends");
  const [cat, setCat] = useState("All");
  const trends = useFetch<Trends>(profile ? `/profiles/${profile.id}/trends` : null);
  const events = useFetch<Event[]>(profile && tab === "timeline" ? `/profiles/${profile.id}/timeline` : null);
  const cats = useMemo(() => ["All", ...new Set((trends.data?.series ?? []).map((s) => s.category))], [trends.data]);

  if (trends.error) return <ErrorBox msg={trends.error} />;

  return (
    <div>
      <PageHeader icon={<Activity className="h-6 w-6" />} title="Timeline & trends" subtitle="Your history across every lab, on one scale. Green bands show the normal range; violet lines mark where the lab changed." />
      <div className="mb-5 flex rounded-xl bg-slate-100 p-1 w-fit dark:bg-white/5">
        {([["trends", "Trends", LineIcon], ["timeline", "Timeline", Activity]] as const).map(([t, l, I]) => (
          <button key={t} onClick={() => setTab(t)} className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-semibold ${tab === t ? "bg-white shadow-sm dark:bg-white/10" : "muted"}`}><I className="h-4 w-4" />{l}</button>
        ))}
      </div>

      {tab === "trends" ? (
        !trends.data ? <Spinner /> : !trends.data.series.length ? <Empty icon={<LineIcon className="h-7 w-7" />} title="No values yet" text="Confirm a report to see trends." /> : (
          <>
            {!!trends.data.derived.length && (
              <div className="mb-6">
                <p className="label">Calculated scores over time</p>
                <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                  {trends.data.derived.map((d) => (
                    <div key={d.id} className="card min-w-[160px] p-3">
                      <p className="text-xs font-semibold muted">{d.name}</p>
                      <p className={`text-lg font-extrabold ${statusStyles[d.status].text}`}>{d.points.map((p) => fmtNum(p.value, 1)).join(" → ")}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="mb-4 flex gap-1.5 overflow-x-auto no-scrollbar">
              {cats.map((c) => <button key={c} onClick={() => setCat(c)} className={`chip whitespace-nowrap px-3 py-1.5 ${cat === c ? "bg-brand-600 text-white" : "bg-white text-slate-600 shadow-sm dark:bg-white/5 dark:text-slate-300"}`}>{c}</button>)}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {trends.data.series.filter((s) => cat === "All" || s.category === cat).map((s) => <TrendCard key={s.code} s={s} />)}
            </div>
          </>
        )
      ) : !events.data ? <Spinner /> : (
        <ol className="relative ml-4 border-l-2 border-slate-200 dark:border-white/10">
          {events.data.map((e, i) => {
            const { icon: Icon, cls } = EV[e.type];
            return (
              <li key={i} className="mb-5 ml-6 animate-fade-up" style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
                <span className={`absolute -left-[17px] grid h-8 w-8 place-items-center rounded-full ring-4 ring-[#f6faf9] dark:ring-[#0a1413] ${cls}`}><Icon className="h-4 w-4" /></span>
                <div className={`card p-4 ${e.type === "insight" && e.status ? `ring-1 ${statusStyles[e.status].ring}` : ""}`}>
                  <p className="text-[11px] font-bold uppercase tracking-wider muted">{fmtDate(e.date)}</p>
                  <p className="font-bold">{e.title}</p>
                  <p className="text-sm muted">{e.subtitle}</p>
                  {!!e.abnormal?.length && <p className="mt-1 text-xs text-red-600">Out of range: {e.abnormal.join(", ")}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
