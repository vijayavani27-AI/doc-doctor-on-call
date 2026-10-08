import { useEffect, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid } from "recharts";
import { Radar, GitMerge, BookOpen, ArrowRight, TrendingDown, TrendingUp, Microscope, Lightbulb, IndianRupee, CheckCircle2, Sigma, Brain, Droplet, HeartPulse, Activity, Bone } from "lucide-react";
import { useApp, useFetch } from "../lib/store";
import { fmtDate, fmtNum, statusStyles } from "../lib/format";
import type { Analysis, Risk, Status } from "../lib/types";
import { Disclaimer, Empty, ErrorBox, FlagChip, PageHeader, Spinner, StatusChip } from "../components/ui";
import { ExplainButton } from "../components/Explain";
import { ReportDrawer } from "../components/ReportDrawer";
import { t } from "../lib/i18n";

/** Display scale for the gauge: segment boundaries and colours (low -> high). */
const SCALES: Record<string, { min: number; max: number; stops: [number, Status][] }> = {
  fib4: { min: 0, max: 4, stops: [[1.3, "green"], [2.67, "yellow"], [4, "red"]] },
  apri: { min: 0, max: 2, stops: [[0.5, "green"], [1, "yellow"], [2, "red"]] },
  mentzer: { min: 8, max: 20, stops: [[13, "red"], [20, "yellow"]] },
  tyg: { min: 7.5, max: 10, stops: [[8.5, "green"], [8.8, "yellow"], [10, "red"]] },
  tg_hdl: { min: 0, max: 6, stops: [[2, "green"], [3, "yellow"], [6, "red"]] },
  egfr: { min: 0, max: 120, stops: [[45, "red"], [60, "yellow"], [120, "green"]] },
  non_hdl: { min: 50, max: 250, stops: [[130, "green"], [160, "yellow"], [250, "red"]] },
  corr_ca: { min: 7, max: 12, stops: [[8.5, "yellow"], [10.5, "green"], [12, "yellow"]] },
};

const ORGAN_ICON: Record<string, typeof Brain> = { Liver: Microscope, Kidney: Droplet, Blood: Droplet, Heart: HeartPulse, Metabolism: Activity, "Bones & hormones": Bone };

function Gauge({ risk }: { risk: Risk }) {
  const s = SCALES[risk.id];
  if (!s) return null;
  const pct = (v: number) => Math.min(100, Math.max(0, ((v - s.min) / (s.max - s.min)) * 100));
  let prev = s.min;
  return (
    <div>
      <div className="relative flex h-3 overflow-hidden rounded-full">
        {s.stops.map(([end, st], i) => {
          const w = pct(end) - pct(prev);
          prev = end;
          return <div key={i} style={{ width: `${w}%`, background: statusStyles[st].hex, opacity: 0.85 }} />;
        })}
      </div>
      <div className="relative h-5">
        <div className="absolute -top-4 h-5 w-1 -translate-x-1/2 rounded-full bg-ink shadow ring-2 ring-white dark:bg-white dark:ring-ink" style={{ left: `${pct(risk.current.value)}%` }} />
        {s.stops.slice(0, -1).map(([end]) => (
          <span key={end} className="absolute top-1 -translate-x-1/2 text-[10px] muted" style={{ left: `${pct(end)}%` }}>{end}</span>
        ))}
      </div>
    </div>
  );
}

function Equation({ risk }: { risk: Risk }) {
  const v = Object.fromEntries(risk.current.inputs.map((i) => [i.code, i.value]));
  const plugged: Record<string, string> = {
    fib4: `(${v.AGE} × ${v.AST}) ÷ (${v.PLT} × √${v.ALT})`,
    apri: `((${v.AST} ÷ 40) × 100) ÷ ${v.PLT}`,
    mentzer: `${v.MCV} ÷ ${v.RBC}`,
    tyg: `ln(${v.TG} × ${v.FBG} ÷ 2)`,
    tg_hdl: `${v.TG} ÷ ${v.HDL}`,
    non_hdl: `${v.TC} − ${v.HDL}`,
    corr_ca: `${v.CA} + 0.8 × (4 − ${v.ALB})`,
    egfr: `CKD-EPI 2021 (creatinine ${v.CREAT}, age ${v.AGE})`,
  };
  return (
    <div className="rounded-xl bg-slate-900 p-3 font-mono text-xs text-slate-200 dark:bg-black/40">
      <div className="text-slate-400">{risk.equation}</div>
      <div className="mt-1">= {plugged[risk.id]} = <b className="text-amber-300">{fmtNum(risk.current.value)}</b></div>
    </div>
  );
}

function TrendChart({ risk }: { risk: Risk }) {
  if (risk.history.length < 2) return null;
  const data = risk.history.map((h) => ({ date: h.date, value: h.value, status: h.status }));
  const s = SCALES[risk.id];
  return (
    <div className="h-36">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-slate-200 dark:text-white/10" />
          <XAxis dataKey="date" tickFormatter={(d) => fmtDate(d, { month: "short", year: "2-digit" })} tick={{ fontSize: 10 }} stroke="#94a3b8" />
          <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" domain={["auto", "auto"]} />
          <Tooltip formatter={(v: number) => fmtNum(v)} labelFormatter={(d) => fmtDate(d as string)} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
          {s?.stops.slice(0, -1).map(([v, st]) => <ReferenceLine key={v} y={v} stroke={statusStyles[st].hex} strokeDasharray="4 4" />)}
          <Line isAnimationActive={false} type="monotone" dataKey="value" stroke="#0d9488" strokeWidth={2.5}
            dot={(p: { cx?: number; cy?: number; payload?: { status: Status }; index?: number }) => <circle key={p.index} cx={p.cx} cy={p.cy} r={5} fill={statusStyles[p.payload?.status ?? "green"].hex} stroke="white" strokeWidth={2} />} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function RiskCard({ risk, onSource }: { risk: Risk; onSource: (rid: number, res: number) => void }) {
  const st = statusStyles[risk.status];
  const Icon = ORGAN_ICON[risk.organ] ?? Brain;
  const c = risk.current;
  return (
    <article id={risk.id} className={`card scroll-mt-24 overflow-hidden ring-1 ${st.ring} animate-fade-up`}>
      <div className={`flex flex-wrap items-start gap-4 p-5 ${st.soft}`}>
        <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white shadow-soft dark:bg-white/10 ${st.text}`}><Icon className="h-6 w-6" /></div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wider muted">{risk.organ} · {risk.name}</p>
          <h3 className="text-lg font-extrabold text-ink dark:text-white">{risk.hidden_condition}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <StatusChip status={risk.status}>{risk.label}</StatusChip>
            {risk.stage && <span className="chip bg-white text-slate-700 dark:bg-white/10 dark:text-slate-200">Stage {risk.stage}</span>}
            {c.reports_combined > 1 && <span className="chip bg-ink text-white dark:bg-white dark:text-ink"><GitMerge className="h-3 w-3" /> joined {c.reports_combined} reports{c.labs_combined.length > 1 ? ` · ${c.labs_combined.length} labs` : ""}</span>}
            {c.all_inputs_normal && risk.status !== "green" && <span className="chip bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"><CheckCircle2 className="h-3 w-3" /> every input looked “normal”</span>}
          </div>
        </div>
        <div className="text-right">
          <p className={`text-4xl font-extrabold ${st.text}`}>{fmtNum(c.value)}</p>
          <p className="text-xs muted">{fmtDate(c.date)}</p>
        </div>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-2">
        <div className="space-y-4">
          <Gauge risk={risk} />
          <p className="text-sm leading-relaxed">{risk.text}</p>
          <div>
            <p className="label">Found by combining</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {c.inputs.map((i) => (
                <button
                  key={i.code}
                  disabled={!i.report_id}
                  onClick={() => i.report_id && i.result_id && onSource(i.report_id, i.result_id)}
                  className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 p-2.5 text-left transition enabled:hover:border-brand-400 enabled:hover:shadow-soft dark:border-white/10"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold">{i.name}</p>
                    <p className="truncate text-[11px] muted">{i.lab ? `${i.lab.split(",")[0]} · ` : ""}{fmtDate(i.date, { day: "numeric", month: "short", year: "2-digit" })}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">{fmtNum(i.value)} <span className="text-[10px] font-medium muted">{i.unit}</span></p>
                    {i.code !== "AGE" && <FlagChip flag={i.flag} />}
                  </div>
                </button>
              ))}
            </div>
          </div>
          <Equation risk={risk} />
        </div>

        <div className="space-y-4">
          {risk.history.length > 1 && (
            <div>
              <p className="label flex items-center gap-1.5">
                {risk.trend && (risk.trend.per_year >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />)}
                Over time: {fmtNum(risk.history[0].value)} → {fmtNum(c.value)}
                {risk.trend && <span className="normal-case tracking-normal">({risk.trend.per_year > 0 ? "+" : ""}{fmtNum(risk.trend.per_year)}/year)</span>}
              </p>
              <TrendChart risk={risk} />
            </div>
          )}
          <div className="rounded-xl bg-amber-50 p-3 text-sm dark:bg-amber-500/10">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300"><Lightbulb className="h-3.5 w-3.5" /> Why nobody noticed</p>
            {risk.why_hidden}
          </div>
          <div className="rounded-xl bg-brand-50 p-3 text-sm dark:bg-brand-500/10">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand-800 dark:text-brand-300"><ArrowRight className="h-3.5 w-3.5" /> Next step</p>
            {risk.next_step}
          </div>
          <p className="flex gap-1.5 text-[11px] muted"><BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {risk.citation}{risk.notes ? ` · ${risk.notes}` : ""}</p>
          <ExplainButton kind="risk" id={risk.id} />
        </div>
      </div>
    </article>
  );
}

export default function Risks() {
  const { profile, lang } = useApp();
  const { data, error } = useFetch<Analysis>(profile ? `/profiles/${profile.id}/insights` : null);
  const [src, setSrc] = useState<{ report: number; result: number } | null>(null);
  useEffect(() => {
    if (data && location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: "smooth" });
  }, [data]);
  if (error) return <ErrorBox msg={error} />;
  if (!data) return <Spinner label="Running medical formulas across your reports…" />;
  const counts = { red: data.hidden_risks.filter((r) => r.status === "red").length, yellow: data.hidden_risks.filter((r) => r.status === "yellow").length };

  return (
    <div>
      <PageHeader
        icon={<Radar className="h-6 w-6" />}
        title="Hidden Disease Finder"
        subtitle="Each report checks numbers one at a time. Here, values from different labs, dates and reports are joined and run through published medical formulas to reveal risks that no single report shows."
      />
      <div className="mb-6 grid grid-cols-3 gap-3">
        {[["Need attention", counts.red, "red"], ["Watch", counts.yellow, "yellow"], ["Formulas run", data.hidden_risks.length, "green"]].map(([l, n, s]) => (
          <div key={l as string} className="card p-4 text-center">
            <p className={`text-3xl font-extrabold ${statusStyles[s as Status].text}`}>{n}</p>
            <p className="text-xs font-semibold muted">{l}</p>
          </div>
        ))}
      </div>

      {data.hidden_risks.length === 0 ? (
        <Empty icon={<Sigma className="h-7 w-7" />} title="Not enough data to combine yet" text="Upload a blood count (CBC), liver test (LFT), kidney test (KFT) and lipid profile, even from different labs and dates. The finder joins them automatically." />
      ) : (
        <div className="space-y-5">{data.hidden_risks.map((r) => <RiskCard key={r.id} risk={r} onSource={(report, result) => setSrc({ report, result })} />)}</div>
      )}

      {!!data.drifts.length && (
        <section className="mt-10">
          <h2 className="mb-1 flex items-center gap-2 text-xl font-extrabold"><TrendingDown className="h-5 w-5 text-amber-500" /> Your personal normal</h2>
          <p className="mb-4 text-sm muted">These values are inside the lab's normal range, but they have moved steadily in one direction for you. A trend model fits your history and estimates when the limit may be crossed.</p>
          <div className="grid gap-4 md:grid-cols-2">
            {data.drifts.map((d) => (
              <div key={d.code} className="card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold">{d.name}</p>
                    <p className="text-xs muted">{fmtNum(d.first)} → {fmtNum(d.latest)} {d.unit} · limit {d.limit}</p>
                  </div>
                  <span className={`chip ${d.months_to_limit !== null && d.months_to_limit <= 12 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>
                    {d.change_pct > 0 ? "+" : ""}{d.change_pct}%
                  </span>
                </div>
                <div className="my-3 h-28">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={d.points} margin={{ top: 6, right: 6, left: -22, bottom: 0 }}>
                      <XAxis dataKey="date" tickFormatter={(x) => fmtDate(x, { month: "short", year: "2-digit" })} tick={{ fontSize: 10 }} stroke="#94a3b8" />
                      <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" domain={["auto", "auto"]} />
                      <ReferenceLine y={d.limit} stroke="#ef4444" strokeDasharray="4 4" label={{ value: "limit", fontSize: 10, fill: "#ef4444", position: "insideTopRight" }} />
                      <Tooltip labelFormatter={(x) => fmtDate(x as string)} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                      <Line isAnimationActive={false} type="monotone" dataKey="value" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-sm">{d.message}</p>
                <div className="mt-3"><ExplainButton kind="drift" id={d.code} small /></div>
              </div>
            ))}
          </div>
        </section>
      )}

      {!!data.next_tests.length && (
        <section className="mt-10">
          <h2 className="mb-1 flex items-center gap-2 text-xl font-extrabold"><IndianRupee className="h-5 w-5 text-brand-600" /> Next Best Test</h2>
          <p className="mb-4 text-sm muted">The cheapest tests that unlock the most new insight, ranked by value for money. Prices are typical estimates.</p>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {data.next_tests.map((n, i) => (
              <div key={n.panel} className={`card p-5 ${i === 0 ? "ring-2 ring-brand-400" : ""}`}>
                {i === 0 && <span className="chip mb-2 bg-brand-600 text-white">Best value</span>}
                <p className="font-bold">{n.name}</p>
                <p className="text-2xl font-extrabold text-brand-700 dark:text-brand-300">~₹{n.price_inr}</p>
                <ul className="mt-3 space-y-1.5 text-xs">
                  {[...n.follow_ups, ...n.care_gaps, ...n.unlocks.map((u) => `Unlocks ${u}`)].map((x) => (
                    <li key={x} className="flex gap-1.5"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600" />{x}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
      <ReportDrawer reportId={src?.report ?? null} highlight={src?.result} onClose={() => setSrc(null)} />
      <Disclaimer text={`${t("notDoctor", lang)} Scores use published formulas and are screening tools, not a diagnosis.`} />
    </div>
  );
}
