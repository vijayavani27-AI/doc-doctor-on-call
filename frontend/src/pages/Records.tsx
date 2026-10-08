import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FolderOpen, Search, FileText, Pill, ClipboardCheck, FlaskConical, Upload } from "lucide-react";
import { useApp, useFetch } from "../lib/store";
import { fmtDate, fmtNum } from "../lib/format";
import type { LabResult, Report } from "../lib/types";
import { Empty, ErrorBox, FlagChip, PageHeader, Spinner } from "../components/ui";
import { ExplainButton } from "../components/Explain";
import { ReportDrawer } from "../components/ReportDrawer";

export default function Records() {
  const { profile } = useApp();
  const [tab, setTab] = useState<"reports" | "results">("reports");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "lab" | "prescription" | "review">("all");
  const [src, setSrc] = useState<{ report: number; result: number } | null>(null);
  const reports = useFetch<Report[]>(profile ? `/profiles/${profile.id}/reports` : null);
  const results = useFetch<LabResult[]>(profile && tab === "results" ? `/profiles/${profile.id}/results` : null);

  const shownReports = useMemo(() => (reports.data ?? []).filter((r) =>
    (filter === "all" || (filter === "review" ? r.status === "review" : r.kind === filter)) &&
    (!q || `${r.lab_name} ${r.filename} ${r.doctor_name}`.toLowerCase().includes(q.toLowerCase()))), [reports.data, filter, q]);
  const shownResults = useMemo(() => (results.data ?? []).filter((r) => !q || `${r.test_name} ${r.test_name_raw} ${r.category}`.toLowerCase().includes(q.toLowerCase())), [results.data, q]);

  if (reports.error) return <ErrorBox msg={reports.error} />;

  return (
    <div>
      <PageHeader icon={<FolderOpen className="h-6 w-6" />} title="Health records" subtitle="Every report and value in one place. Every number links back to the line it came from." right={<Link to="/app/upload" className="btn-primary"><Upload className="h-4 w-4" /> Add</Link>} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-white/5">
          {(["reports", "results"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-4 py-1.5 text-sm font-semibold capitalize ${tab === t ? "bg-white shadow-sm dark:bg-white/10" : "muted"}`}>{t === "results" ? "All values" : "Reports"}</button>
          ))}
        </div>
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 muted" />
          <input className="input pl-9" placeholder={tab === "reports" ? "Search lab, doctor…" : "Search a test, e.g. sugar, HbA1c, platelets"} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {tab === "reports" && (
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {(["all", "lab", "prescription", "review"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`chip whitespace-nowrap px-3 py-1.5 capitalize ${filter === f ? "bg-brand-600 text-white" : "bg-white text-slate-600 shadow-sm dark:bg-white/5 dark:text-slate-300"}`}>{f === "review" ? "Needs review" : f}</button>
            ))}
          </div>
        )}
      </div>

      {tab === "reports" ? (
        !reports.data ? <Spinner /> : !shownReports.length ? (
          <Empty icon={<FileText className="h-7 w-7" />} title="No reports yet" text="Upload lab reports and prescriptions to build your health history." action={<Link to="/app/upload" className="btn-primary">Upload</Link>} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {shownReports.map((r) => (
              <Link key={r.id} to={`/app/records/${r.id}`} className="card flex items-center gap-4 p-4 transition hover:-translate-y-0.5 hover:shadow-lift">
                <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${r.kind === "lab" ? "bg-brand-50 text-brand-600 dark:bg-brand-500/10" : "bg-violet-50 text-violet-600 dark:bg-violet-500/10"}`}>
                  {r.kind === "lab" ? <FlaskConical className="h-6 w-6" /> : <Pill className="h-6 w-6" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{r.lab_name || r.filename}</p>
                  <p className="text-xs muted">{fmtDate(r.report_date)} · {r.kind === "lab" ? `${r.n_results} tests` : `${r.n_medicines} medicines`}{r.doctor_name ? ` · ${r.doctor_name}` : ""}</p>
                </div>
                {r.status === "review" ? <span className="chip bg-amber-100 text-amber-800"><ClipboardCheck className="h-3 w-3" /> Review</span>
                  : r.n_abnormal > 0 ? <span className="chip bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300">{r.n_abnormal} out of range</span>
                  : r.kind === "lab" ? <span className="chip bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">All in range</span> : null}
              </Link>
            ))}
          </div>
        )
      ) : !results.data ? <Spinner /> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide muted">
              <tr><th className="p-3">Test</th><th className="p-3">Value</th><th className="p-3">As printed</th><th className="p-3">Range</th><th className="p-3">Date</th><th className="p-3" /></tr>
            </thead>
            <tbody>
              {shownResults.map((r) => (
                <tr key={r.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50 dark:border-white/5 dark:hover:bg-white/5" onClick={() => setSrc({ report: r.report_id, result: r.id })}>
                  <td className="p-3"><p className="font-semibold">{r.test_name}</p><p className="text-[11px] muted">{r.category}{r.loinc ? ` · LOINC ${r.loinc}` : ""}</p></td>
                  <td className="whitespace-nowrap p-3 font-bold">{fmtNum(r.value)} <span className="text-xs font-normal muted">{r.unit}</span> <FlagChip flag={r.flag} /></td>
                  <td className="whitespace-nowrap p-3 text-xs muted">{r.value_raw} {r.unit_raw}</td>
                  <td className="whitespace-nowrap p-3 text-xs muted">{r.ref_low ?? ""}–{r.ref_high ?? ""}</td>
                  <td className="whitespace-nowrap p-3 text-xs">{fmtDate(r.date)}</td>
                  <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}><ExplainButton kind="result" id={r.id} small /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ReportDrawer reportId={src?.report ?? null} highlight={src?.result} onClose={() => setSrc(null)} />
    </div>
  );
}
