import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { CalendarCheck, Bell, BellRing, BellOff, Plus, Trash2, Pencil, CheckCircle2, Circle, Pill, FlaskConical, Stethoscope, Eye, Syringe, Smile, ScanSearch, ClipboardList, Activity, GlassWater, Sparkles, X, Clock, Repeat, IndianRupee } from "lucide-react";
import { api } from "../lib/api";
import { useApp, useFetch } from "../lib/store";
import { fmtDate } from "../lib/format";
import { Disclaimer, Empty, ErrorBox, Modal, PageHeader, Spinner, StatusChip } from "../components/ui";
import { t } from "../lib/i18n";

type CheckStatus = "overdue" | "due_soon" | "planned" | "done";
type CheckKind = "lab" | "doctor" | "screening" | "dental" | "eye" | "vaccine" | "other";
type RemKind = "medicine" | "checkup" | "reading" | "water" | "custom";

interface Checkup {
  id: number; title: string; kind: CheckKind; due_date: string | null; done_date: string | null; repeat_months: number | null;
  provider: string | null; notes: string | null; status: CheckStatus; is_demo: boolean;
}
interface CheckupSuggestion { title: string; kind: CheckKind; why: string; price_inr: number | null }
interface CheckupList { items: Checkup[]; suggestions: CheckupSuggestion[] }
interface Slot { slot: string; time: string; done: boolean }
interface Reminder {
  id: number; kind: RemKind; title: string; detail: string | null; times: string[]; days: number[]; start_date: string | null; end_date: string | null;
  active: boolean; medication_id: number | null; today: Slot[]; is_demo: boolean;
}
interface ReminderSuggestion { kind: RemKind; title: string; detail: string | null; times: string[]; medication_id: number }
interface ReminderList { items: Reminder[]; suggestions: ReminderSuggestion[] }

const CHECK_KINDS: Record<CheckKind, { label: string; icon: typeof Pill; tone: string }> = {
  lab: { label: "Lab test", icon: FlaskConical, tone: "bg-sky-50 text-sky-600 dark:bg-sky-500/10" },
  doctor: { label: "Doctor visit", icon: Stethoscope, tone: "bg-brand-50 text-brand-600 dark:bg-brand-500/10" },
  screening: { label: "Screening", icon: ScanSearch, tone: "bg-violet-50 text-violet-600 dark:bg-violet-500/10" },
  dental: { label: "Dental", icon: Smile, tone: "bg-amber-50 text-amber-600 dark:bg-amber-500/10" },
  eye: { label: "Eye", icon: Eye, tone: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10" },
  vaccine: { label: "Vaccine", icon: Syringe, tone: "bg-rose-50 text-rose-600 dark:bg-rose-500/10" },
  other: { label: "Other", icon: ClipboardList, tone: "bg-slate-100 text-slate-600 dark:bg-white/10" },
};
const REM_KINDS: Record<RemKind, { label: string; icon: typeof Pill; tone: string }> = {
  medicine: { label: "Medicine", icon: Pill, tone: "bg-violet-50 text-violet-600 dark:bg-violet-500/10" },
  checkup: { label: "Checkup", icon: CalendarCheck, tone: "bg-brand-50 text-brand-600 dark:bg-brand-500/10" },
  reading: { label: "Reading", icon: Activity, tone: "bg-rose-50 text-rose-600 dark:bg-rose-500/10" },
  water: { label: "Water", icon: GlassWater, tone: "bg-sky-50 text-sky-600 dark:bg-sky-500/10" },
  custom: { label: "Other", icon: Bell, tone: "bg-slate-100 text-slate-600 dark:bg-white/10" },
};
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const NEUTRAL_CHIP = "chip bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200";

function CheckChip({ s }: { s: CheckStatus }) {
  if (s === "overdue") return <StatusChip status="red">Overdue</StatusChip>;
  if (s === "due_soon") return <StatusChip status="yellow">Due soon</StatusChip>;
  if (s === "done") return <StatusChip status="green">Done</StatusChip>;
  return <span className={NEUTRAL_CHIP}><span className="h-1.5 w-1.5 rounded-full bg-slate-400" />Planned</span>;
}

function isoIn(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Days toggle: an empty list means every day. */
function toggleDay(days: number[], d: number): number[] {
  const cur = days.length ? days : [0, 1, 2, 3, 4, 5, 6];
  const next = cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort();
  return next.length === 7 ? [] : next;
}

function DayToggles({ days, onChange, disabled }: { days: number[]; onChange: (d: number[]) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {DAYS.map((l, i) => {
        const on = !days.length || days.includes(i);
        return (
          <button type="button" key={l} disabled={disabled || (on && days.length === 1)} onClick={() => onChange(toggleDay(days, i))} aria-pressed={on}
            className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition disabled:cursor-default ${on ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-400"}`}>
            {l}
          </button>
        );
      })}
      <span className="ml-1 text-[11px] muted">{days.length ? `${days.length} day${days.length > 1 ? "s" : ""} a week` : "Every day"}</span>
    </div>
  );
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} title={label} onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${on ? "bg-brand-600" : "bg-slate-300 dark:bg-white/15"}`}>
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${on ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}

// ---------------------------------------------------------------- checkups
const emptyCheck = { title: "", kind: "lab" as CheckKind, due_date: isoIn(14), repeat_months: "", provider: "", notes: "" };

function Checkups({ pid }: { pid: number }) {
  const { data, error, reload, setData } = useFetch<CheckupList>(`/profiles/${pid}/checkups`);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Checkup | null>(null);
  const [form, setForm] = useState(emptyCheck);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  function startAdd() { setEditing(null); setForm({ ...emptyCheck, due_date: isoIn(14) }); setErr(null); setOpen(true); }
  function startEdit(c: Checkup) {
    setEditing(c);
    setForm({ title: c.title, kind: c.kind, due_date: c.due_date ?? "", repeat_months: c.repeat_months ? String(c.repeat_months) : "", provider: c.provider ?? "", notes: c.notes ?? "" });
    setErr(null);
    setOpen(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    const body = { title: form.title.trim(), kind: form.kind, due_date: form.due_date || null, repeat_months: form.repeat_months ? Number(form.repeat_months) : null, provider: form.provider.trim() || null, notes: form.notes.trim() || null };
    try {
      if (editing) await api.patch(`/checkups/${editing.id}`, body);
      else await api.post(`/profiles/${pid}/checkups`, body);
      setOpen(false);
      reload();
    } catch (x) { setErr((x as Error).message); }
  }

  async function act(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try { await fn(); } catch (x) { setNote((x as Error).message); } finally { setBusy(null); }
  }

  const markDone = (c: Checkup) => act(`done-${c.id}`, async () => {
    const r = await api.post<{ done: Checkup; next: Checkup | null }>(`/checkups/${c.id}/done`);
    setNote(r.next ? `Marked “${c.title}” as done. The next one is planned for ${fmtDate(r.next.due_date)}.` : `Marked “${c.title}” as done.`);
    reload();
  });
  const remove = (c: Checkup) => act(`del-${c.id}`, async () => {
    if (!confirm(`Delete “${c.title}”?`)) return;
    await api.del(`/checkups/${c.id}`);
    if (data) setData({ ...data, items: data.items.filter((x) => x.id !== c.id) });
  });
  const addSuggestion = (s: CheckupSuggestion) => act(`sug-${s.title}`, async () => {
    await api.post(`/profiles/${pid}/checkups`, { title: s.title, kind: s.kind, due_date: isoIn(14), repeat_months: null, provider: null, notes: s.why });
    setNote(`Added “${s.title}”, due in 2 weeks. You can change the date.`);
    reload();
  });

  const open_ = data?.items.filter((c) => c.status !== "done") ?? [];
  const done = data?.items.filter((c) => c.status === "done") ?? [];

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wider muted">Checkups</h2>
        <button className="btn-outline py-2 text-xs" onClick={startAdd}><Plus className="h-4 w-4" /> Add checkup</button>
      </div>
      {note && (
        <p className="mb-3 flex items-start gap-2 rounded-xl bg-brand-50 p-3 text-sm dark:bg-brand-500/10">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" /><span className="flex-1">{note}</span>
          <button className="btn-ghost -m-1 p-1" onClick={() => setNote(null)} aria-label="Dismiss"><X className="h-3.5 w-3.5" /></button>
        </p>
      )}
      {error ? <ErrorBox msg={error} /> : !data ? <div className="card"><Spinner /></div> : (
        <>
          {open_.length === 0 && done.length === 0 ? (
            <Empty icon={<CalendarCheck className="h-7 w-7" />} title="No checkups planned" text="Add your next blood test, doctor visit or eye check, or pick one of the suggestions below." action={<button className="btn-primary" onClick={startAdd}><Plus className="h-4 w-4" /> Add checkup</button>} />
          ) : (
            <div className="space-y-3">
              {open_.map((c) => {
                const K = CHECK_KINDS[c.kind] ?? CHECK_KINDS.other;
                return (
                  <div key={c.id} className={`card p-4 ${c.status === "overdue" ? "border-red-200 dark:border-red-500/30" : ""}`}>
                    <div className="flex items-start gap-3">
                      <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${K.tone}`}><K.icon className="h-5 w-5" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-bold">{c.title}</p>
                          <CheckChip s={c.status} />
                        </div>
                        <p className="mt-0.5 text-xs muted">
                          {K.label} · {c.due_date ? `due ${fmtDate(c.due_date)}` : "no date set"}
                          {c.repeat_months ? <span className="ml-1 inline-flex items-center gap-0.5"><Repeat className="h-3 w-3" /> every {c.repeat_months} month{c.repeat_months > 1 ? "s" : ""}</span> : null}
                          {c.provider ? ` · ${c.provider}` : ""}
                        </p>
                        {c.notes && <p className="mt-1 text-xs muted">{c.notes}</p>}
                      </div>
                      <div className="flex shrink-0">
                        <button className="btn-ghost p-2" title="Edit" aria-label="Edit" onClick={() => startEdit(c)}><Pencil className="h-4 w-4" /></button>
                        <button className="btn-ghost p-2 hover:text-red-600" title="Delete" aria-label="Delete" disabled={busy === `del-${c.id}`} onClick={() => remove(c)}><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <button className="btn-outline py-1.5 text-xs" disabled={busy === `done-${c.id}`} onClick={() => markDone(c)}><CheckCircle2 className="h-4 w-4" /> Mark done</button>
                    </div>
                  </div>
                );
              })}
              {!!done.length && (
                <details className="card p-4">
                  <summary className="cursor-pointer text-sm font-semibold">Done ({done.length})</summary>
                  <div className="mt-2 divide-y divide-slate-100 dark:divide-white/5">
                    {done.map((c) => (
                      <div key={c.id} className="flex items-center gap-3 py-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                        <span className="min-w-0 flex-1 truncate">{c.title}</span>
                        <span className="text-xs muted">{fmtDate(c.done_date)}</span>
                        <button className="btn-ghost p-1.5 hover:text-red-600" aria-label="Delete" onClick={() => remove(c)}><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}

          {!!data.suggestions.length && (
            <div className="mt-5">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider muted"><Sparkles className="h-3.5 w-3.5 text-brand-600" /> Worth discussing with your doctor</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {data.suggestions.map((s) => {
                  const K = CHECK_KINDS[s.kind] ?? CHECK_KINDS.other;
                  return (
                    <div key={s.title} className="card flex flex-col p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className={`grid h-8 w-8 place-items-center rounded-xl ${K.tone}`}><K.icon className="h-4 w-4" /></div>
                          <p className="text-sm font-bold">{s.title}</p>
                        </div>
                        {s.price_inr ? <span className="chip bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"><IndianRupee className="h-3 w-3" />~₹{s.price_inr}</span> : null}
                      </div>
                      <p className="mt-2 flex-1 text-xs muted">{s.why}</p>
                      <button className="btn-outline mt-3 py-1.5 text-xs" disabled={busy === `sug-${s.title}`} onClick={() => addSuggestion(s)}><Plus className="h-4 w-4" /> Add</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit checkup" : "Add a checkup"}>
        <form onSubmit={save} className="space-y-3">
          <div><label className="label">What</label><input className="input" required maxLength={160} placeholder="e.g. HbA1c blood test" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Type</label>
              <select className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as CheckKind })}>
                {(Object.keys(CHECK_KINDS) as CheckKind[]).map((k) => <option key={k} value={k}>{CHECK_KINDS[k].label}</option>)}
              </select></div>
            <div><label className="label">Due on</label><input type="date" className="input" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Repeat every (months)</label><input type="number" min={1} max={60} className="input" placeholder="e.g. 3" value={form.repeat_months} onChange={(e) => setForm({ ...form, repeat_months: e.target.value })} /></div>
            <div><label className="label">Where / doctor</label><input className="input" maxLength={160} placeholder="Optional" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} /></div>
          </div>
          <div><label className="label">Notes</label><textarea className="input" rows={2} maxLength={1000} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button className="btn-primary w-full">{editing ? "Save changes" : "Add checkup"}</button>
        </form>
      </Modal>
    </section>
  );
}

// ---------------------------------------------------------------- reminders
const emptyRem = { kind: "medicine" as RemKind, title: "", detail: "", times: ["08:00"], days: [] as number[] };

function Reminders({ list, error, reload, setList, pid }: { list: ReminderList | null; error: string | null; reload: () => void; setList: (l: ReminderList) => void; pid: number }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyRem);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const replace = (r: Reminder) => list && setList({ ...list, items: list.items.map((x) => (x.id === r.id ? r : x)) });
  async function patch(r: Reminder, body: Partial<Pick<Reminder, "active" | "days" | "times">>) {
    try { replace(await api.patch<Reminder>(`/reminders/${r.id}`, body)); } catch (x) { setNote((x as Error).message); }
  }
  async function remove(r: Reminder) {
    if (!confirm(`Delete reminder “${r.title}”?`)) return;
    try {
      await api.del(`/reminders/${r.id}`);
      reload();
    } catch (x) { setNote((x as Error).message); }
  }
  async function addSuggestion(s: ReminderSuggestion) {
    try {
      await api.post(`/profiles/${pid}/reminders`, { ...s, days: [] });
      setNote(`Reminder added: ${s.title} at ${s.times.join(", ")}.`);
      reload();
    } catch (x) { setNote((x as Error).message); }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    const times = [...new Set(form.times.filter(Boolean))].sort();
    if (!times.length) return setErr("Add at least one time.");
    try {
      await api.post(`/profiles/${pid}/reminders`, { kind: form.kind, title: form.title.trim(), detail: form.detail.trim() || null, times, days: form.days });
      setOpen(false);
      setForm(emptyRem);
      reload();
    } catch (x) { setErr((x as Error).message); }
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wider muted">Reminders</h2>
        <button className="btn-outline py-2 text-xs" onClick={() => { setForm(emptyRem); setErr(null); setOpen(true); }}><Plus className="h-4 w-4" /> Add reminder</button>
      </div>
      {note && (
        <p className="mb-3 flex items-start gap-2 rounded-xl bg-brand-50 p-3 text-sm dark:bg-brand-500/10">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" /><span className="flex-1">{note}</span>
          <button className="btn-ghost -m-1 p-1" onClick={() => setNote(null)} aria-label="Dismiss"><X className="h-3.5 w-3.5" /></button>
        </p>
      )}
      {error ? <ErrorBox msg={error} /> : !list ? <div className="card"><Spinner /></div> : (
        <>
          {list.items.length === 0 ? (
            <Empty icon={<Bell className="h-7 w-7" />} title="No reminders yet" text="Set reminders for medicines, home BP or sugar checks, or drinking water." />
          ) : (
            <div className="space-y-3">
              {list.items.map((r) => {
                const K = REM_KINDS[r.kind] ?? REM_KINDS.custom;
                return (
                  <div key={r.id} className={`card p-4 transition ${r.active ? "" : "opacity-60"}`}>
                    <div className="flex items-start gap-3">
                      <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${K.tone}`}><K.icon className="h-5 w-5" /></div>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold">{r.title}</p>
                        <p className="text-xs muted">{K.label}{r.detail ? ` · ${r.detail}` : ""}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {r.times.map((tm) => <span key={tm} className={NEUTRAL_CHIP}><Clock className="h-3 w-3" />{tm}</span>)}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Switch on={r.active} label={r.active ? "Reminder on" : "Reminder off"} onChange={(v) => patch(r, { active: v })} />
                        <button className="btn-ghost p-2 hover:text-red-600" title="Delete" aria-label="Delete" onClick={() => remove(r)}><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </div>
                    <div className="mt-3"><DayToggles days={r.days} disabled={!r.active} onChange={(d) => patch(r, { days: d })} /></div>
                  </div>
                );
              })}
            </div>
          )}

          {!!list.suggestions.length && (
            <div className="mt-5">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider muted"><Sparkles className="h-3.5 w-3.5 text-brand-600" /> From your active medicines</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {list.suggestions.map((s) => (
                  <div key={s.medication_id} className="card flex items-center gap-3 p-4">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-500/10"><Pill className="h-4 w-4" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{s.title}</p>
                      <p className="truncate text-xs muted">{s.times.join(", ")}{s.detail ? ` · ${s.detail}` : ""}</p>
                    </div>
                    <button className="btn-outline shrink-0 px-3 py-1.5 text-xs" onClick={() => addSuggestion(s)}><Plus className="h-4 w-4" /> Add</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Add a reminder">
        <form onSubmit={save} className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(REM_KINDS) as RemKind[]).map((k) => {
              const K = REM_KINDS[k];
              return <button type="button" key={k} onClick={() => setForm({ ...form, kind: k })} className={`chip px-3 py-2 ${form.kind === k ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200"}`}><K.icon className="h-3.5 w-3.5" /> {K.label}</button>;
            })}
          </div>
          <div><label className="label">Title</label><input className="input" required maxLength={160} placeholder={form.kind === "water" ? "Drink a glass of water" : form.kind === "reading" ? "Check BP" : "e.g. Take Glycomet 500"} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div><label className="label">Detail</label><input className="input" maxLength={300} placeholder="Optional, e.g. after breakfast" value={form.detail} onChange={(e) => setForm({ ...form, detail: e.target.value })} /></div>
          <div>
            <label className="label">Times</label>
            <div className="flex flex-wrap gap-2">
              {form.times.map((tm, i) => (
                <div key={i} className="flex items-center gap-1">
                  <input type="time" className="input w-32" value={tm} required onChange={(e) => setForm({ ...form, times: form.times.map((x, j) => (j === i ? e.target.value : x)) })} />
                  {form.times.length > 1 && <button type="button" className="btn-ghost p-1.5" aria-label="Remove time" onClick={() => setForm({ ...form, times: form.times.filter((_, j) => j !== i) })}><X className="h-4 w-4" /></button>}
                </div>
              ))}
              {form.times.length < 8 && <button type="button" className="btn-ghost text-xs" onClick={() => setForm({ ...form, times: [...form.times, "20:00"] })}><Plus className="h-4 w-4" /> Add time</button>}
            </div>
          </div>
          <div><label className="label">Days</label><DayToggles days={form.days} onChange={(d) => setForm({ ...form, days: d })} /></div>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button className="btn-primary w-full">Save reminder</button>
        </form>
      </Modal>
    </section>
  );
}

// ---------------------------------------------------------------- today + notifications
interface TodaySlot extends Slot { reminder: Reminder }

function useSlotNotifications(slots: TodaySlot[], enabled: boolean) {
  const timers = useRef<number[]>([]);
  useEffect(() => {
    timers.current.forEach((id) => clearTimeout(id));
    timers.current = [];
    if (!enabled || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const now = new Date();
    for (const s of slots) {
      if (s.done) continue;
      const [h, m] = s.time.split(":").map(Number);
      const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
      const delay = at.getTime() - now.getTime();
      if (delay <= 0 || delay > 24 * 3600 * 1000) continue;
      timers.current.push(window.setTimeout(() => {
        try { new Notification(s.reminder.title, { body: s.reminder.detail ?? `Reminder for ${s.time}`, icon: "/icon.svg", tag: s.slot }); } catch { /* not supported on this browser without a service worker */ }
      }, delay));
    }
    return () => { timers.current.forEach((id) => clearTimeout(id)); timers.current = []; };
  }, [slots, enabled]);
}

export default function CarePlan() {
  const { profile, lang } = useApp();
  const pid = profile?.id ?? null;
  const rem = useFetch<ReminderList>(pid ? `/profiles/${pid}/reminders` : null);
  const [tab, setTab] = useState<"checkups" | "reminders">("checkups");
  const supported = typeof Notification !== "undefined";
  const [notif, setNotif] = useState<boolean>(() => supported && Notification.permission === "granted");
  const [notifMsg, setNotifMsg] = useState<string | null>(null);
  const [marking, setMarking] = useState<string | null>(null);

  const slots = useMemo<TodaySlot[]>(() => (rem.data?.items ?? []).flatMap((r) => r.today.map((s) => ({ ...s, reminder: r }))).sort((a, b) => a.time.localeCompare(b.time)), [rem.data]);
  useSlotNotifications(slots, notif);

  async function enableNotifications() {
    if (!supported) return setNotifMsg("This browser does not support notifications.");
    if (notif) { setNotif(false); return setNotifMsg("Notifications paused for this page."); }
    const p = await Notification.requestPermission();
    if (p === "granted") { setNotif(true); setNotifMsg("Notifications are on. You will be reminded at each time today while this page is open."); }
    else setNotifMsg("Notifications were blocked. You can allow them in your browser's site settings.");
  }

  async function markSlot(s: TodaySlot) {
    if (s.done || !rem.data) return;
    setMarking(s.slot);
    try {
      const r = await api.post<Reminder>(`/reminders/${s.reminder.id}/done`, { slot: s.slot });
      rem.setData({ ...rem.data, items: rem.data.items.map((x) => (x.id === r.id ? r : x)) });
    } catch { /* keep as is */ } finally { setMarking(null); }
  }

  if (!profile || !pid) return <Spinner />;
  const nowHM = new Date().toTimeString().slice(0, 5);
  const pending = slots.filter((s) => !s.done).length;

  return (
    <div>
      <PageHeader icon={<CalendarCheck className="h-6 w-6" />} title="Care plan" subtitle="Upcoming checkups and daily reminders for medicines, readings and water, so nothing slips through."
        right={<button className="btn-outline" onClick={enableNotifications}>{notif ? <BellOff className="h-4 w-4" /> : <BellRing className="h-4 w-4" />} {notif ? "Pause notifications" : "Turn on notifications"}</button>} />
      {notifMsg && <p className="mb-4 flex items-center gap-2 rounded-xl bg-brand-50 p-3 text-sm dark:bg-brand-500/10"><Bell className="h-4 w-4 text-brand-600" />{notifMsg}</p>}

      <section className="card mb-6 p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-bold">Today</h2>
          {!!slots.length && <span className={`chip ${pending ? "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"}`}>{pending ? `${pending} left` : "All done"}</span>}
        </div>
        {!rem.data ? <p className="text-sm muted">Loading…</p> : slots.length === 0 ? (
          <p className="text-sm muted">Nothing scheduled for today.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {slots.map((s) => {
              const K = REM_KINDS[s.reminder.kind] ?? REM_KINDS.custom;
              const late = !s.done && s.time < nowHM;
              return (
                <button key={s.slot + s.reminder.id} onClick={() => markSlot(s)} disabled={s.done || marking === s.slot} title={s.done ? "Done" : "Tap to mark done"}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition ${s.done ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200" : late ? "border-amber-300 bg-amber-50 hover:border-amber-400 dark:border-amber-500/30 dark:bg-amber-500/10" : "border-slate-200 hover:border-brand-400 hover:shadow-soft dark:border-white/10"}`}>
                  {s.done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <Circle className="h-4 w-4 shrink-0 text-slate-400" />}
                  <span className="font-mono text-xs font-bold">{s.time}</span>
                  <K.icon className="h-3.5 w-3.5 shrink-0 muted" />
                  <span className={`max-w-[12rem] truncate font-semibold ${s.done ? "line-through opacity-70" : ""}`}>{s.reminder.title}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 lg:hidden dark:bg-white/5">
        {(["checkups", "reminders"] as const).map((k) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-lg py-2 text-sm font-semibold transition ${tab === k ? "bg-white shadow-soft dark:bg-white/10" : "muted"}`}>
            {k === "checkups" ? "Checkups" : "Reminders"}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className={tab === "checkups" ? "" : "hidden lg:block"}><Checkups key={pid} pid={pid} /></div>
        <div className={tab === "reminders" ? "" : "hidden lg:block"}>
          <Reminders key={pid} pid={pid} list={rem.data} error={rem.error} reload={rem.reload} setList={rem.setData} />
        </div>
      </div>

      <Disclaimer text={`${t("notDoctor", lang)} Suggested checkups are worth discussing with your doctor; they are not a prescription. Never stop or change a medicine without talking to your doctor.`} />
    </div>
  );
}
