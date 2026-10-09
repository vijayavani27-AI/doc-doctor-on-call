import { FileText, ExternalLink, FlaskConical, Pill, Languages, FileJson, PencilLine, Check, X, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api, openAuthed } from "../lib/api";
import { fmtDate, fmtNum, methodLabel } from "../lib/format";
import type { PlainSummary, Report } from "../lib/types";
import { useApp } from "../lib/store";
import { FlagChip, Modal, Spinner } from "./ui";
import { ExplainButton } from "./Explain";

/** Shows the source report for any value: every number in DOC links back here. */
export function ReportDrawer({ reportId, highlight, onClose }: { reportId: number | null; highlight?: number | null; onClose: () => void }) {
  const { bump, user } = useApp();
  const [rep, setRep] = useState<Report | null>(null);
  const [summary, setSummary] = useState<PlainSummary | null>(null);
  const [sumLang, setSumLang] = useState<"en" | "ta" | null>(null);
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setRep(null);
    setSummary(null);
    setSumLang(null);
    setEditing(false);
    setEdits({});
    setErr(null);
    if (reportId) api.get<Report>(`/reports/${reportId}`).then(setRep).catch(() => {});
  }, [reportId]);

  async function showSummary(lang: "en" | "ta") {
    if (!rep) return;
    setSumLang(lang);
    setSummary(await api.get<PlainSummary>(`/records/${rep.id}/summary?lang=${lang}`).catch(() => null));
  }

  async function saveFixes() {
    if (!rep) return;
    const items = Object.entries(edits).filter(([, v]) => v.trim()).map(([id, v]) => ({ id: Number(id), value_raw: v.trim() }));
    if (!items.length) return setEditing(false);
    setSaving(true);
    setErr(null);
    try {
      setRep(await api.put<Report>(`/records/${rep.id}`, { items }));
      setEditing(false);
      setEdits({});
      setSummary(null);
      bump();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const canEdit = rep?.status === "confirmed" && rep.kind === "lab" && !!rep.results?.length && !user?.is_demo;

  return (
    <Modal open={!!reportId} onClose={onClose} wide title={<span className="flex items-center gap-2"><FileText className="h-5 w-5 text-brand-600" /> Source report</span>}>
      {!rep ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 dark:bg-white/5">
            <div>
              <p className="font-bold">{rep.lab_name || rep.filename}</p>
              <p className="text-xs muted">
                {fmtDate(rep.report_date)} · {rep.kind === "lab" ? "Lab report" : "Prescription"} · read by {methodLabel(rep.method)}
                {rep.doctor_name ? ` · ${rep.doctor_name}` : ""}
                {rep.user_verified ? " · corrected by you" : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {rep.has_file ? (
                <button className="btn-outline py-2 text-xs" onClick={() => openAuthed(`/reports/${rep.id}/file`)}>
                  <ExternalLink className="h-4 w-4" /> Open original
                </button>
              ) : (
                <span className="chip bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-300">Demo data: no original file</span>
              )}
              <button className="btn-outline py-2 text-xs" onClick={() => openAuthed(`/records/${rep.id}/fhir`, `doc-record-${rep.id}.fhir.json`)} title="Standard health-record format (FHIR R4) for hospitals and ABDM">
                <FileJson className="h-4 w-4" /> FHIR
              </button>
            </div>
          </div>

          {rep.kind === "lab" && !!rep.results?.length && (
            <div className="flex flex-wrap items-center gap-2">
              <button className={`btn-ghost py-1.5 text-xs ${sumLang === "en" ? "text-brand-700 dark:text-brand-300" : ""}`} onClick={() => showSummary("en")}><Languages className="h-3.5 w-3.5" /> Simple summary</button>
              <button className={`btn-ghost py-1.5 text-xs ${sumLang === "ta" ? "text-brand-700 dark:text-brand-300" : ""}`} onClick={() => showSummary("ta")}><Languages className="h-3.5 w-3.5" /> தமிழில்</button>
              {canEdit && !editing && <button className="btn-ghost py-1.5 text-xs" onClick={() => setEditing(true)}><PencilLine className="h-3.5 w-3.5" /> Fix a value</button>}
              {editing && (
                <>
                  <button className="btn-primary py-1.5 text-xs" onClick={saveFixes} disabled={saving}>{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save fixes</button>
                  <button className="btn-ghost py-1.5 text-xs" onClick={() => { setEditing(false); setEdits({}); }}><X className="h-3.5 w-3.5" /> Cancel</button>
                </>
              )}
            </div>
          )}
          {err && <p className="text-sm font-medium text-red-600">{err}</p>}
          {summary && (
            <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-3 text-sm dark:border-brand-500/20 dark:bg-brand-500/10">
              <p className="font-semibold">{summary.headline}</p>
              <ul className="mt-2 space-y-1">{summary.lines.map((l) => <li key={l.result_id} className={l.flag.startsWith("critical") ? "font-semibold text-red-700 dark:text-red-300" : ""}>• {l.text}</li>)}</ul>
              <p className="mt-2 text-xs muted">{summary.disclaimer}</p>
            </div>
          )}

          {!!rep.results?.length && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide muted">
                    <th className="py-2 pr-3"><FlaskConical className="inline h-3.5 w-3.5" /> Test</th>
                    <th className="py-2 pr-3">Result</th>
                    <th className="py-2 pr-3">As printed</th>
                    <th className="py-2 pr-3">Range</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rep.results.map((r) => (
                    <tr key={r.id} className={`border-t border-slate-100 dark:border-white/5 ${highlight === r.id ? "bg-amber-50 dark:bg-amber-500/10" : ""}`}>
                      <td className="py-2 pr-3 font-medium">
                        {r.test_name}
                        {r.needs_review && <span className="chip ml-1.5 bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">Check this</span>}
                        {r.user_verified && <span className="chip ml-1.5 bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300">Corrected</span>}
                      </td>
                      <td className="py-2 pr-3 font-semibold whitespace-nowrap">
                        {editing ? (
                          <input className="input w-24 py-1 text-sm" defaultValue={r.value_raw ?? ""} onChange={(e) => setEdits({ ...edits, [r.id]: e.target.value })} aria-label={`New value for ${r.test_name}`} />
                        ) : (
                          <>{fmtNum(r.value)} <span className="text-xs muted">{r.unit}</span> <FlagChip flag={r.flag} computed={r.flag_computed} /></>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-xs muted whitespace-nowrap">{r.value_raw} {r.unit_raw}</td>
                      <td className="py-2 pr-3 text-xs muted whitespace-nowrap">{r.ref_low ?? ""}–{r.ref_high ?? ""}</td>
                      <td className="py-2 text-right">{r.confirmed && <ExplainButton kind="result" id={r.id} small />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {editing && <p className="mt-2 text-xs muted">Type the number exactly as printed on your report. Units, ranges and flags are recalculated automatically.</p>}
            </div>
          )}
          {!!rep.medicines?.length && (
            <div className="space-y-2">
              {rep.medicines.map((m) => (
                <div key={m.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 dark:border-white/10">
                  <Pill className="h-4 w-4 text-violet-500" />
                  <div className="text-sm"><b>{m.brand}</b> <span className="muted">{m.generic} · {m.dose} · {m.frequency}</span></div>
                </div>
              ))}
            </div>
          )}
          {highlight && rep.results?.find((r) => r.id === highlight)?.source_text && (
            <p className="rounded-lg bg-slate-900 p-3 font-mono text-xs text-emerald-200">“{rep.results.find((r) => r.id === highlight)!.source_text}”</p>
          )}
        </div>
      )}
    </Modal>
  );
}
