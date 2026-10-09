import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ClipboardCheck, Trash2, Plus, ExternalLink, AlertTriangle, CheckCircle2, Pill, FlaskConical, EyeOff, Sparkles, Pencil, ArrowLeft } from "lucide-react";
import { api, getToken, openAuthed } from "../lib/api";
import { useApp, useFetch } from "../lib/store";
import { fmtDate, fmtNum, methodLabel } from "../lib/format";
import type { Meta, Report } from "../lib/types";
import { ConfidenceBadge, ErrorBox, FlagChip, PageHeader, Spinner } from "../components/ui";
import { ExplainButton } from "../components/Explain";

interface Row { key: string; test_code: string | null; test_name_raw: string; value_raw: string; unit_raw: string; ref_low: string; ref_high: string; confidence: number; source_text: string | null; value?: number | null; unit?: string | null }
interface MedRow { key: string; brand: string; dose: string; frequency: string; start_date: string; reason: string; confidence: number; source_text: string | null; matched: boolean; generic: string | null }

let k = 0;
const nk = () => `r${++k}`;

export default function ReviewPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { bump, refreshProfiles } = useApp();
  const { data: rep, error } = useFetch<Report>(`/reports/${id}`);
  const { data: meta } = useFetch<Meta>("/meta");
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [meds, setMeds] = useState<MedRow[]>([]);
  const [head, setHead] = useState({ kind: "lab", lab_name: "", doctor_name: "", report_date: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; pdf: boolean } | null>(null);

  useEffect(() => {
    if (!rep) return;
    setEditing(rep.status === "review");
    setHead({ kind: rep.kind, lab_name: rep.lab_name ?? "", doctor_name: rep.doctor_name ?? "", report_date: rep.report_date ?? "" });
    setRows((rep.results ?? []).map((r) => ({
      key: nk(), test_code: r.test_code, test_name_raw: r.test_name_raw, value_raw: r.value_raw ?? String(r.value ?? ""), unit_raw: r.unit_raw ?? "",
      ref_low: r.ref_low?.toString() ?? "", ref_high: r.ref_high?.toString() ?? "", confidence: r.confidence, source_text: r.source_text, value: r.value, unit: r.unit,
    })));
    const drafts = rep.status === "review" ? rep.draft_medicines ?? [] : (rep.medicines ?? []).map((m) => ({ ...m, duration: null, confidence: 1, matched: true }));
    setMeds(drafts.map((m) => ({
      key: nk(), brand: m.brand, dose: m.dose ?? "", frequency: m.frequency ?? "", start_date: ("start_date" in m && (m as { start_date?: string }).start_date) || rep.report_date || "",
      reason: ("reason" in m && (m as { reason?: string }).reason) || "", confidence: m.confidence, source_text: m.source_text, matched: m.matched, generic: m.generic,
    })));
  }, [rep]);

  useEffect(() => {
    let url: string | null = null;
    if (rep?.has_file && (rep.mime?.startsWith("image/") || rep.mime === "application/pdf")) {
      fetch(`/api/reports/${rep.id}/file`, { headers: { Authorization: `Bearer ${getToken()}` } })
        .then((r) => r.blob()).then((b) => { url = URL.createObjectURL(b); setPreview({ url, pdf: rep.mime === "application/pdf" }); }).catch(() => {});
    }
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [rep]);

  const tests = useMemo(() => meta?.tests ?? [], [meta]);
  const lowConf = rows.filter((r) => r.confidence < 0.75).length + meds.filter((m) => m.confidence < 0.75).length;

  if (error) return <ErrorBox msg={error} />;
  if (!rep) return <Spinner />;

  const upd = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch, confidence: 1 } : r)));
  const updMed = (key: string, patch: Partial<MedRow>) => setMeds((ms) => ms.map((m) => (m.key === key ? { ...m, ...patch, confidence: 1 } : m)));

  async function save() {
    if (!head.report_date) return setErr("Please set the report date.");
    setSaving(true);
    setErr(null);
    try {
      await api.post(`/reports/${rep!.id}/confirm`, {
        ...head,
        tests: rows.filter((r) => r.value_raw.trim()).map((r) => ({
          test_code: r.test_code, test_name_raw: r.test_name_raw || tests.find((t) => t.code === r.test_code)?.name || "Test",
          value_raw: r.value_raw, unit_raw: r.unit_raw || null, source_text: r.source_text,
          ref_low: r.ref_low === "" ? null : Number(r.ref_low), ref_high: r.ref_high === "" ? null : Number(r.ref_high),
        })),
        medicines: meds.filter((m) => m.brand.trim()).map((m) => ({ brand: m.brand, dose: m.dose || null, frequency: m.frequency || null, start_date: m.start_date || null, reason: m.reason || null, source_text: m.source_text })),
      });
      bump();
      await refreshProfiles();
      nav("/app/risks");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this report and its values? This cannot be undone.")) return;
    await api.del(`/reports/${rep!.id}`);
    bump();
    await refreshProfiles();
    nav("/app/records");
  }

  return (
    <div>
      <button className="btn-ghost -ml-3 mb-2 text-xs" onClick={() => nav("/app/records")}><ArrowLeft className="h-4 w-4" /> Records</button>
      <PageHeader
        icon={<ClipboardCheck className="h-6 w-6" />}
        title={rep.status === "review" ? "Check what we read" : rep.lab_name || "Report"}
        subtitle={rep.status === "review" ? "Correct anything that looks wrong, then save. Highlighted rows need your eye." : `${fmtDate(rep.report_date)} · confirmed`}
        right={
          <div className="flex gap-2">
            {rep.has_file && <button className="btn-outline" onClick={() => openAuthed(`/reports/${rep.id}/file`)}><ExternalLink className="h-4 w-4" /> Original</button>}
            {!editing && <button className="btn-outline" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Edit</button>}
            <button className="btn-ghost text-red-600" onClick={remove} aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        <span className="chip bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200"><Sparkles className="h-3 w-3" /> Read by {methodLabel(rep.method)}</span>
        {!!rep.redactions && <span className="chip bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"><EyeOff className="h-3 w-3" /> {rep.redactions} personal detail(s) removed before AI</span>}
        {lowConf > 0 && editing && <span className="chip bg-amber-100 text-amber-800"><AlertTriangle className="h-3 w-3" /> {lowConf} to check</span>}
      </div>
      {rep.warnings?.filter((w) => !w.includes("need your confirmation")).map((w) => <p key={w} className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">{w}</p>)}

      <div className={`grid gap-6 ${preview ? "xl:grid-cols-[1fr_380px]" : ""}`}>
        <div className="space-y-6">
          <section className="card grid gap-3 p-5 sm:grid-cols-4">
            <div><label className="label">Type</label>
              <select disabled={!editing} className="input" value={head.kind} onChange={(e) => setHead({ ...head, kind: e.target.value })}><option value="lab">Lab report</option><option value="prescription">Prescription</option></select></div>
            <div><label className="label">Date</label><input disabled={!editing} type="date" className="input" value={head.report_date} onChange={(e) => setHead({ ...head, report_date: e.target.value })} /></div>
            <div><label className="label">Lab / clinic</label><input disabled={!editing} className="input" value={head.lab_name} onChange={(e) => setHead({ ...head, lab_name: e.target.value })} /></div>
            <div><label className="label">Doctor</label><input disabled={!editing} className="input" value={head.doctor_name} onChange={(e) => setHead({ ...head, doctor_name: e.target.value })} /></div>
          </section>

          {(head.kind === "lab" || rows.length > 0) && (
            <section className="card p-5">
              <h2 className="mb-3 flex items-center gap-2 font-bold"><FlaskConical className="h-5 w-5 text-brand-600" /> Test results ({rows.length})</h2>
              {editing && (
                <div className="mb-1 hidden gap-2 px-3 text-[11px] font-bold uppercase tracking-wide muted sm:grid sm:grid-cols-[2fr_1fr_1fr_0.8fr_0.8fr_auto]">
                  <span>Test</span><span>Value (as printed)</span><span>Unit (as printed)</span><span>Normal low</span><span>Normal high</span><span className="w-8" />
                </div>
              )}
              <div className="space-y-2">
                {rows.map((r) => (
                  <div key={r.key} className={`rounded-xl border p-3 ${r.confidence < 0.75 ? "border-amber-300 bg-amber-50/70 dark:border-amber-500/40 dark:bg-amber-500/10" : "border-slate-200 dark:border-white/10"}`}>
                    {editing ? (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr_1fr_0.8fr_0.8fr_auto]">
                        <select className="input col-span-2 sm:col-span-1" value={r.test_code ?? ""} onChange={(e) => upd(r.key, { test_code: e.target.value || null })}>
                          <option value="">⚠ Not recognised: {r.test_name_raw}</option>
                          {tests.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
                        </select>
                        <input className="input" placeholder="Value" value={r.value_raw} onChange={(e) => upd(r.key, { value_raw: e.target.value })} />
                        <input className="input" placeholder="Unit" value={r.unit_raw} onChange={(e) => upd(r.key, { unit_raw: e.target.value })} />
                        <input className="input" placeholder="Low" value={r.ref_low} onChange={(e) => upd(r.key, { ref_low: e.target.value })} />
                        <input className="input" placeholder="High" value={r.ref_high} onChange={(e) => upd(r.key, { ref_high: e.target.value })} />
                        <button className="btn-ghost p-2 text-slate-400 hover:text-red-600" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold">{tests.find((t) => t.code === r.test_code)?.name ?? r.test_name_raw}</p>
                        <div className="flex items-center gap-2 text-sm">
                          <b>{fmtNum(r.value ?? null)}</b> <span className="text-xs muted">{r.unit}</span>
                          <FlagChip flag={rep.results?.find((x) => x.test_name_raw === r.test_name_raw)?.flag} />
                          {rep.results?.find((x) => x.test_name_raw === r.test_name_raw)?.confirmed && <ExplainButton kind="result" id={rep.results!.find((x) => x.test_name_raw === r.test_name_raw)!.id} small />}
                        </div>
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] muted">
                      {editing && <ConfidenceBadge value={r.confidence} />}
                      {r.unit && r.unit_raw && r.unit !== r.unit_raw && <span>→ stored as {fmtNum(r.value ?? null)} {r.unit}</span>}
                      {r.source_text && <span className="truncate font-mono">“{r.source_text}”</span>}
                    </div>
                  </div>
                ))}
              </div>
              {editing && (
                <button className="btn-ghost mt-3 text-brand-700" onClick={() => setRows((rs) => [...rs, { key: nk(), test_code: null, test_name_raw: "", value_raw: "", unit_raw: "", ref_low: "", ref_high: "", confidence: 1, source_text: null }])}>
                  <Plus className="h-4 w-4" /> Add a test manually
                </button>
              )}
            </section>
          )}

          {(head.kind === "prescription" || meds.length > 0) && (
            <section className="card p-5">
              <h2 className="mb-3 flex items-center gap-2 font-bold"><Pill className="h-5 w-5 text-violet-500" /> Medicines ({meds.length})</h2>
              <div className="space-y-2">
                {meds.map((m) => (
                  <div key={m.key} className={`rounded-xl border p-3 ${m.confidence < 0.75 ? "border-amber-300 bg-amber-50/70 dark:bg-amber-500/10" : "border-slate-200 dark:border-white/10"}`}>
                    {editing ? (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1.5fr_1fr_1fr_1fr_auto]">
                        <input className="input col-span-2 sm:col-span-1" placeholder="Medicine name" value={m.brand} onChange={(e) => updMed(m.key, { brand: e.target.value })} />
                        <input className="input" placeholder="Dose" value={m.dose} onChange={(e) => updMed(m.key, { dose: e.target.value })} />
                        <input className="input" placeholder="1-0-1" value={m.frequency} onChange={(e) => updMed(m.key, { frequency: e.target.value })} />
                        <input className="input" type="date" value={m.start_date} onChange={(e) => updMed(m.key, { start_date: e.target.value })} />
                        <button className="btn-ghost p-2 text-slate-400 hover:text-red-600" onClick={() => setMeds((ms) => ms.filter((x) => x.key !== m.key))} aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    ) : (
                      <p className="text-sm"><b>{m.brand}</b> <span className="muted">{m.generic} · {m.dose} · {m.frequency} · from {fmtDate(m.start_date)}</span></p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] muted">
                      {editing && <ConfidenceBadge value={m.confidence} />}
                      {m.generic && <span>= {m.generic}</span>}
                      {!m.matched && editing && <span className="text-amber-700">not in our medicine list, still saved</span>}
                    </div>
                  </div>
                ))}
              </div>
              {editing && <button className="btn-ghost mt-3 text-brand-700" onClick={() => setMeds((ms) => [...ms, { key: nk(), brand: "", dose: "", frequency: "", start_date: head.report_date, reason: "", confidence: 1, source_text: null, matched: true, generic: null }])}><Plus className="h-4 w-4" /> Add a medicine</button>}
            </section>
          )}
        </div>
        {preview && (
          <aside className="card sticky top-20 hidden h-[75vh] overflow-hidden p-2 xl:block">
            {preview.pdf ? <iframe title="Original report" src={preview.url} className="h-full w-full rounded-xl" /> : <img src={preview.url} alt="Uploaded report" className="w-full rounded-xl" />}
          </aside>
        )}
      </div>

      {editing && (
        <div className="sticky bottom-20 z-10 mt-6 lg:bottom-4">
          <div className="card flex flex-wrap items-center justify-between gap-3 p-4 shadow-lift">
            <p className="text-sm">{err ? <span className="font-semibold text-red-600">{err}</span> : <><CheckCircle2 className="mr-1 inline h-4 w-4 text-emerald-500" /> Saving will update your timeline and re-run the Hidden Disease Finder.</>}</p>
            <button className="btn-primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Confirm & save"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
