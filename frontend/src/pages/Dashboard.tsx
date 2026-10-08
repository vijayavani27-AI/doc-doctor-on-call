import { Link } from "react-router-dom";
import { ArrowRight, Radar, Upload, FileText, TrendingDown, ShieldAlert, ClipboardCheck, IndianRupee, Activity } from "lucide-react";
import { useApp, useFetch } from "../lib/store";
import { t } from "../lib/i18n";
import { conditionLabels, fmtDate, fmtNum, statusStyles } from "../lib/format";
import type { Alert, Drift, NextTest, Profile, Report, Status } from "../lib/types";
import { Disclaimer, ErrorBox, LevelIcon, ScoreRing, Sparkline, Spinner, StatusChip } from "../components/ui";

interface Dash {
  profile: Profile;
  score: { value: number; label: string; explanation: string };
  actions: { level: "red" | "info" | "yellow"; title: string; text: string; link: string }[];
  alerts: Alert[];
  risks: { id: string; name: string; hidden_condition: string; status: Status; label: string; value: number; organ: string; reports_combined: number }[];
  drifts: Drift[];
  next_tests: NextTest[];
  metrics: { code: string; name: string; value: number; unit: string; flag: string; date: string; spark: number[]; display?: string; link?: string }[];
  recent_reports: Report[];
  pending_reviews: number;
}

export default function Dashboard() {
  const { profile, lang } = useApp();
  const { data, error } = useFetch<Dash>(profile ? `/profiles/${profile.id}/dashboard` : null);
  if (error) return <ErrorBox msg={error} />;
  if (!data || !profile) return <Spinner />;
  const p = data.profile;
  const empty = p.counts.reports === 0;

  return (
    <div className="space-y-6">
      {/* Hero card */}
      <section className="card relative overflow-hidden p-6 animate-fade-up sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-brand-100/70 blur-3xl dark:bg-brand-500/10" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
          <ScoreRing value={empty ? 100 : data.score.value} label="snapshot" />
          <div className="flex-1">
            <p className="text-sm font-semibold muted">{t("hello", lang)} 👋</p>
            <h1 className="h-page">{p.name}</h1>
            <p className="mt-1 text-sm muted">
              {[p.age && `${p.age} years`, p.sex === "F" ? "Female" : "Male", p.bmi && `BMI ${p.bmi}`].filter(Boolean).join(" · ")}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {p.conditions.map((c) => <span key={c} className="chip bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200">{conditionLabels[c] ?? c}</span>)}
              {!p.conditions.length && <Link to="/app/settings#family" className="chip bg-slate-100 text-slate-600 dark:bg-white/10">+ add conditions</Link>}
            </div>
            {!empty && <p className="mt-3 text-sm"><b className={data.score.value < 50 ? "text-red-600" : "text-brand-700 dark:text-brand-300"}>{data.score.label}.</b> <span className="muted">{data.score.explanation}</span></p>}
          </div>
          <div className="flex gap-2 sm:flex-col">
            <Link to="/app/upload" className="btn-primary"><Upload className="h-4 w-4" /> Add report</Link>
            <Link to="/app/doctor" className="btn-outline"><ClipboardCheck className="h-4 w-4" /> Doctor summary</Link>
          </div>
        </div>
      </section>

      {empty ? (
        <section className="card p-8 text-center">
          <FileText className="mx-auto h-10 w-10 text-brand-600" />
          <h2 className="mt-3 text-lg font-bold">Upload your first report</h2>
          <p className="mx-auto mt-1 max-w-md text-sm muted">Add lab reports and prescriptions (old ones too). The more history DOC has, the more it can find. No reports handy? Use the test kit (6 sample PDFs with an answer key).</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2"><Link to="/app/upload" className="btn-primary">Upload now <ArrowRight className="h-4 w-4" /></Link><Link to="/app/guide" className="btn-outline">How to test DOC</Link></div>
        </section>
      ) : (
        <>
          {data.pending_reviews > 0 && (
            <Link to="/app/records" className="card flex items-center gap-3 border-amber-300 bg-amber-50 p-4 text-sm dark:bg-amber-500/10">
              <ClipboardCheck className="h-5 w-5 text-amber-600" /> <b>{data.pending_reviews} report(s)</b> waiting for your confirmation. <ArrowRight className="ml-auto h-4 w-4" />
            </Link>
          )}

          {/* Top actions */}
          <section>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wider muted">{t("todo", lang)}</h2>
            <div className="grid gap-3 md:grid-cols-3">
              {data.actions.map((a, i) => (
                <Link to={`/app${a.link}`} key={i} className={`card group flex flex-col p-5 transition hover:-translate-y-0.5 hover:shadow-lift animate-fade-up`} style={{ animationDelay: `${i * 60}ms` }}>
                  <div className="flex items-center gap-2">
                    <span className={`grid h-8 w-8 place-items-center rounded-full text-sm font-extrabold ${a.level === "red" ? "bg-red-100 text-red-700 dark:bg-red-500/15" : "bg-sky-100 text-sky-700 dark:bg-sky-500/15"}`}>{i + 1}</span>
                    <LevelIcon level={a.level} className="h-4 w-4" />
                  </div>
                  <p className="mt-3 font-bold leading-snug text-ink dark:text-white">{a.title}</p>
                  <p className="mt-1 flex-1 text-sm muted">{a.text}</p>
                  <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-brand-700 dark:text-brand-300">Open <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" /></span>
                </Link>
              ))}
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Hidden risks */}
            <section className="card p-5 lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="flex items-center gap-2 font-bold"><Radar className="h-5 w-5 text-brand-600" /> Hidden Disease Finder</h2>
                <Link to="/app/risks" className="text-xs font-bold text-brand-700 dark:text-brand-300">See all →</Link>
              </div>
              {data.risks.length === 0 ? <p className="text-sm muted">Not enough combined data yet. Add a blood count, liver and kidney test.</p> : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {data.risks.map((r) => (
                    <Link to={`/app/risks#${r.id}`} key={r.id} className={`flex items-center gap-3 rounded-xl border p-3 transition hover:shadow-soft ${statusStyles[r.status].soft} border-transparent`}>
                      <div className={`h-10 w-1.5 rounded-full ${statusStyles[r.status].dot}`} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">{r.hidden_condition}</p>
                        <p className="text-xs muted">{r.name}: <b className={statusStyles[r.status].text}>{fmtNum(r.value)}</b>{r.reports_combined > 1 ? ` · joined ${r.reports_combined} reports` : ""}</p>
                      </div>
                      <StatusChip status={r.status}>{r.label.length > 18 ? r.label.split(" (")[0] : r.label}</StatusChip>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {/* Next best test */}
            <section className="card p-5">
              <h2 className="mb-4 flex items-center gap-2 font-bold"><IndianRupee className="h-5 w-5 text-brand-600" /> Next best test</h2>
              {data.next_tests.slice(0, 3).map((n, i) => (
                <div key={n.panel} className="mb-3 rounded-xl border border-slate-100 p-3 last:mb-0 dark:border-white/5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold">{i === 0 && "⭐ "}{n.name}</p>
                    <span className="chip bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200">~₹{n.price_inr}</span>
                  </div>
                  <p className="mt-1 text-xs muted">{[...n.follow_ups, ...n.care_gaps, ...n.unlocks.map((u) => `unlocks ${u}`)].join(" · ")}</p>
                </div>
              ))}
              {!data.next_tests.length && <p className="text-sm muted">You're up to date.</p>}
            </section>
          </div>

          {/* Metrics */}
          {!!data.metrics.length && (
            <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
              {data.metrics.map((m) => (
                <Link to={`/app${m.link ?? "/timeline"}`} key={m.code} className="card p-4 transition hover:shadow-lift">
                  <p className="text-xs font-semibold muted">{m.name}</p>
                  <div className="mt-1 flex items-end justify-between gap-2">
                    <p className="text-2xl font-extrabold text-ink dark:text-white">{m.display ?? fmtNum(m.value, 1)}<span className="ml-1 text-xs font-medium muted">{m.unit}</span></p>
                    <Sparkline values={m.spark} color={m.flag === "N" ? "#10b981" : "#ef4444"} />
                  </div>
                  <p className="mt-1 text-[11px] muted">{fmtDate(m.date)}</p>
                </Link>
              ))}
            </section>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Alerts */}
            <section className="card p-5">
              <h2 className="mb-4 flex items-center gap-2 font-bold"><ShieldAlert className="h-5 w-5 text-red-500" /> Alerts</h2>
              <div className="space-y-3">
                {data.alerts.map((a) => (
                  <div key={a.id} className="flex gap-3">
                    <LevelIcon level={a.level} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{a.title}</p>
                      <p className="line-clamp-2 text-xs muted">{a.text}</p>
                    </div>
                  </div>
                ))}
                {!data.alerts.length && <p className="text-sm muted">No alerts.</p>}
              </div>
              <Link to="/app/medicines" className="mt-4 inline-block text-xs font-bold text-brand-700 dark:text-brand-300">Medicine checks →</Link>
            </section>

            {/* Silent trends + recent */}
            <section className="card p-5">
              <h2 className="mb-4 flex items-center gap-2 font-bold"><TrendingDown className="h-5 w-5 text-amber-500" /> Silent trends</h2>
              {data.drifts.map((d) => (
                <div key={d.code} className="mb-3 flex items-center gap-3">
                  <Sparkline values={d.points.map((p) => p.value)} color="#f59e0b" w={72} />
                  <p className="text-xs"><b>{d.name}</b> <span className="muted">{d.change_pct > 0 ? "+" : ""}{d.change_pct}% since {fmtDate(d.first_date, { month: "short", year: "numeric" })}, still “normal”</span></p>
                </div>
              ))}
              {!data.drifts.length && <p className="text-sm muted">No silent drifts detected.</p>}
              <h3 className="mb-2 mt-5 flex items-center gap-2 text-sm font-bold"><Activity className="h-4 w-4 text-brand-600" /> Recent reports</h3>
              {data.recent_reports.map((r) => (
                <Link key={r.id} to={`/app/records/${r.id}`} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-white/5">
                  <span className="truncate">{r.lab_name || r.filename}</span><span className="shrink-0 text-xs muted">{fmtDate(r.report_date)}</span>
                </Link>
              ))}
            </section>
          </div>
        </>
      )}
      <Disclaimer text={t("notDoctor", lang)} />
    </div>
  );
}
