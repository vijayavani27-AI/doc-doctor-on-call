import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Clock, Lock } from "lucide-react";
import { fmtDate } from "../lib/format";
import { Logo, Spinner } from "../components/ui";
import { SummaryView, type Summary } from "../components/SummaryView";

export default function SharedSummary() {
  const { token } = useParams();
  const [data, setData] = useState<Summary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/public/share/${token}`).then(async (r) => (r.ok ? setData(await r.json()) : setErr((await r.json()).detail))).catch(() => setErr("Could not load"));
  }, [token]);
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2"><Logo /><span className="font-extrabold">DOC <span className="text-xs font-semibold muted">Doctor On Call</span></span></div>
        {data?.expires_at && <span className="chip bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300"><Clock className="h-3 w-3" /> Link expires {fmtDate(data.expires_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>}
      </div>
      {err ? <div className="card p-10 text-center"><Lock className="mx-auto h-8 w-8 muted" /><p className="mt-3 font-bold">{err}</p><p className="text-sm muted">Ask the patient to share a new link.</p></div> : data ? <SummaryView s={data} /> : <Spinner />}
    </div>
  );
}
