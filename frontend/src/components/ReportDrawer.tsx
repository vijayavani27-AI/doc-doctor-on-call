import { FileText, ExternalLink, FlaskConical, Pill } from "lucide-react";
import { useEffect, useState } from "react";
import { api, openAuthed } from "../lib/api";
import { fmtDate, fmtNum, methodLabel } from "../lib/format";
import type { Report } from "../lib/types";
import { FlagChip, Modal, Spinner } from "./ui";
import { ExplainButton } from "./Explain";

/** Shows the source report for any value: every number in DOC links back here. */
export function ReportDrawer({ reportId, highlight, onClose }: { reportId: number | null; highlight?: number | null; onClose: () => void }) {
  const [rep, setRep] = useState<Report | null>(null);
  useEffect(() => {
    setRep(null);
    if (reportId) api.get<Report>(`/reports/${reportId}`).then(setRep).catch(() => {});
  }, [reportId]);

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
              </p>
            </div>
            {rep.has_file ? (
              <button className="btn-outline py-2 text-xs" onClick={() => openAuthed(`/reports/${rep.id}/file`)}>
                <ExternalLink className="h-4 w-4" /> Open original
              </button>
            ) : (
              <span className="chip bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-300">Demo data: no original file</span>
            )}
          </div>
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
                      <td className="py-2 pr-3 font-medium">{r.test_name}</td>
                      <td className="py-2 pr-3 font-semibold whitespace-nowrap">{fmtNum(r.value)} <span className="text-xs muted">{r.unit}</span> <FlagChip flag={r.flag} /></td>
                      <td className="py-2 pr-3 text-xs muted whitespace-nowrap">{r.value_raw} {r.unit_raw}</td>
                      <td className="py-2 pr-3 text-xs muted whitespace-nowrap">{r.ref_low ?? ""}–{r.ref_high ?? ""}</td>
                      <td className="py-2 text-right">{r.confirmed && <ExplainButton kind="result" id={r.id} small />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
