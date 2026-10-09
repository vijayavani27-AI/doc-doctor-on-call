import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Gauge, Droplets, HeartPulse, TrendingUp, TrendingDown, CheckCircle2, CircleHelp, Database, BookOpen, SlidersHorizontal, Settings as SettingsIcon, ShieldAlert, Phone, RotateCcw, Info } from "lucide-react";
import { api } from "../lib/api";
import { useApp, useFetch } from "../lib/store";
import { fmtNum, statusStyles } from "../lib/format";
import type { Status } from "../lib/types";
import { Disclaimer, ErrorBox, PageHeader, Spinner, StatusChip } from "../components/ui";
import { t } from "../lib/i18n";

type Kind = "diabetes" | "heart";
type Band = "low" | "moderate" | "high";

interface Factor { feature: string; label: string; value: number | null; contribution: number; direction: "raises" | "lowers" }
interface UsedFeature { feature: string; label: string; value: number }
interface ImputedFeature { feature: string; label: string; reason: "missing" | "out_of_range"; typical_value: number; method: string }
interface SourceNote { feature: string; source: string }
interface Urgent { level: string; message: string; reasons: string[]; call: { label: string; number: string }[] }
interface RiskResult {
  kind: Kind; available: boolean; error?: string; needed?: string; sources?: SourceNote[];
  probability?: number; percent?: number; band?: Band; summary?: string;
  top_factors?: Factor[]; used_features?: UsedFeature[]; imputed_features?: ImputedFeature[];
  model?: { name: string; dataset: string; cv_auc: number; n_rows: number };
  disclaimer?: string; urgent?: Urgent | null;
}
interface ModelCard {
  model_name?: string; features: string[]; labels: Record<string, string>; units: Record<string, string>; n_rows: number; positives?: number;
  cv_auc_mean: number; cv_auc_sd?: number; dataset: { name: string; source?: string; url?: string; citation?: string }; limitations?: string[];
  bands?: { low_below: number; high_from: number };
}
interface ModelsResp { available: boolean; models?: Record<Kind, ModelCard> }

const BAND: Record<Band, { status: Status; label: string }> = {
  low: { status: "green", label: "Low" },
  moderate: { status: "yellow", label: "Moderate" },
  high: { status: "red", label: "High" },
};

const META: Record<Kind, { title: string; icon: typeof Gauge; what: string }> = {
  diabetes: { title: "Diabetes screening", icon: Droplets, what: "Chance of developing type 2 diabetes, estimated from sugar, BP, BMI and age." },
  heart: { title: "Heart screening", icon: HeartPulse, what: "Chance of a narrowed heart artery, estimated from age, BP, cholesterol and sugar." },
};

/** Plain-language names for model features (the model's own labels are technical). */
const PLAIN: Record<string, string> = {
  pregnancies: "Pregnancies", glucose: "Sugar 2 hours after food", diastolic_bp: "BP (lower number)", skin_thickness: "Skin-fold thickness",
  insulin: "Insulin after glucose drink", bmi: "Body mass index (BMI)", pedigree: "Family history score", age: "Age",
  sex: "Sex", cp: "Chest pain type", trestbps: "Resting BP (top number)", chol: "Total cholesterol", fbs: "Fasting sugar above 120",
  restecg: "Resting ECG result", thalach: "Highest heart rate on exercise", exang: "Chest pain on exercise", oldpeak: "ECG change on exercise",
  slope: "ECG slope on exercise", ca: "Narrowed vessels on scan", thal: "Thallium scan result",
};
const UNIT: Record<string, string> = {
  glucose: "mg/dL", diastolic_bp: "mmHg", trestbps: "mmHg", chol: "mg/dL", bmi: "kg/m²", age: "yrs", thalach: "bpm", insulin: "µU/mL", skin_thickness: "mm",
};
const CP_OPTIONS: [string, string][] = [["1", "Typical angina (pressure in the chest on effort, eases with rest)"], ["2", "Atypical chest pain"], ["3", "Chest pain not related to the heart"], ["4", "No chest pain"]];

const plain = (f: string, fallback?: string) => PLAIN[f] ?? (fallback ?? f).replace(/Â/g, "");

function showValue(feature: string, v: number | null | undefined): string {
  if (v === null || v === undefined) return "-";
  if (feature === "sex") return v >= 0.5 ? "Male" : "Female";
  if (feature === "fbs") return v >= 0.5 ? "Yes" : "No";
  if (feature === "exang") return v >= 0.5 ? "Yes" : "No";
  if (feature === "cp") return CP_OPTIONS.find(([k]) => Number(k) === Math.round(v))?.[1].split(" (")[0] ?? String(v);
  return `${fmtNum(v, 1)}${UNIT[feature] ? ` ${UNIT[feature]}` : ""}`;
}

function UrgentBanner({ u }: { u: Urgent }) {
  const calls = [...u.call];
  for (const n of [{ label: "Emergency", number: "112" }, { label: "Ambulance", number: "108" }]) if (!calls.some((c) => c.number === n.number)) calls.push(n);
  return (
    <div role="alert" className="card mb-6 border-red-300 bg-red-50 p-5 text-red-900 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
      <div className="flex items-start gap-3">
        <ShieldAlert className="h-6 w-6 shrink-0 text-red-600" />
        <div className="min-w-0 flex-1">
          <p className="font-extrabold">{u.message}</p>
          {!!u.reasons.length && <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">{u.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
          <div className="mt-3 flex flex-wrap gap-2">
            {calls.map((c) => <a key={c.number} href={`tel:${c.number}`} className="btn bg-red-600 text-white hover:bg-red-700"><Phone className="h-4 w-4" /> {c.number} · {c.label}</a>)}
          </div>
        </div>
      </div>
    </div>
  );
}

function FactorBars({ factors }: { factors: Factor[] }) {
  const max = Math.max(...factors.map((f) => Math.abs(f.contribution)), 0.0001);
  return (
    <div className="space-y-3">
      {factors.map((f) => {
        const up = f.direction === "raises";
        return (
          <div key={f.feature}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="flex items-center gap-1.5 font-semibold">
                {up ? <TrendingUp className="h-3.5 w-3.5 text-red-500" /> : <TrendingDown className="h-3.5 w-3.5 text-emerald-500" />}
                {plain(f.feature, f.label)}
              </span>
              <span className="text-xs muted">yours: <b className="text-ink dark:text-white">{showValue(f.feature, f.value)}</b></span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
              <div className={`h-full rounded-full ${up ? "bg-red-400" : "bg-emerald-500"}`} style={{ width: `${Math.max(6, (Math.abs(f.contribution) / max) * 100)}%` }} />
            </div>
            <p className={`mt-0.5 text-[11px] font-medium ${up ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>{up ? "may push the estimate up" : "may pull the estimate down"}</p>
          </div>
        );
      })}
    </div>
  );
}

function ImproveForm({ kind, sex, busy, onSubmit }: { kind: Kind; sex: "F" | "M"; busy: boolean; onSubmit: (a: Record<string, number | null>) => void }) {
  const [f, setF] = useState({ pregnancies: "", glucose: "", cp: "", exang: "", thalach: "" });
  const num = (s: string) => (s.trim() === "" ? null : Number(s));
  function submit(e: FormEvent) {
    e.preventDefault();
    const a: Record<string, number | null> =
      kind === "diabetes" ? { glucose: num(f.glucose), ...(sex === "F" ? { pregnancies: num(f.pregnancies) } : {}) } : { cp: num(f.cp), exang: num(f.exang), thalach: num(f.thalach) };
    onSubmit(Object.fromEntries(Object.entries(a).filter(([, v]) => v !== null && !Number.isNaN(v))));
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      {kind === "diabetes" ? (
        <div className={`grid gap-3 ${sex === "F" ? "sm:grid-cols-2" : ""}`}>
          {sex === "F" && <div><label className="label">Number of pregnancies</label><input className="input" type="number" min={0} max={20} placeholder="e.g. 2" value={f.pregnancies} onChange={(e) => setF({ ...f, pregnancies: e.target.value })} /></div>}
          <div><label className="label">Sugar 2 hours after food (mg/dL)</label><input className="input" type="number" min={40} max={400} placeholder="e.g. 140" value={f.glucose} onChange={(e) => setF({ ...f, glucose: e.target.value })} /></div>
        </div>
      ) : (
        <>
          <div><label className="label">Chest pain type</label>
            <select className="input" value={f.cp} onChange={(e) => setF({ ...f, cp: e.target.value })}>
              <option value="">Not sure / skip</option>
              {CP_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label">Chest pain during exercise?</label>
              <select className="input" value={f.exang} onChange={(e) => setF({ ...f, exang: e.target.value })}>
                <option value="">Not sure / skip</option><option value="1">Yes</option><option value="0">No</option>
              </select></div>
            <div><label className="label">Highest heart rate on exercise (optional)</label><input className="input" type="number" min={50} max={230} placeholder="e.g. 150 bpm" value={f.thalach} onChange={(e) => setF({ ...f, thalach: e.target.value })} /></div>
          </div>
        </>
      )}
      <p className="text-xs muted">All questions are optional. Answers are used only for this estimate and are not saved to your record.</p>
      <button className="btn-primary w-full sm:w-auto" disabled={busy}><SlidersHorizontal className="h-4 w-4" /> {busy ? "Updating…" : "Update estimate"}</button>
    </form>
  );
}

function ModelInfo({ card, fallback }: { card?: ModelCard; fallback?: RiskResult["model"] }) {
  const name = card?.dataset.name ?? fallback?.dataset;
  const auc = card?.cv_auc_mean ?? fallback?.cv_auc;
  const rows = card?.n_rows ?? fallback?.n_rows;
  if (!name) return null;
  return (
    <details className="group rounded-xl border border-slate-200 p-3 text-sm dark:border-white/10">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold">
        <Database className="h-4 w-4 text-brand-600" /> Model card
        <span className="ml-auto flex flex-wrap justify-end gap-1.5">
          <span className="chip bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200">{card?.model_name ?? fallback?.name ?? "XGBoost"}</span>
          {auc !== undefined && <span className="chip bg-brand-50 text-brand-800 dark:bg-brand-500/10 dark:text-brand-200">AUC {auc.toFixed(2)}</span>}
        </span>
      </summary>
      <div className="mt-3 space-y-2 text-xs">
        <p><span className="font-semibold">Trained on:</span> <span className="muted">{name}{rows ? ` · ${rows.toLocaleString("en-IN")} people` : ""}{card?.dataset.source ? ` · ${card.dataset.source}` : ""}</span></p>
        {auc !== undefined && <p className="muted">AUC {auc.toFixed(2)}{card?.cv_auc_sd ? ` (±${card.cv_auc_sd.toFixed(2)})` : ""} in 5-fold cross-validation: how well the model separated people who did and did not have the condition (1.0 = perfect, 0.5 = a coin toss).</p>}
        {!!card?.limitations?.length && (
          <div>
            <p className="font-semibold">Limitations</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 muted">{card.limitations.map((l) => <li key={l}>{l.replace(/Â/g, "")}</li>)}</ul>
          </div>
        )}
        {card?.dataset.citation && <p className="flex gap-1 text-[11px] muted"><BookOpen className="mt-0.5 h-3 w-3 shrink-0" />{card.dataset.citation}</p>}
      </div>
    </details>
  );
}

function ScreeningCard({ kind, pid, sex, card }: { kind: Kind; pid: number; sex: "F" | "M"; card?: ModelCard }) {
  const { data, error, reload } = useFetch<RiskResult>(`/profiles/${pid}/risk/${kind}`);
  const [custom, setCustom] = useState<RiskResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setCustom(null); setErr(null); }, [pid]);

  const m = META[kind];
  const r = custom ?? data;

  async function improve(answers: Record<string, number | null>) {
    setBusy(true);
    setErr(null);
    try {
      setCustom(await api.post<RiskResult>(`/profiles/${pid}/risk/${kind}`, { answers }));
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  }

  if (error) return <ErrorBox msg={error} />;
  if (!r) return <div className="card"><Spinner label={`Running the ${kind} model…`} /></div>;

  const band = r.band ? BAND[r.band] : null;
  const st = band ? statusStyles[band.status] : statusStyles.info;
  const sourceOf = Object.fromEntries((r.sources ?? []).map((s) => [s.feature, s.source]));

  return (
    <article className={`card overflow-hidden ring-1 ${st.ring} animate-fade-up`}>
      {r.urgent && <div className="p-5 pb-0"><UrgentBanner u={r.urgent} /></div>}
      <div className={`flex flex-wrap items-start gap-4 p-5 ${st.soft}`}>
        <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white shadow-soft dark:bg-white/10 ${st.text}`}><m.icon className="h-6 w-6" /></div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wider muted">Screening estimate · not a diagnosis</p>
          <h3 className="text-lg font-extrabold text-ink dark:text-white">{m.title}</h3>
          <p className="mt-0.5 text-sm muted">{m.what}</p>
          {band && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <StatusChip status={band.status}>{band.label} estimate</StatusChip>
              {custom && <span className="chip bg-ink text-white dark:bg-white dark:text-ink"><CheckCircle2 className="h-3 w-3" /> includes your answers</span>}
            </div>
          )}
        </div>
        {r.percent !== undefined && (
          <div className="text-right">
            <p className={`text-5xl font-extrabold ${st.text}`}>{r.percent}%</p>
            <p className="text-xs muted">estimated chance</p>
          </div>
        )}
      </div>

      {r.error ? (
        <div className="space-y-3 p-5">
          <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide"><CircleHelp className="h-3.5 w-3.5" /> Not enough information yet</p>
            {r.error}
            {r.needed && <p className="mt-2 font-medium">{r.needed}</p>}
          </div>
          {r.available !== false && (
            <div className="flex flex-wrap gap-2">
              <Link to="/app/settings" className="btn-outline py-2 text-xs"><SettingsIcon className="h-4 w-4" /> Add date of birth, height & weight</Link>
              <Link to="/app/wellness" className="btn-outline py-2 text-xs"><HeartPulse className="h-4 w-4" /> Add home BP or sugar readings</Link>
            </div>
          )}
          {r.available !== false && (
            <div className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
              <p className="mb-3 font-bold">Answer a few questions instead</p>
              <ImproveForm kind={kind} sex={sex} busy={busy} onSubmit={improve} />
              {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-5 p-5 lg:grid-cols-2">
          <div className="space-y-4">
            {r.summary && <p className="text-sm leading-relaxed">{r.summary}</p>}
            {!!r.top_factors?.length && (
              <div>
                <p className="label">What moved your estimate most</p>
                <FactorBars factors={r.top_factors} />
              </div>
            )}
            <div>
              <p className="label">Your values we used</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {(r.used_features ?? []).map((u) => (
                  <div key={u.feature} className="rounded-xl border border-slate-200 p-2.5 dark:border-white/10">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-semibold">{plain(u.feature, u.label)}</p>
                      <p className="text-sm font-bold">{showValue(u.feature, u.value)}</p>
                    </div>
                    {sourceOf[u.feature] && <p className="mt-0.5 text-[11px] muted">from {sourceOf[u.feature]}</p>}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {!!r.imputed_features?.length && (
              <div className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-white/5">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide muted"><Info className="h-3.5 w-3.5" /> Missing, so we used a typical value</p>
                <p className="mb-2 text-xs muted">We don't have these for you, so the model used a typical value from its training data (or its built-in handling for missing values). Adding real values can make the estimate fit you better.</p>
                <div className="flex flex-wrap gap-1.5">
                  {r.imputed_features.map((i) => (
                    <span key={i.feature} className="chip bg-white text-slate-700 dark:bg-white/10 dark:text-slate-200" title={i.reason === "out_of_range" ? "Your value looked out of range, so it was not used" : "Missing"}>
                      {plain(i.feature, i.label)}{i.method === "median" ? ` · typical ${showValue(i.feature, i.typical_value)}` : ""}{i.reason === "out_of_range" ? " (out of range)" : ""}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 font-bold"><SlidersHorizontal className="h-4 w-4 text-brand-600" /> Improve this estimate</p>
                {custom && <button className="btn-ghost px-2 py-1 text-xs" onClick={() => { setCustom(null); reload(); }}><RotateCcw className="h-3.5 w-3.5" /> Use my records only</button>}
              </div>
              <ImproveForm kind={kind} sex={sex} busy={busy} onSubmit={improve} />
              {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
            </div>
            <ModelInfo card={card} fallback={r.model} />
            <p className="flex gap-1.5 text-[11px] muted"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />{r.disclaimer ?? "This is a screening estimate, not a diagnosis. Please discuss it with your doctor."}</p>
          </div>
        </div>
      )}
    </article>
  );
}

export default function Screening() {
  const { profile, lang } = useApp();
  const models = useFetch<ModelsResp>("/risk-models");
  if (!profile) return <Spinner />;

  return (
    <div>
      <PageHeader
        icon={<Gauge className="h-6 w-6" />}
        title="Risk check (screening)"
        subtitle="Two machine-learning models (XGBoost) estimate your chance of diabetes and heart artery disease from your own records, and show which of your values moved the estimate. This is a screening estimate, not a diagnosis."
      />
      {models.data && !models.data.available && <div className="mb-6"><ErrorBox msg="Risk models are not installed on this server yet." /></div>}
      <div className="space-y-5">
        {(["diabetes", "heart"] as Kind[]).map((k) => (
          <ScreeningCard key={`${k}-${profile.id}`} kind={k} pid={profile.id} sex={profile.sex} card={models.data?.models?.[k]} />
        ))}
      </div>
      <Disclaimer text={`${t("notDoctor", lang)} These estimates come from research datasets that may not match you. A high estimate is worth discussing with your doctor; a low one does not rule anything out.`} />
    </div>
  );
}
