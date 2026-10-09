import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bandage, Camera, ImageIcon, Phone, Loader2, Sun, Trash2, GitCompare, CheckCircle2, AlertTriangle, ShieldAlert, Info, Stethoscope, Siren } from "lucide-react";
import { api } from "../lib/api";
import { useApp, useFetch } from "../lib/store";
import { fmtDate } from "../lib/format";
import { Disclaimer, Empty, ErrorBox, Modal, PageHeader, Spinner } from "../components/ui";

type UrgencyLevel = "emergency" | "today" | "soon" | "home";
interface Metrics { red_pct: number; yellow_pct: number; dark_pct: number; wound_pct: number; redness_ring_pct: number; redness_spread: number; brightness: number; quality: "ok" | "too_dark" | "too_bright"; size?: number[] }
interface WoundResult {
  level: UrgencyLevel; rank: number; title: string; action: string; reasons: string[]; photo_note: string | null;
  warning_signs: string[]; home_care: string[]; call: { label: string; number: string }[]; disclaimer: string;
}
interface Compare { size_change_pct: number | null; red_change: number; yellow_change: number; dark_change: number; edge_redness_change: number; verdict: string; note: string }
interface Scan {
  id: number; label: string; created_at: string; metrics: Metrics; answers: Record<string, boolean | number>; result: WoundResult; has_photo: boolean; is_demo: boolean;
  compare?: Compare & { previous_id: number; previous_at: string };
}
interface CompareOut extends Compare { from: Scan; to: Scan }

const QUESTIONS: [string, string][] = [
  ["bleeding_wont_stop", "Bleeding that won't stop after 10 minutes of firm pressure"],
  ["fever", "Fever or chills"],
  ["spreading_redness", "Redness or swelling is spreading"],
  ["pus", "Pus or thick yellow-green fluid"],
  ["bad_smell", "A bad smell from the wound"],
  ["increasing_pain", "Pain is getting worse"],
  ["numbness", "Numbness around the wound"],
  ["deep_or_gaping", "Deep, or the edges gape open"],
  ["animal_bite", "Caused by an animal bite or scratch"],
];
const SITES = ["foot", "leg", "hand", "arm", "other"];

const URGENCY: Record<UrgencyLevel, { box: string; icon: typeof Siren; iconCls: string; chip: string; short: string }> = {
  emergency: { box: "border-red-300 bg-red-50 dark:border-red-500/40 dark:bg-red-500/10", icon: Siren, iconCls: "bg-red-600 text-white", chip: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300", short: "Emergency" },
  today: { box: "border-orange-300 bg-orange-50 dark:border-orange-500/40 dark:bg-orange-500/10", icon: ShieldAlert, iconCls: "bg-orange-500 text-white", chip: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300", short: "Doctor today" },
  soon: { box: "border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10", icon: Stethoscope, iconCls: "bg-amber-500 text-white", chip: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300", short: "Doctor soon" },
  home: { box: "border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10", icon: CheckCircle2, iconCls: "bg-emerald-500 text-white", chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300", short: "Home care" },
};

const METRIC_BARS: { key: keyof Metrics; label: string; hint: string; color: string }[] = [
  { key: "red_pct", label: "Redness", hint: "red or pink areas in the centre of the photo", color: "bg-red-500" },
  { key: "yellow_pct", label: "Yellow areas", hint: "can be slough or pus", color: "bg-amber-400" },
  { key: "dark_pct", label: "Dark areas", hint: "scab, dried blood or dark tissue", color: "bg-slate-700 dark:bg-slate-300" },
  { key: "wound_pct", label: "Wound area", hint: "rough size in the centre of the photo", color: "bg-brand-600" },
];

function signed(v: number | null | undefined, unit = "") {
  if (v === null || v === undefined) return "-";
  return `${v > 0 ? "+" : ""}${v}${unit}`;
}

function MetricBars({ m }: { m: Metrics }) {
  return (
    <div className="space-y-3">
      {METRIC_BARS.map((b) => {
        const v = Number(m[b.key] ?? 0);
        return (
          <div key={b.key}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
              <span><b>{b.label}</b> <span className="text-xs muted">· {b.hint}</span></span>
              <span className="font-bold">{v}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
              <div className={`h-full rounded-full ${b.color}`} style={{ width: `${Math.min(100, Math.max(0, v))}%` }} />
            </div>
          </div>
        );
      })}
      {m.quality !== "ok" && <p className="text-xs text-amber-700 dark:text-amber-300">Photo looks {m.quality === "too_dark" ? "too dark" : "too bright"}; numbers may be off.</p>}
    </div>
  );
}

function CallButtons() {
  return (
    <div className="flex flex-wrap gap-2">
      <a href="tel:108" className="btn bg-red-600 text-white hover:bg-red-700"><Phone className="h-4 w-4" /> Call 108 (Ambulance)</a>
      <a href="tel:112" className="btn bg-red-600 text-white hover:bg-red-700"><Phone className="h-4 w-4" /> Call 112 (Emergency)</a>
    </div>
  );
}

function CompareView({ c }: { c: Compare }) {
  const rows: [string, string][] = [
    ["Wound area", c.size_change_pct === null ? "-" : signed(c.size_change_pct, "%")],
    ["Redness", signed(c.red_change, " pts")],
    ["Yellow areas", signed(c.yellow_change, " pts")],
    ["Dark areas", signed(c.dark_change, " pts")],
    ["Redness at the edges", signed(c.edge_redness_change, " pts")],
  ];
  return (
    <div>
      <p className="font-semibold">{c.verdict}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {rows.map(([l, v]) => (
          <div key={l} className="rounded-xl bg-slate-50 p-2.5 dark:bg-white/5">
            <p className="text-[11px] font-semibold uppercase tracking-wide muted">{l}</p>
            <p className="font-bold">{v}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs muted">{c.note}</p>
    </div>
  );
}

function ResultCard({ scan }: { scan: Scan }) {
  const r = scan.result;
  const U = URGENCY[r.level] ?? URGENCY.soon;
  return (
    <section className="space-y-4 animate-fade-up">
      <div className={`card border-2 p-5 ${U.box}`}>
        <div className="flex items-start gap-3">
          <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${U.iconCls}`}><U.icon className="h-6 w-6" /></div>
          <div className="min-w-0 flex-1">
            <span className={`chip ${U.chip}`}>{U.short} · {scan.label}</span>
            <p className="mt-1 text-xl font-extrabold text-ink dark:text-white">{r.title}</p>
            <p className="mt-0.5 text-sm font-medium">{r.action}</p>
          </div>
        </div>
        {r.level === "emergency" && <div className="mt-4"><CallButtons /></div>}
        {!!r.reasons.length && (
          <div className="mt-4">
            <p className="text-xs font-bold uppercase tracking-wider muted">Why</p>
            <ul className="mt-1 space-y-1 text-sm">{r.reasons.map((x) => <li key={x} className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />{x}</li>)}</ul>
          </div>
        )}
        {r.photo_note && <p className="mt-3 flex items-start gap-2 rounded-xl bg-white/70 p-3 text-sm dark:bg-white/5"><Sun className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />{r.photo_note}</p>}
      </div>

      {scan.compare && (
        <div className="card p-5">
          <h3 className="mb-2 flex items-center gap-2 font-bold"><GitCompare className="h-4 w-4 text-brand-600" /> Compared with your last “{scan.label}” photo ({fmtDate(scan.compare.previous_at, { day: "numeric", month: "short" })})</h3>
          <CompareView c={scan.compare} />
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-5">
          <h3 className="mb-3 font-bold">What the photo shows</h3>
          <MetricBars m={scan.metrics} />
          <p className="mt-3 text-[11px] muted">Colour measurements only. Light and distance change these numbers.</p>
        </div>
        <div className="card space-y-4 p-5">
          {!!r.home_care.length && (
            <div>
              <h3 className="mb-2 font-bold">Home care</h3>
              <ul className="space-y-1.5 text-sm">{r.home_care.map((x) => <li key={x} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />{x}</li>)}</ul>
            </div>
          )}
          <div>
            <h3 className="mb-2 font-bold">See a doctor if you notice</h3>
            <ul className="space-y-1.5 text-sm">{r.warning_signs.map((x) => <li key={x} className="flex gap-2"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />{x}</li>)}</ul>
          </div>
        </div>
      </div>
      <p className="flex items-start gap-2 text-xs muted"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />{r.disclaimer}</p>
    </section>
  );
}

/** Thumbnail via a short-lived signed URL. */
function Thumb({ scan, className = "h-16 w-16" }: { scan: Scan; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!scan.has_photo) return;
    let alive = true;
    api.get<{ url: string }>(`/wounds/${scan.id}/file-url`).then((r) => alive && setUrl(r.url)).catch(() => {});
    return () => { alive = false; };
  }, [scan.id, scan.has_photo]);
  return (
    <div className={`${className} shrink-0 overflow-hidden rounded-xl bg-slate-100 dark:bg-white/10`}>
      {url ? <img src={url} alt={`${scan.label} photo`} className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center text-slate-400"><ImageIcon className="h-5 w-5" /></div>}
    </div>
  );
}

export default function WoundCheck() {
  const { profile } = useApp();
  const pid = profile?.id;
  const history = useFetch<Scan[]>(pid ? `/profiles/${pid}/wounds` : null);
  const [label, setLabel] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [days, setDays] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<Scan | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [cmp, setCmp] = useState<CompareOut | null>(null);
  const [cmpErr, setCmpErr] = useState<string | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setResult(null); setPicked([]); setFile(null); setAnswers({}); setDays(""); setErr(null);
  }, [pid]);
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  if (!profile) return <Spinner />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) { setErr("Please add a photo of the wound."); return; }
    setErr(null); setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("label", label.trim() || "wound");
      fd.append("answers", JSON.stringify({ ...answers, days: Number(days) || 0 }));
      const r = await api.upload<Scan>(`/profiles/${profile!.id}/wounds`, fd);
      setResult(r);
      history.reload();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (x) { setErr((x as Error).message); }
    finally { setBusy(false); }
  }

  function pick(f?: File | null) {
    if (f) setFile(f);
    if (camera.current) camera.current.value = "";
    if (gallery.current) gallery.current.value = "";
  }

  function togglePick(id: number) {
    setPicked((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c.slice(-1), id]));
  }

  async function compare() {
    if (picked.length !== 2) return;
    setCmpErr(null);
    try { setCmp(await api.get<CompareOut>(`/wounds/${picked[0]}/compare/${picked[1]}`)); }
    catch (x) { setCmpErr((x as Error).message); }
  }

  async function remove(id: number) {
    if (!confirm("Delete this wound photo and its result?")) return;
    await api.del(`/wounds/${id}`);
    setPicked((c) => c.filter((x) => x !== id));
    if (result?.id === id) setResult(null);
    history.reload();
  }

  const groups = (history.data ?? []).reduce<Record<string, Scan[]>>((acc, s) => {
    const k = s.label.trim().toLowerCase() || "wound";
    (acc[k] ??= []).push(s);
    return acc;
  }, {});
  const yes = Object.values(answers).filter(Boolean).length;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader icon={<Bandage className="h-6 w-6" />} title="Wound photo check" subtitle={`For ${profile.name}. A photo plus a few safety questions tells you how soon a wound may need a doctor, and tracks healing over time.`} />

      <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
        <Siren className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="flex-1">
          <p className="font-semibold">Heavy bleeding, a deep cut, a snake bite or trouble breathing? Don't wait for a photo check.</p>
          <div className="mt-2"><CallButtons /></div>
        </div>
      </div>

      {result && <div className="mb-8"><ResultCard scan={result} /></div>}

      <form onSubmit={submit} className="card mb-8 space-y-5 p-5">
        <div>
          <label className="label">Where is the wound?</label>
          <input className="input" placeholder="e.g. left foot" maxLength={80} value={label} onChange={(e) => setLabel(e.target.value)} />
          <div className="mt-2 flex flex-wrap gap-2">
            {SITES.map((s) => (
              <button type="button" key={s} onClick={() => setLabel(s === "other" ? "" : s)} className={`chip px-3 py-1.5 ${label.toLowerCase() === s ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200"}`}>{s.charAt(0).toUpperCase() + s.slice(1)}</button>
            ))}
          </div>
          <p className="mt-1 text-xs muted">Use the same name each time (e.g. “left foot”) so DOC can compare photos of the same wound.</p>
        </div>

        <div>
          <label className="label">Photo</label>
          <div className="flex flex-wrap items-center gap-4">
            <div className="grid h-32 w-32 place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 dark:border-white/15 dark:bg-white/5">
              {preview ? <img src={preview} alt="Wound preview" className="h-full w-full object-cover" /> : <ImageIcon className="h-8 w-8 text-slate-400" />}
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-primary" onClick={() => camera.current?.click()}><Camera className="h-4 w-4" /> Take photo</button>
                <button type="button" className="btn-outline" onClick={() => gallery.current?.click()}><ImageIcon className="h-4 w-4" /> Choose photo</button>
              </div>
              <p className="flex items-start gap-1.5 text-xs muted"><Sun className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />Take photos in daylight, from the same distance each time, without flash.</p>
            </div>
          </div>
          <input ref={camera} type="file" hidden accept="image/*" capture="environment" onChange={(e) => pick(e.target.files?.[0])} />
          <input ref={gallery} type="file" hidden accept="image/*" onChange={(e) => pick(e.target.files?.[0])} />
        </div>

        <div>
          <label className="label">Quick safety questions <span className="font-normal muted">· tap any that are true</span></label>
          <div className="grid gap-2 sm:grid-cols-2">
            {QUESTIONS.map(([k, q]) => {
              const on = !!answers[k];
              return (
                <button type="button" key={k} onClick={() => setAnswers((a) => ({ ...a, [k]: !on }))} aria-pressed={on}
                  className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition ${on ? "border-red-300 bg-red-50 text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200" : "border-slate-200 bg-white dark:border-white/10 dark:bg-white/5"}`}>
                  <span>{q}</span>
                  <span className={`chip shrink-0 ${on ? "bg-red-600 text-white" : "bg-slate-100 text-slate-500 dark:bg-white/10"}`}>{on ? "Yes" : "No"}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <label className="text-sm font-medium" htmlFor="wound-days">Days since the injury</label>
            <input id="wound-days" className="input w-24" type="number" min={0} max={365} value={days} onChange={(e) => setDays(e.target.value)} placeholder="0" />
          </div>
        </div>

        {err && <p className="rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">{err}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Stethoscope className="h-4 w-4" />} Check this wound{yes ? ` (${yes} sign${yes > 1 ? "s" : ""} ticked)` : ""}</button>
      </form>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wider muted">Photo history</h2>
          <button className="btn-outline py-2 text-xs" disabled={picked.length !== 2} onClick={compare}><GitCompare className="h-4 w-4" /> Compare selected ({picked.length}/2)</button>
        </div>
        {cmpErr && <div className="mb-3"><ErrorBox msg={cmpErr} /></div>}
        {history.error ? <ErrorBox msg={history.error} /> : !history.data ? <Spinner /> : !history.data.length ? (
          <Empty icon={<Bandage className="h-7 w-7" />} title="No wound photos yet" text="Check a wound above. Take a new photo every few days to see whether it is healing." />
        ) : (
          <div className="space-y-4">
            {Object.entries(groups).map(([k, scans]) => (
              <div key={k} className="card p-4">
                <p className="mb-3 font-bold capitalize">{scans[0].label} <span className="text-xs font-normal muted">· {scans.length} photo{scans.length > 1 ? "s" : ""}</span></p>
                <div className="divide-y divide-slate-100 dark:divide-white/5">
                  {scans.map((s) => {
                    const U = URGENCY[s.result?.level] ?? URGENCY.soon;
                    const sel = picked.includes(s.id);
                    return (
                      <div key={s.id} className="flex items-center gap-3 py-2.5">
                        <input type="checkbox" className="h-4 w-4 accent-teal-600" checked={sel} onChange={() => togglePick(s.id)} aria-label="Select to compare" />
                        <button type="button" onClick={() => setResult(s)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                          <Thumb scan={s} />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold">{fmtDate(s.created_at, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs muted">
                              <span className={`chip ${U.chip}`}>{U.short}</span> area {s.metrics?.wound_pct ?? 0}% · redness {s.metrics?.red_pct ?? 0}%
                              {s.is_demo && <span className="chip bg-slate-100 text-[10px] text-slate-500 dark:bg-white/10">demo</span>}
                            </p>
                          </div>
                        </button>
                        <button className="btn-ghost p-2 hover:text-red-600" aria-label="Delete" onClick={() => remove(s.id)}><Trash2 className="h-4 w-4" /></button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            <p className="text-xs muted">Tip: tick two photos of the same wound to compare them. Tap a photo to see its full result.</p>
          </div>
        )}
      </section>

      <Modal open={!!cmp} onClose={() => setCmp(null)} title="Comparing two photos" wide>
        {cmp && (
          <div>
            <div className="mb-4 grid grid-cols-2 gap-3">
              {[cmp.from, cmp.to].map((s, i) => (
                <div key={s.id}>
                  <Thumb scan={s} className="aspect-square w-full" />
                  <p className="mt-1 text-xs"><b>{i === 0 ? "Earlier" : "Later"}</b> <span className="muted">· {s.label} · {fmtDate(s.created_at, { day: "numeric", month: "short" })}</span></p>
                </div>
              ))}
            </div>
            <CompareView c={cmp} />
          </div>
        )}
      </Modal>

      <Disclaimer text={result?.result.disclaimer ?? "This photo check measures colours only and follows simple safety rules. It cannot diagnose an infection. When in doubt, see a doctor."} />
    </div>
  );
}
