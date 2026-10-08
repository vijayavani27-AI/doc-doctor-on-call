import { useState, type FormEvent } from "react";
import { Pill, IndianRupee, Plus, Thermometer, Trash2, Ban, GitPullRequestArrow, Droplet, FlaskConical, Clock, BookOpen } from "lucide-react";
import { api } from "../lib/api";
import { useApp, useFetch } from "../lib/store";
import { fmtDate } from "../lib/format";
import type { Alert } from "../lib/types";
import { Disclaimer, ErrorBox, LevelIcon, Modal, PageHeader, Spinner } from "../components/ui";
import { t } from "../lib/i18n";

interface Med {
  id: number; brand: string; generic: string | null; class: string | null; dose: string | null; frequency: string | null; start_date: string | null;
  active: boolean; reason: string | null; use: string | null; side_effects: string[]; brand_price: number | null; generic_price: number | null; yearly_saving: number | null; alerts: Alert[];
}
interface MedData { medicines: Med[]; yearly_saving_total: number; alerts: Alert[]; symptom_options: { key: string; label: string }[]; price_note: string }
interface Sym { id: number; key: string; label: string; onset_date: string; severity: number; notes: string | null }

const TYPE_META: Record<string, { icon: typeof Pill; label: string }> = {
  cascade: { icon: GitPullRequestArrow, label: "Prescribing cascade" },
  kidney_med: { icon: Droplet, label: "Kidney safety" },
  monitoring: { icon: FlaskConical, label: "Monitoring due" },
  side_effect: { icon: Clock, label: "Side-effect timing" },
  iron: { icon: Droplet, label: "Not working?" },
};

export default function Medicines() {
  const { profile, lang, bump } = useApp();
  const { data, error } = useFetch<MedData>(profile ? `/profiles/${profile.id}/medicines` : null);
  const syms = useFetch<Sym[]>(profile ? `/profiles/${profile.id}/symptoms` : null);
  const [addMed, setAddMed] = useState(false);
  const [addSym, setAddSym] = useState(false);
  const [mf, setMf] = useState({ brand: "", dose: "", frequency: "", start_date: new Date().toISOString().slice(0, 10), reason: "" });
  const [sf, setSf] = useState({ key: "", onset_date: new Date().toISOString().slice(0, 10), severity: 2, notes: "" });

  if (error) return <ErrorBox msg={error} />;
  if (!data || !profile) return <Spinner />;
  const active = data.medicines.filter((m) => m.active);
  const past = data.medicines.filter((m) => !m.active);

  async function saveMed(e: FormEvent) {
    e.preventDefault();
    await api.post(`/profiles/${profile!.id}/medicines`, { ...mf, dose: mf.dose || null, frequency: mf.frequency || null, reason: mf.reason || null });
    setAddMed(false);
    setMf({ ...mf, brand: "", dose: "", frequency: "", reason: "" });
    bump();
  }
  async function saveSym(e: FormEvent) {
    e.preventDefault();
    await api.post(`/profiles/${profile!.id}/symptoms`, { ...sf, notes: sf.notes || null });
    setAddSym(false);
    bump();
  }

  return (
    <div>
      <PageHeader icon={<Pill className="h-6 w-6" />} title="Medicines" subtitle="Your medicines checked against your kidneys, your symptoms and each other, plus cheaper generic options."
        right={<button className="btn-primary" onClick={() => setAddMed(true)}><Plus className="h-4 w-4" /> Add medicine</button>} />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="card p-5"><p className="text-xs font-semibold muted">Active medicines</p><p className="text-3xl font-extrabold">{active.length}</p></div>
        <div className="card p-5"><p className="text-xs font-semibold muted">Safety checks raised</p><p className="text-3xl font-extrabold text-amber-600">{data.alerts.length}</p></div>
        <div className="card bg-gradient-to-br from-emerald-50 to-white p-5 dark:from-emerald-500/10 dark:to-transparent">
          <p className="flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300"><IndianRupee className="h-3.5 w-3.5" /> Possible yearly saving with generics</p>
          <p className="text-3xl font-extrabold text-emerald-700 dark:text-emerald-300">₹{data.yearly_saving_total.toLocaleString("en-IN")}</p>
          <p className="text-[10px] muted">{data.price_note}</p>
        </div>
      </div>

      {!!data.alerts.length && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider muted">Safety checks</h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {data.alerts.map((a) => {
              const M = TYPE_META[a.type] ?? { icon: Pill, label: a.type };
              return (
                <div key={a.id} className={`card p-5 ${a.level === "red" ? "border-red-200 dark:border-red-500/30" : ""}`}>
                  <div className="mb-2 flex items-center gap-2">
                    <LevelIcon level={a.level} />
                    <span className="chip bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200"><M.icon className="h-3 w-3" /> {M.label}</span>
                  </div>
                  <p className="font-bold">{a.title}</p>
                  <p className="mt-1 text-sm muted">{a.text}</p>
                  {a.action && <p className="mt-3 rounded-xl bg-brand-50 p-3 text-sm font-medium text-brand-900 dark:bg-brand-500/10 dark:text-brand-200">💬 Ask your doctor: “{a.action}”</p>}
                  {a.citation && <p className="mt-2 flex gap-1 text-[11px] muted"><BookOpen className="mt-0.5 h-3 w-3 shrink-0" />{a.citation}</p>}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider muted">Current medicines</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {active.map((m) => (
            <div key={m.id} className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-2xl bg-violet-50 text-violet-600 dark:bg-violet-500/10"><Pill className="h-5 w-5" /></div>
                  <div>
                    <p className="font-bold">{m.brand} <span className="text-sm font-medium muted">{m.dose}</span></p>
                    <p className="text-sm muted">{m.generic ?? "Unknown salt"}{m.use ? ` · for ${m.use}` : ""}</p>
                    <p className="mt-1 text-xs muted">{m.frequency && <b className="mr-2 font-mono">{m.frequency}</b>}since {fmtDate(m.start_date)}{m.reason ? ` · ${m.reason}` : ""}</p>
                  </div>
                </div>
                <div className="flex">
                  <button className="btn-ghost p-2" title="Mark as stopped" onClick={async () => { await api.patch(`/medicines/${m.id}`, { active: false }); bump(); }}><Ban className="h-4 w-4" /></button>
                  <button className="btn-ghost p-2 hover:text-red-600" title="Delete" onClick={async () => { if (confirm(`Delete ${m.brand}?`)) { await api.del(`/medicines/${m.id}`); bump(); } }}><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
              {!!m.side_effects.length && <p className="mt-3 text-xs"><span className="font-semibold">Watch for:</span> <span className="muted">{m.side_effects.join(", ")}</span></p>}
              {m.yearly_saving !== null && m.yearly_saving > 0 && (
                <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">
                  Generic {m.generic}: ~₹{m.generic_price} vs ₹{m.brand_price} per 10 → save about <b>₹{m.yearly_saving.toLocaleString("en-IN")}/year</b>. Ask your doctor or pharmacist before switching.
                </p>
              )}
              {m.alerts.map((a) => <p key={a.id} className="mt-2 flex items-start gap-1.5 text-xs"><LevelIcon level={a.level} className="h-3.5 w-3.5 shrink-0" /> {a.title}</p>)}
            </div>
          ))}
        </div>
        {!active.length && <p className="text-sm muted">No active medicines. Upload a prescription or add one.</p>}
        {!!past.length && <p className="mt-3 text-xs muted">Stopped: {past.map((m) => m.brand).join(", ")}</p>}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider muted">Symptom diary</h2>
          <button className="btn-outline py-2 text-xs" onClick={() => setAddSym(true)}><Thermometer className="h-4 w-4" /> Log a symptom</button>
        </div>
        <p className="mb-3 text-xs muted">Logging when a symptom started lets DOC check whether it began soon after a new medicine.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {(syms.data ?? []).map((s) => (
            <div key={s.id} className="card flex items-center gap-3 p-3">
              <Thermometer className="h-5 w-5 text-rose-500" />
              <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{s.label}</p><p className="truncate text-xs muted">{fmtDate(s.onset_date)}{s.notes ? ` · ${s.notes}` : ""}</p></div>
              <button className="btn-ghost p-2 hover:text-red-600" onClick={async () => { await api.del(`/symptoms/${s.id}`); bump(); }} aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      </section>

      <Modal open={addMed} onClose={() => setAddMed(false)} title="Add a medicine">
        <form onSubmit={saveMed} className="space-y-3">
          <div><label className="label">Name (brand or generic)</label><input className="input" required placeholder="e.g. Glycomet 500" value={mf.brand} onChange={(e) => setMf({ ...mf, brand: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Dose</label><input className="input" placeholder="500 mg" value={mf.dose} onChange={(e) => setMf({ ...mf, dose: e.target.value })} /></div>
            <div><label className="label">How often</label><input className="input" placeholder="1-0-1" value={mf.frequency} onChange={(e) => setMf({ ...mf, frequency: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Started on</label><input type="date" className="input" value={mf.start_date} onChange={(e) => setMf({ ...mf, start_date: e.target.value })} /></div>
            <div><label className="label">For</label><input className="input" placeholder="Diabetes" value={mf.reason} onChange={(e) => setMf({ ...mf, reason: e.target.value })} /></div>
          </div>
          <button className="btn-primary w-full">Save</button>
        </form>
      </Modal>
      <Modal open={addSym} onClose={() => setAddSym(false)} title="Log a symptom">
        <form onSubmit={saveSym} className="space-y-3">
          <div><label className="label">Symptom</label>
            <select className="input" required value={sf.key} onChange={(e) => setSf({ ...sf, key: e.target.value })}>
              <option value="">Choose…</option>
              {data.symptom_options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Started on</label><input type="date" className="input" value={sf.onset_date} onChange={(e) => setSf({ ...sf, onset_date: e.target.value })} /></div>
            <div><label className="label">How bad</label>
              <select className="input" value={sf.severity} onChange={(e) => setSf({ ...sf, severity: Number(e.target.value) })}><option value={1}>Mild</option><option value={2}>Moderate</option><option value={3}>Severe</option></select></div>
          </div>
          <div><label className="label">Notes</label><input className="input" value={sf.notes} onChange={(e) => setSf({ ...sf, notes: e.target.value })} /></div>
          <button className="btn-primary w-full">Save</button>
        </form>
      </Modal>
      <Disclaimer text={`${t("notDoctor", lang)} Never stop or change a medicine without talking to your doctor.`} />
    </div>
  );
}
