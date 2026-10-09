import { useState } from "react";
import { Stethoscope, Download, Link2, Copy, Check, Printer, XCircle, Clock } from "lucide-react";
import { api, openAuthed } from "../lib/api";
import { useApp, useFetch } from "../lib/store";
import { fmtDate } from "../lib/format";
import { ErrorBox, Modal, PageHeader, Spinner } from "../components/ui";
import { SummaryView, type Summary } from "../components/SummaryView";

interface Share { id: number; token: string; expires_at: string; views: number; active: boolean; revoked: boolean }

export default function Doctor() {
  const { profile } = useApp();
  const { data, error } = useFetch<Summary>(profile ? `/profiles/${profile.id}/doctor-summary` : null);
  const shares = useFetch<Share[]>(profile ? `/profiles/${profile.id}/shares` : null);
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState(24);
  const [made, setMade] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [dl, setDl] = useState(false);

  if (error) return <ErrorBox msg={error} />;
  if (!data || !profile) return <Spinner label="Preparing the summary…" />;
  const url = (token: string) => `${location.origin}/share/${token}`;

  async function create() {
    const s = await api.post<Share>(`/profiles/${profile!.id}/shares`, { hours });
    setMade(url(s.token));
    shares.reload();
  }

  return (
    <div>
      <div className="print:hidden">
        <PageHeader
          icon={<Stethoscope className="h-6 w-6" />}
          title="Doctor visit summary"
          subtitle="Everything that matters on one page: hidden risks, trends, medicines and the right questions. Doctors can read it in about a minute."
          right={
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" disabled={dl} onClick={async () => { setDl(true); try { await openAuthed(`/profiles/${profile.id}/doctor-summary.pdf`, `DOC-${profile.name.split(" ")[0]}.pdf`); } finally { setDl(false); } }}><Download className="h-4 w-4" /> PDF</button>
              <button className="btn-outline" disabled={dl} title="Doctor brief + a Tamil summary page for the family" onClick={async () => { setDl(true); try { await openAuthed(`/profiles/${profile.id}/doctor-summary.pdf?lang=ta`, `DOC-${profile.name.split(" ")[0]}-tamil.pdf`); } finally { setDl(false); } }}><Download className="h-4 w-4" /> PDF + தமிழ்</button>
              <button className="btn-outline" onClick={() => { setMade(null); setOpen(true); }}><Link2 className="h-4 w-4" /> Share link</button>
              <button className="btn-outline" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</button>
            </div>
          }
        />
      </div>
      <SummaryView s={data} />

      {!!shares.data?.length && (
        <section className="card mt-6 p-5 print:hidden">
          <h2 className="mb-3 font-bold">Share links</h2>
          <div className="space-y-2">
            {shares.data.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 p-3 text-sm dark:border-white/5">
                <Link2 className="h-4 w-4 muted" />
                <code className="min-w-0 flex-1 truncate text-xs">{url(s.token)}</code>
                <span className="text-xs muted"><Clock className="mr-1 inline h-3 w-3" />{s.active ? `until ${fmtDate(s.expires_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : s.revoked ? "revoked" : "expired"} · {s.views} views</span>
                {s.active && <button className="btn-ghost p-1.5 text-red-600" onClick={async () => { await api.del(`/shares/${s.id}`); shares.reload(); }}><XCircle className="h-4 w-4" /> Revoke</button>}
              </div>
            ))}
          </div>
        </section>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Share with your doctor">
        {!made ? (
          <div className="space-y-4">
            <p className="text-sm muted">Creates a private, read-only link to this summary (first name only). It stops working automatically, and you can revoke it anytime. Every view is logged.</p>
            <div className="flex gap-2">
              {[[24, "24 hours"], [72, "3 days"], [168, "7 days"]].map(([h, l]) => (
                <button key={h} onClick={() => setHours(h as number)} className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${hours === h ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/10" : "border-slate-200 dark:border-white/10"}`}>{l}</button>
              ))}
            </div>
            <button className="btn-primary w-full" onClick={create}>Create link</button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm">Link ready. Send it on WhatsApp or email:</p>
            <div className="flex gap-2"><input readOnly className="input text-xs" value={made} /><button className="btn-primary" onClick={() => { navigator.clipboard.writeText(made); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</button></div>
            <a className="btn-outline w-full" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent("My health summary from DOC: " + made)}`}>Open WhatsApp</a>
          </div>
        )}
      </Modal>
    </div>
  );
}
