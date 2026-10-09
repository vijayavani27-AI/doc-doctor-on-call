import { useEffect, useRef, useState, type FormEvent } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Utensils, Camera, Search, Minus, Plus, Trash2, Lightbulb, Salad, BookOpen, Loader2, X, Sparkles, CheckCircle2, AlertTriangle } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useApp, useFetch } from "../lib/store";
import { fmtDate, fmtNum } from "../lib/format";
import { Disclaimer, Empty, ErrorBox, PageHeader, Spinner } from "../components/ui";

type Gi = "low" | "medium" | "high" | string;
type MealType = "breakfast" | "lunch" | "dinner" | "snack";
interface Nutr { kcal: number; carbs_g: number; protein_g: number; fat_g: number; fiber_g: number; sodium_mg: number }
interface Food extends Nutr { key: string; name: string; name_ta: string; name_hi: string; serving: string; gi_band: Gi; veg: boolean; tags: string[] }
interface ParsedItem extends Nutr { key: string; name: string; name_ta: string; serving: string; servings: number; gi_band: Gi; confidence: number; said?: string | null }
interface ParseResult { items: ParsedItem[]; unknown?: string[]; totals: Nutr; engine?: string; note?: string }
interface Meal { id: number; meal_type: string; eaten_at: string; items: ParsedItem[]; totals: Nutr; source: string; note: string | null; is_demo: boolean }
interface MealList { items: Meal[]; by_day: ({ date: string } & Nutr)[] }
interface Tip { id: string; title: string; why: string; try: string[]; swaps: { instead_of: string; try: string[] }[]; source: string | null }
interface Diet { tips: Tip[]; week: { meals: number; days_logged: number; avg_per_day: Nutr | null }; disclaimer: string }

/** One editable row in the draft meal: per-serving values so the stepper can rescale. */
interface Draft { uid: number; key: string; name: string; name_ta: string; serving: string; gi_band: Gi; servings: number; per: Nutr; confidence?: number; said?: string | null }

const NUM: (keyof Nutr)[] = ["kcal", "carbs_g", "protein_g", "fat_g", "fiber_g", "sodium_mg"];
const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];
const GI_STYLE: Record<string, string> = {
  low: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  high: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
};

let uidSeq = 1;
function perServing(i: Nutr & { servings?: number }): Nutr {
  const s = i.servings && i.servings > 0 ? i.servings : 1;
  return Object.fromEntries(NUM.map((k) => [k, (i[k] ?? 0) / s])) as unknown as Nutr;
}
function fromParsed(i: ParsedItem): Draft {
  return { uid: uidSeq++, key: i.key, name: i.name, name_ta: i.name_ta, serving: i.serving, gi_band: i.gi_band, servings: i.servings || 1, per: perServing(i), confidence: i.confidence, said: i.said };
}
function fromFood(f: Food): Draft {
  return { uid: uidSeq++, key: f.key, name: f.name, name_ta: f.name_ta, serving: f.serving, gi_band: f.gi_band, servings: 1, per: perServing(f) };
}
function scaled(d: Draft, k: keyof Nutr) {
  return Math.round(d.per[k] * d.servings * 10) / 10;
}
function defaultMealType(): MealType {
  const h = new Date().getHours();
  return h < 11 ? "breakfast" : h < 16 ? "lunch" : h < 19 ? "snack" : "dinner";
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function GiChip({ gi }: { gi: Gi }) {
  if (!gi) return null;
  return <span className={`chip ${GI_STYLE[gi] ?? "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300"}`}>GI {gi}</span>;
}

/** Search the food list and pick one. */
function FoodSearch({ initial = "", onPick, autoFocus }: { initial?: string; onPick: (f: Food) => void; autoFocus?: boolean }) {
  const [q, setQ] = useState(initial);
  const [hits, setHits] = useState<Food[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!q.trim()) { setHits([]); return; }
    let alive = true;
    setBusy(true);
    const t = setTimeout(() => {
      api.get<Food[]>(`/foods?q=${encodeURIComponent(q.trim())}&limit=8`)
        .then((r) => alive && setHits(r))
        .catch(() => alive && setHits([]))
        .finally(() => alive && setBusy(false));
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);
  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input className="input pl-9" placeholder="Search foods, e.g. dosa, ragi, dal" value={q} autoFocus={autoFocus} onChange={(e) => setQ(e.target.value)} />
        {busy && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-brand-600" />}
      </div>
      {!!hits.length && (
        <div className="mt-2 flex flex-wrap gap-2">
          {hits.map((f) => (
            <button type="button" key={f.key} onClick={() => onPick(f)} className="chip bg-slate-100 px-3 py-1.5 text-slate-700 hover:bg-brand-50 hover:text-brand-700 dark:bg-white/10 dark:text-slate-200">
              <Plus className="h-3 w-3" /> {f.name} <span className="muted">· {Math.round(f.kcal)} kcal</span>
            </button>
          ))}
        </div>
      )}
      {!busy && q.trim() && !hits.length && <p className="mt-2 text-xs muted">No match. Try a simpler name.</p>}
    </div>
  );
}

function DraftRow({ d, onChange, onRemove }: { d: Draft; onChange: (servings: number) => void; onRemove: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 font-semibold">
          {d.name} <GiChip gi={d.gi_band} />
          {d.confidence !== undefined && d.confidence < 0.8 && <span className="chip bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"><AlertTriangle className="h-3 w-3" />Check</span>}
        </p>
        <p className="text-xs muted">{d.name_ta && <span className="mr-2">{d.name_ta}</span>}1 serving = {d.serving}{d.said ? ` · you wrote “${d.said}”` : ""}</p>
        <p className="mt-1 text-xs"><b>{Math.round(scaled(d, "kcal"))} kcal</b> <span className="muted">· carbs {fmtNum(scaled(d, "carbs_g"), 1)} g · protein {fmtNum(scaled(d, "protein_g"), 1)} g</span></p>
      </div>
      <div className="flex items-center gap-1 rounded-xl border border-slate-200 p-1 dark:border-white/10">
        <button type="button" className="btn-ghost p-1.5" aria-label="Less" disabled={d.servings <= 0.5} onClick={() => onChange(Math.max(0.5, d.servings - 0.5))}><Minus className="h-3.5 w-3.5" /></button>
        <span className="w-12 text-center text-sm font-bold">{fmtNum(d.servings, 2)}×</span>
        <button type="button" className="btn-ghost p-1.5" aria-label="More" disabled={d.servings >= 10} onClick={() => onChange(Math.min(10, d.servings + 0.5))}><Plus className="h-3.5 w-3.5" /></button>
      </div>
      <button type="button" className="btn-ghost p-2 hover:text-red-600" aria-label="Remove" onClick={onRemove}><Trash2 className="h-4 w-4" /></button>
    </div>
  );
}

export default function Meals() {
  const { profile } = useApp();
  const pid = profile?.id;
  const meals = useFetch<MealList>(pid ? `/profiles/${pid}/meals?days=7` : null);
  const diet = useFetch<Diet>(pid ? `/profiles/${pid}/diet` : null);

  const [text, setText] = useState("");
  const [mealType, setMealType] = useState<MealType>(defaultMealType);
  const [draft, setDraft] = useState<Draft[]>([]);
  const [unknown, setUnknown] = useState<string[]>([]);
  const [source, setSource] = useState<"text" | "photo" | "manual">("text");
  const [busy, setBusy] = useState<"parse" | "scan" | "save" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [photoMsg, setPhotoMsg] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const camera = useRef<HTMLInputElement>(null);

  // A different family member → start a fresh draft.
  useEffect(() => {
    setDraft([]); setUnknown([]); setText(""); setErr(null); setNotice(null); setPhotoMsg(null);
  }, [pid]);

  if (!profile) return <Spinner />;

  async function parse(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setErr(null); setNotice(null); setPhotoMsg(null); setBusy("parse");
    try {
      const r = await api.post<ParseResult>("/meals/parse", { text: text.trim() });
      setDraft((cur) => [...cur, ...r.items.map(fromParsed)]);
      setUnknown(r.unknown ?? []);
      setSource("text");
      if (!r.items.length && !(r.unknown ?? []).length) setErr("We couldn't find any foods in that. Try e.g. “2 idli, sambar”.");
    } catch (x) { setErr((x as Error).message); }
    finally { setBusy(null); }
  }

  async function scan(file: File) {
    setErr(null); setNotice(null); setPhotoMsg(null); setBusy("scan");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.upload<ParseResult>(`/profiles/${profile!.id}/meals/scan`, fd);
      setDraft((cur) => [...cur, ...r.items.map(fromParsed)]);
      setUnknown([]);
      setSource("photo");
      setPhotoMsg(r.items.length ? `${r.note ?? "Please check the items and portions before saving."}${r.engine ? ` (${r.engine})` : ""}` : "No food was recognised in this photo. Type what you ate instead.");
    } catch (x) {
      if (x instanceof ApiError && x.status === 503) setPhotoMsg(x.message || "Photo recognition needs the AI boost; type what you ate instead.");
      else setErr((x as Error).message);
    } finally { setBusy(null); if (camera.current) camera.current.value = ""; }
  }

  async function save() {
    if (!draft.length) return;
    setErr(null); setBusy("save");
    try {
      await api.post(`/profiles/${profile!.id}/meals`, { meal_type: mealType, items: draft.map((d) => ({ key: d.key, servings: d.servings })), source });
      setNotice(`Saved ${cap(mealType)}: ${draft.map((d) => d.name).join(", ")}.`);
      setDraft([]); setUnknown([]); setText(""); setPhotoMsg(null);
      meals.reload(); diet.reload();
    } catch (x) { setErr((x as Error).message); }
    finally { setBusy(null); }
  }

  async function removeMeal(id: number) {
    if (!confirm("Delete this meal?")) return;
    await api.del(`/meals/${id}`);
    meals.reload(); diet.reload();
  }

  const totals = Object.fromEntries(NUM.map((k) => [k, draft.reduce((s, d) => s + scaled(d, k), 0)])) as unknown as Nutr;
  const chart = [...(meals.data?.by_day ?? [])].reverse().map((d) => ({ ...d, kcal: Math.round(d.kcal) }));
  const avg = diet.data?.week.avg_per_day;

  return (
    <div>
      <PageHeader icon={<Utensils className="h-6 w-6" />} title="Food & diet" subtitle={`For ${profile.name}. Log what you eat in plain words; DOC estimates calories, carbs and protein from an Indian food table and links tips to your own reports.`} />
      {notice && <p className="mb-4 flex items-center gap-2 rounded-xl bg-brand-50 p-3 text-sm dark:bg-brand-500/10"><CheckCircle2 className="h-4 w-4 text-brand-600" />{notice}</p>}

      <section className="card mb-6 p-5">
        <h2 className="mb-3 font-bold">Quick log</h2>
        <form onSubmit={parse} className="space-y-3">
          <div>
            <label className="label">What did you eat?</label>
            <textarea className="input min-h-[72px]" placeholder="e.g. 2 idli, sambar and filter coffee" value={text} maxLength={500} onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit(); } }} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-primary" disabled={!text.trim() || !!busy}>{busy === "parse" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Find foods</button>
            <button type="button" className="btn-outline" disabled={!!busy} onClick={() => camera.current?.click()}>{busy === "scan" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />} Photo of my plate</button>
            <button type="button" className="btn-ghost" onClick={() => setAdding((v) => !v)}><Search className="h-4 w-4" /> Add a food</button>
            <input ref={camera} type="file" hidden accept="image/*" capture="environment" onChange={(e) => e.target.files?.[0] && scan(e.target.files[0])} />
          </div>
        </form>

        {photoMsg && <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200"><Camera className="mt-0.5 h-4 w-4 shrink-0" />{photoMsg}</p>}
        {err && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">{err}</p>}

        {adding && (
          <div className="mt-4 rounded-xl bg-slate-50 p-3 dark:bg-white/5">
            <FoodSearch autoFocus onPick={(f) => { setDraft((c) => [...c, fromFood(f)]); if (!draft.length) setSource("manual"); }} />
          </div>
        )}

        {!!unknown.length && (
          <div className="mt-4 space-y-3">
            {unknown.map((u) => (
              <div key={u} className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-500/30 dark:bg-amber-500/5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm"><b>“{u}”</b> <span className="muted">wasn't found. Pick the closest food:</span></p>
                  <button className="btn-ghost p-1.5" aria-label="Skip" onClick={() => setUnknown((c) => c.filter((x) => x !== u))}><X className="h-4 w-4" /></button>
                </div>
                <FoodSearch initial={u} onPick={(f) => { setDraft((c) => [...c, fromFood(f)]); setUnknown((c) => c.filter((x) => x !== u)); }} />
              </div>
            ))}
          </div>
        )}

        {!!draft.length && (
          <div className="mt-4">
            <div className="divide-y divide-slate-100 dark:divide-white/5">
              {draft.map((d) => (
                <DraftRow key={d.uid} d={d}
                  onChange={(s) => setDraft((c) => c.map((x) => (x.uid === d.uid ? { ...x, servings: s } : x)))}
                  onRemove={() => setDraft((c) => c.filter((x) => x.uid !== d.uid))} />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-3 rounded-xl bg-brand-50 p-3 dark:bg-brand-500/10">
              <div className="text-sm">
                <p className="text-[11px] font-semibold uppercase tracking-wide muted">This meal (approx.)</p>
                <p><b className="text-lg">{Math.round(totals.kcal)} kcal</b> <span className="muted">· carbs {Math.round(totals.carbs_g)} g · protein {Math.round(totals.protein_g)} g · fibre {Math.round(totals.fiber_g)} g</span></p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select className="input w-auto py-2" value={mealType} onChange={(e) => setMealType(e.target.value as MealType)}>
                  {MEAL_TYPES.map((m) => <option key={m} value={m}>{cap(m)}</option>)}
                </select>
                <button className="btn-primary" disabled={busy === "save"} onClick={save}>{busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Save meal</button>
              </div>
            </div>
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-3 font-bold">Last 7 days</h2>
          {meals.error ? <ErrorBox msg={meals.error} /> : !meals.data ? <Spinner /> : !meals.data.items.length ? (
            <p className="py-6 text-center text-sm muted">No meals logged this week. Try the quick log above.</p>
          ) : (
            <>
              {chart.length > 0 && (
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chart} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-slate-100 dark:text-white/5" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={(x) => fmtDate(x, { day: "numeric", month: "short" })} tick={{ fontSize: 10 }} stroke="#94a3b8" />
                      <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                      <Tooltip labelFormatter={(x) => fmtDate(x as string)} formatter={(v) => [`${v} kcal`, "Calories"]} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                      <Bar dataKey="kcal" fill="#0d9488" radius={[6, 6, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="mt-3 max-h-80 divide-y divide-slate-100 overflow-y-auto text-sm dark:divide-white/5">
                {meals.data.items.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 py-2">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10"><Salad className="h-4 w-4" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{cap(m.meal_type)} <span className="text-xs font-normal muted">· {fmtDate(m.eaten_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span></p>
                      <p className="truncate text-xs muted">{m.items.map((i) => `${i.name}${i.servings !== 1 ? ` ×${fmtNum(i.servings, 2)}` : ""}`).join(", ")}</p>
                    </div>
                    <span className="font-bold">{Math.round(m.totals?.kcal ?? 0)} <span className="text-xs font-normal muted">kcal</span></span>
                    {m.is_demo && <span className="chip bg-slate-100 text-[10px] text-slate-500 dark:bg-white/10">demo</span>}
                    <button className="btn-ghost p-1.5 hover:text-red-600" aria-label="Delete meal" onClick={() => removeMeal(m.id)}><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="card p-5">
          <h2 className="mb-3 font-bold">Week averages</h2>
          {diet.error ? <ErrorBox msg={diet.error} /> : !diet.data ? <Spinner /> : !avg ? (
            <p className="py-6 text-center text-sm muted">Log a few meals to see your daily averages.</p>
          ) : (
            <>
              <p className="mb-3 text-xs muted">{diet.data.week.meals} meal(s) over {diet.data.week.days_logged} day(s) · per day, approx.</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {([["kcal", "Calories", "kcal"], ["carbs_g", "Carbs", "g"], ["protein_g", "Protein", "g"], ["fat_g", "Fat", "g"], ["fiber_g", "Fibre", "g"], ["sodium_mg", "Sodium", "mg"]] as const).map(([k, l, u]) => (
                  <div key={k} className="rounded-xl bg-slate-50 p-3 dark:bg-white/5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide muted">{l}</p>
                    <p className="text-xl font-extrabold text-ink dark:text-white">{Math.round(avg[k]).toLocaleString("en-IN")} <span className="text-xs font-medium muted">{u}</span></p>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider muted">Diet tips for {profile.name}</h2>
        {diet.error ? null : !diet.data ? <Spinner /> : !diet.data.tips.length ? (
          <Empty icon={<Lightbulb className="h-7 w-7" />} title="No tips yet" text="Add reports or log meals and DOC will suggest food ideas linked to your values." />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {diet.data.tips.map((t) => (
              <div key={t.id} className="card p-5">
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10"><Lightbulb className="h-5 w-5" /></div>
                  <div className="min-w-0">
                    <p className="font-bold">{t.title}</p>
                    <p className="mt-0.5 text-sm muted">{t.why}</p>
                  </div>
                </div>
                {!!t.try.length && (
                  <ul className="mt-3 space-y-1.5 text-sm">
                    {t.try.map((x) => <li key={x} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />{x}</li>)}
                  </ul>
                )}
                {!!t.swaps.length && (
                  <div className="mt-3 space-y-1.5">
                    {t.swaps.map((s) => (
                      <p key={s.instead_of} className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-900 dark:bg-brand-500/10 dark:text-brand-200">
                        Instead of <b>{s.instead_of}</b>, you could try {s.try.join(", ")}.
                      </p>
                    ))}
                  </div>
                )}
                {t.source && <p className="mt-3 flex gap-1 text-[11px] muted"><BookOpen className="mt-0.5 h-3 w-3 shrink-0" />{t.source}</p>}
              </div>
            ))}
          </div>
        )}
      </section>

      <Disclaimer text={diet.data?.disclaimer ?? "General healthy-eating information. It is not a diet prescription. Your doctor or a dietitian can set personal targets."} />
    </div>
  );
}
