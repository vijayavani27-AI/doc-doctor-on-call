import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Radar, Upload, FileText, TrendingDown, ShieldAlert, ClipboardCheck, IndianRupee, Activity, Phone, CalendarCheck, CheckCircle2, Circle, Users, Bell, Pill, Loader2 } from "lucide-react";
import { api } from "../lib/api";
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
  urgent?: Urgent | null;
  today?: { pending: number; slots: Slot[]; checkups: DueCheckup[] };
  family?: { pending_requests: number; i_can_view: number; can_view_me: number };
  needs_review?: number;
}
interface Urgent { level: string; message: string; reasons: string[]; call: { label: string; number: string }[] }
interface Slot { reminder_id: number; kind: string; title: string; detail: string | null; slot: string; time: string; done: boolean; overdue: boolean }
interface DueCheckup { id: number; title: string; kind: string; due_date: string | null; provider: string | null; status: "overdue" | "due_soon" | "planned" | "done"; is_demo?: boolean }

/** Prominent red banner for code-rule emergencies (from the API's `urgent`). */
function UrgentBanner({ u }: { u: Urgent }) {
  return (
    <section role="alert" className="card border-red-300 bg-red-50 p-5 text-red-800 animate-fade-up dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
      <p className="flex items-start gap-2 font-bold"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />{u.message}</p>
      {!!u.reasons.length && <ul className="ml-7 mt-1 list-disc space-y-0.5 text-sm">{u.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
      <div className="ml-7 mt-3 flex flex-wrap gap-2">
        {u.call.map((c) => (
          <a key={c.number} href={`tel:${c.number}`} className="btn bg-red-600 px-3 py-2 text-xs text-white hover:bg-red-700 animate-pulse-ring"><Phone className="h-3.5 w-3.5" /> {c.number} · {c.label}</a>
        ))}
      </div>
    </section>
  );
}

function TodayCard({ today, onChange }: { today: NonNullable<Dash["today"]>; onChange: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function markDone(s: Slot) {
    setBusy(`${s.reminder_id}|${s.slot}`);
    setErr(null);
    try {
      await api.post(`/reminders/${s.reminder_id}/done`, { slot: s.slot });
      onChange();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  const empty = !today.slots.length && !today.checkups.length;
  return (
    <section className="card p-5 md:col-span-2">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold"><Bell className="h-5 w-5 text-brand-600" /> Today</h2>
        <span className="flex items-center gap-2">
          {today.pending > 0 && <span className="chip bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">{today.pending} left</span>}
          <Link to="/app/care" className="text-xs font-bold text-brand-700 dark:text-brand-300">Care plan →</Link>
        </span>
      </div>
      {empty && <p className="text-sm muted">Nothing planned for today. Add medicine reminders and checkups in your <Link to="/app/care" className="font-semibold text-brand-700 dark:text-brand-300">care plan</Link>.</p>}
      {!!today.slots.length && (
        <div className="grid gap-2 sm:grid-cols-2">
          {today.slots.map((s) => {
            const key = `${s.reminder_id}|${s.slot}`;
            return (
              <button key={key} disabled={s.done || busy === key} onClick={() => markDone(s)} title={s.done ? "Done" : "Tap to mark as done"}
                className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${s.done ? "border-transparent bg-emerald-50 dark:bg-emerald-500/10" : "border-slate-100 hover:border-brand-300 hover:shadow-soft dark:border-white/5"}`}>
                {busy === key ? <Loader2 className="h-5 w-5 shrink-0 animate-spin text-brand-600" /> : s.done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /> : <Circle className={`h-5 w-5 shrink-0 ${s.overdue ? "text-amber-500" : "text-slate-300 dark:text-white/20"}`} />}
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-semibold ${s.done ? "line-through opacity-60" : ""}`}>{s.kind === "medicine" && <Pill className="mr-1 inline h-3.5 w-3.5 text-violet-600" />}{s.title}</p>
                  <p className="truncate text-xs muted">{s.detail || (s.done ? "Done" : "Tap when done")}</p>
                </div>
                <span className={`shrink-0 font-mono text-xs font-bold ${s.overdue && !s.done ? "text-amber-600 dark:text-amber-400" : "muted"}`}>{s.time}</span>
              </button>
            );
          })}
        </div>
      )}
      {!!today.checkups.length && (
        <div className={today.slots.length ? "mt-4 border-t border-slate-100 pt-4 dark:border-white/5" : ""}>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider muted"><CalendarCheck className="h-3.5 w-3.5" /> Checkups</p>
          {today.checkups.map((c) => (
            <Link key={c.id} to="/app/care" className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-white/5">
              <span className="min-w-0 truncate font-semibold">{c.title}{c.provider ? <span className="font-normal muted"> · {c.provider}</span> : null}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-xs muted">{fmtDate(c.due_date, { day: "numeric", month: "short" })}</span>
                {c.status === "overdue" ? <StatusChip status="red">Overdue</StatusChip> : <StatusChip status="yellow">Due soon</StatusChip>}
              </span>
            </Link>
          ))}
        </div>
      )}
      {err && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{err}</p>}
    </section>
  );
}

function FamilyCard({ f }: { f: NonNullable<Dash["family"]> }) {
  return (
    <section className="card flex flex-col p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold"><Users className="h-5 w-5 text-brand-600" /> Family</h2>
        <Link to="/app/family" className="text-xs font-bold text-brand-700 dark:text-brand-300">Open →</Link>
      </div>
      {f.pending_requests > 0 && (
        <Link to="/app/family" className="mb-3 flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-500/10">
          <Bell className="h-4 w-4 shrink-0 text-amber-600" /> <span><b>{f.pending_requests}</b> request{f.pending_requests > 1 ? "s" : ""} waiting for your approval</span> <ArrowRight className="ml-auto h-4 w-4 shrink-0" />
        </Link>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5"><p className="text-2xl font-extrabold text-ink dark:text-white">{f.i_can_view}</p><p className="text-xs muted">you can view</p></div>
        <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5"><p className="text-2xl font-extrabold text-ink dark:text-white">{f.can_view_me}</p><p className="text-xs muted">can view you</p></div>
      </div>
      <p className="mt-3 text-xs muted">Nothing is shared until you approve, and you can stop it anytime.</p>
    </section>
  );
}

export default function Dashboard() {
  const { profile, lang } = useApp();
  const { data, error, reload } = useFetch<Dash>(profile ? `/profiles/${profile.id}/dashboard` : null);
  if (error) return <ErrorBox msg={error} />;
  if (!data || !profile) return <Spinner />;
  const p = data.profile;
  const empty = p.counts.reports === 0;

  return (
    <div className="space-y-6">
      {data.urgent && <UrgentBanner u={data.urgent} />}
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

      {(data.today || data.family) && (
        <div className="grid gap-6 md:grid-cols-3">
          {data.today && <TodayCard today={data.today} onChange={reload} />}
          {data.family && <FamilyCard f={data.family} />}
        </div>
      )}

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
