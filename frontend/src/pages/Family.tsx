import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users, UserPlus, Send, Inbox, Eye, ShieldCheck, ShieldOff, ArrowLeft, MessageCircle, LogOut, CheckCircle2, XCircle, Radar,
  FlaskConical, Pill, Thermometer, CalendarCheck, Clock, HeartPulse, ChevronDown, Lock, Hand, BadgeCheck, Ban,
} from "lucide-react";
import { api, ApiError, getToken } from "../lib/api";
import { useApp, useFetch } from "../lib/store";
import { fmtDate, fmtNum, initials, statusStyles } from "../lib/format";
import type { Level, Report, Status } from "../lib/types";
import { Disclaimer, Empty, ErrorBox, FlagChip, LevelIcon, Modal, PageHeader, Spinner, StatusChip } from "../components/ui";
import { t } from "../lib/i18n";

/* ------------------------------------------------------------------ types (local to this page) */
type Perms = Record<string, boolean>;
type LinkStatus = "pending" | "approved" | "denied" | "revoked";
interface FamilyLink {
  id: number;
  direction: "incoming" | "outgoing";
  status: LinkStatus;
  relation: string;
  message: string | null;
  person: { name: string | null; email: string };
  requested_permissions: Perms;
  permissions: Perms;
  created_at: string | null;
  responded_at: string | null;
  revoked_at: string | null;
  is_demo: boolean;
}
interface Members { i_can_view: FamilyLink[]; can_view_me: FamilyLink[] }
interface MemberSummary {
  link_id: number;
  name: string;
  relation: string;
  permissions: Perms;
  hidden_risks: { id: string; name: string; hidden_condition: string; status: Status; label: string; value: number; date: string }[];
  alerts: { level: Level; title: string; text: string }[];
  drifts: { code: string; name: string; change_pct: number; first_date: string; message: string }[];
  latest: { name: string; value: number; unit: string | null; date: string; flag: string | null }[];
  score: { value: number; label: string; explanation: string };
  disclaimer?: string;
  wellness?: { kind: string; label: string; latest: number | null; latest2: number | null; unit: string; latest_at: string | null; avg30: number | null; avg30_2: number | null; status: Status }[];
  medicines?: { brand: string; generic: string | null; dose: string | null; frequency: string | null; active: boolean }[];
}
interface MemberEvent { date: string; type: "report" | "medicine" | "symptom" | "checkup" | "insight"; kind?: string; title: string; subtitle: string; abnormal?: string[]; status?: Status }

const RELATIONS = ["mother", "father", "son", "daughter", "spouse", "sibling", "grandparent", "daughter-in-law", "son-in-law", "other"];
const DEFAULT_ASK: Perms = { summary: true, records: true, timeline: true, vitals: false, medicines: false, chat: false };
const DENIED_MSG = "Access was revoked or not shared.";

/* ------------------------------------------------------------------ helpers */
/** PUT with auth: mirrors api.ts request logic (api.ts has no put helper). */
async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      msg = typeof j.detail === "string" ? j.detail : Array.isArray(j.detail) ? j.detail.map((d: { msg: string }) => d.msg).join(", ") : msg;
    } catch {
      /* not json */
    }
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<T>;
}

function errMsg(e: unknown) {
  if (e instanceof ApiError && (e.status === 403 || e.status === 404)) return `${DENIED_MSG} ${e.message}`;
  return (e as Error).message;
}

/** Fetch family data with 403/404 kept separate, so a revoked link shows a calm message instead of an error. */
function useMember<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    setData(null);
    setError(null);
    setDenied(null);
    api.get<T>(path)
      .then((d) => alive && setData(d))
      .catch((e) => {
        if (!alive) return;
        if (e instanceof ApiError && (e.status === 403 || e.status === 404)) setDenied(e.message);
        else setError((e as Error).message);
      });
    return () => { alive = false; };
  }, [path]);
  return { data, error, denied };
}

const personName = (l: FamilyLink) => l.person.name || l.person.email;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function DemoBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return <span className="chip bg-violet-100 text-[10px] text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">Demo</span>;
}

function LinkStatusChip({ status }: { status: LinkStatus }) {
  if (status === "approved") return <StatusChip status="green">Approved</StatusChip>;
  if (status === "pending") return <StatusChip status="yellow">Pending</StatusChip>;
  if (status === "denied") return <StatusChip status="red">Denied</StatusChip>;
  return <span className="chip bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300"><span className="h-1.5 w-1.5 rounded-full bg-slate-400" />Stopped</span>;
}

function Avatar({ name }: { name: string }) {
  return <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-700 text-sm font-extrabold text-white">{initials(name) || "?"}</div>;
}

function PermToggles({ labels, value, onChange, disabled }: { labels: Record<string, string>; value: Perms; onChange: (p: Perms) => void; disabled?: boolean }) {
  return (
    <div className="grid gap-1.5">
      {Object.entries(labels).map(([key, label]) => (
        <label key={key} className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-2.5 text-sm transition ${value[key] ? "border-brand-200 bg-brand-50/60 dark:border-brand-500/30 dark:bg-brand-500/10" : "border-slate-200 dark:border-white/10"} ${disabled ? "pointer-events-none opacity-60" : ""}`}>
          <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600" checked={!!value[key]} disabled={disabled} onChange={(e) => onChange({ ...value, [key]: e.target.checked })} />
          <span><b className="font-semibold">{cap(key)}</b> <span className="muted">· {label}</span></span>
        </label>
      ))}
    </div>
  );
}

function PermSummary({ perms }: { perms: Perms }) {
  const on = Object.entries(perms).filter(([, v]) => v).map(([k]) => k);
  if (!on.length) return <span className="text-xs muted">Nothing shared</span>;
  return <div className="flex flex-wrap gap-1">{on.map((k) => <span key={k} className="chip bg-slate-100 text-[11px] text-slate-700 dark:bg-white/10 dark:text-slate-200">{cap(k)}</span>)}</div>;
}

function SectionTitle({ icon, children, right }: { icon: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider muted">{icon}{children}</h2>
      {right}
    </div>
  );
}

/* ------------------------------------------------------------------ page */
export default function Family() {
  const { lang } = useApp();
  const labels = useFetch<Record<string, string>>("/family/permissions");
  const members = useFetch<Members>("/family/members");
  const incoming = useFetch<FamilyLink[]>("/family/incoming");
  const outgoing = useFetch<FamilyLink[]>("/family/outgoing");
  const [viewing, setViewing] = useState<FamilyLink | null>(null);
  const [revoking, setRevoking] = useState<{ link: FamilyLink; mode: "revoke" | "leave" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const reloadAll = () => {
    members.reload();
    incoming.reload();
    outgoing.reload();
  };

  async function doRevoke() {
    if (!revoking) return;
    setBusy(true);
    setActionErr(null);
    try {
      await api.post(`/family/${revoking.link.id}/revoke`);
      if (viewing?.id === revoking.link.id) setViewing(null);
      setRevoking(null);
      reloadAll();
    } catch (e) {
      setActionErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  const permLabels = labels.data ?? {};
  const pending = (incoming.data ?? []).filter((l) => l.status === "pending");
  const canViewMe = members.data?.can_view_me ?? [];
  const iCanView = members.data?.i_can_view ?? [];
  const sent = outgoing.data ?? [];

  if (viewing) {
    return (
      <>
        <MemberView link={viewing} onBack={() => { setViewing(null); reloadAll(); }} onLeave={() => setRevoking({ link: viewing, mode: "leave" })} />
        <RevokeModal state={revoking} busy={busy} err={actionErr} onClose={() => { setRevoking(null); setActionErr(null); }} onConfirm={doRevoke} />
      </>
    );
  }

  const firstLoad = !members.data && !members.error;

  return (
    <div>
      <PageHeader icon={<Users className="h-6 w-6" />} title="Family sharing" subtitle="Adding someone never shares anything. They ask; you approve exactly what they can see; you can stop it anytime." />

      <div className="mb-6 grid gap-2 sm:grid-cols-3">
        {[
          { icon: Hand, title: "They ask", text: "A family member sends a request with your email." },
          { icon: BadgeCheck, title: "You choose", text: "Approve only the parts you want them to see." },
          { icon: Ban, title: "Stop anytime", text: "Revoke with one tap. Access ends immediately." },
        ].map((s, i) => (
          <div key={s.title} className="card flex items-start gap-3 p-4 animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10"><s.icon className="h-4 w-4" /></div>
            <div><p className="text-sm font-bold">{i + 1}. {s.title}</p><p className="text-xs muted">{s.text}</p></div>
          </div>
        ))}
      </div>

      {members.error && <div className="mb-6"><ErrorBox msg={members.error} /></div>}
      {firstLoad && <Spinner />}

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <AskForm labels={permLabels} onSent={() => outgoing.reload()} />

        <section className="card p-5">
          <h2 className="mb-1 flex items-center gap-2 font-bold"><Inbox className="h-5 w-5 text-brand-600" /> Requests for you {!!pending.length && <span className="chip bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300">{pending.length}</span>}</h2>
          <p className="mb-4 text-xs muted">Untick anything you don't want to share before approving.</p>
          {incoming.error && <ErrorBox msg={incoming.error} />}
          {!incoming.data && !incoming.error && <Spinner />}
          {incoming.data && !pending.length && <p className="text-sm muted">No requests waiting. When someone asks to view your health data, it shows up here.</p>}
          <div className="space-y-3">
            {pending.map((l) => <IncomingCard key={l.id} link={l} labels={permLabels} onDone={reloadAll} />)}
          </div>
        </section>
      </div>

      <section className="mb-8">
        <SectionTitle icon={<Eye className="h-4 w-4" />}>People you can view</SectionTitle>
        {members.data && !iCanView.length ? (
          <Empty icon={<Users className="h-7 w-7" />} title="No one shared with you yet" text="Ask a family member above. Once they approve, their summary, records and timeline appear here (only the parts they chose)." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {iCanView.map((l) => (
              <button key={l.id} onClick={() => setViewing(l)} className="card group flex flex-col p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lift">
                <div className="flex items-start gap-3">
                  <Avatar name={personName(l)} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 font-bold">{personName(l)} <DemoBadge show={l.is_demo} /></p>
                    <p className="truncate text-xs muted">{cap(l.relation)} · {l.person.email}</p>
                  </div>
                </div>
                <div className="mt-3"><PermSummary perms={l.permissions} /></div>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-brand-700 dark:text-brand-300">Open <Eye className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" /></span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="mb-8">
        <SectionTitle icon={<ShieldCheck className="h-4 w-4" />}>People who can see your data</SectionTitle>
        {members.data && !canViewMe.length && <p className="card p-5 text-sm muted">Nobody can see your data. Your records stay private until you approve a request.</p>}
        <div className="grid gap-3 lg:grid-cols-2">
          {canViewMe.map((l) => <SharingCard key={l.id} link={l} labels={permLabels} onRevoke={() => setRevoking({ link: l, mode: "revoke" })} />)}
        </div>
      </section>

      <section>
        <SectionTitle icon={<Send className="h-4 w-4" />}>Sent requests</SectionTitle>
        {outgoing.error && <ErrorBox msg={outgoing.error} />}
        {outgoing.data && !sent.length && <p className="text-sm muted">You haven't asked anyone yet.</p>}
        {!!sent.length && (
          <div className="card divide-y divide-slate-100 dark:divide-white/5">
            {sent.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">{personName(l)} <DemoBadge show={l.is_demo} /></p>
                  <p className="truncate text-xs muted">{cap(l.relation)} · asked {fmtDate(l.created_at)}{l.responded_at ? ` · answered ${fmtDate(l.responded_at)}` : ""}</p>
                </div>
                <LinkStatusChip status={l.status} />
                {l.status === "pending" && (
                  <button className="btn-ghost px-2.5 py-1.5 text-xs hover:text-red-600" onClick={() => setRevoking({ link: l, mode: "leave" })}>Withdraw</button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <RevokeModal state={revoking} busy={busy} err={actionErr} onClose={() => { setRevoking(null); setActionErr(null); }} onConfirm={doRevoke} />
      <Disclaimer text={`Every view by a family member is written to your access log (Settings). ${t("notDoctor", lang)}`} />
    </div>
  );
}

/* ------------------------------------------------------------------ ask form */
function AskForm({ labels, onSent }: { labels: Record<string, string>; onSent: () => void }) {
  const [f, setF] = useState({ email: "", relation: "mother", message: "" });
  const [perms, setPerms] = useState<Perms>(DEFAULT_ASK);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setNote(null);
    try {
      const r = await api.post<{ note: string }>("/family/request", { email: f.email.trim(), relation: f.relation, message: f.message.trim() || null, permissions: perms });
      setNote(r.note);
      setF({ ...f, email: "", message: "" });
      onSent();
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-5">
      <h2 className="mb-1 flex items-center gap-2 font-bold"><UserPlus className="h-5 w-5 text-brand-600" /> Ask to view a family member</h2>
      <p className="mb-4 text-xs muted">They get a request in DOC. Nothing is shared until they approve, and they decide what you see.</p>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label">Their email</label><input className="input" type="email" required placeholder="amma@example.com" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          <div><label className="label">They are your</label>
            <select className="input" value={f.relation} onChange={(e) => setF({ ...f, relation: e.target.value })}>
              {RELATIONS.map((r) => <option key={r} value={r}>{cap(r)}</option>)}
            </select></div>
        </div>
        <div><label className="label">Message (optional)</label><input className="input" maxLength={300} placeholder="I'd like to help keep track of your reports." value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} /></div>
        <div>
          <label className="label">What you'd like to see</label>
          {Object.keys(labels).length ? <PermToggles labels={labels} value={perms} onChange={setPerms} /> : <Spinner />}
        </div>
        {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
        {note && <p className="flex items-start gap-2 rounded-xl bg-brand-50 p-3 text-sm dark:bg-brand-500/10"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />{note}</p>}
        <button className="btn-primary w-full" disabled={busy || !f.email.trim()}><Send className="h-4 w-4" /> {busy ? "Sending…" : "Send request"}</button>
      </form>
    </section>
  );
}

/* ------------------------------------------------------------------ incoming request */
function IncomingCard({ link, labels, onDone }: { link: FamilyLink; labels: Record<string, string>; onDone: () => void }) {
  const [perms, setPerms] = useState<Perms>(link.requested_permissions);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function respond(approve: boolean) {
    setBusy(true);
    setErr(null);
    try {
      await api.post(`/family/${link.id}/respond`, approve ? { approve: true, permissions: perms } : { approve: false });
      onDone();
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const nothing = !Object.values(perms).some(Boolean);

  return (
    <div className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
      <div className="flex items-start gap-3">
        <Avatar name={personName(link)} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 font-bold">{personName(link)} <DemoBadge show={link.is_demo} /></p>
          <p className="truncate text-xs muted">{link.person.email} · says they are your {link.relation} · {fmtDate(link.created_at)}</p>
        </div>
      </div>
      {link.message && <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm italic dark:bg-white/5">“{link.message}”</p>}
      <p className="mb-2 mt-3 text-xs font-semibold muted">They asked for (untick to keep private):</p>
      <PermToggles labels={labels} value={perms} onChange={setPerms} disabled={busy} />
      {err && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{err}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn-primary flex-1" disabled={busy || nothing} onClick={() => respond(true)}><CheckCircle2 className="h-4 w-4" /> Approve selected</button>
        <button className="btn-outline flex-1 hover:border-red-400 hover:text-red-600" disabled={busy} onClick={() => respond(false)}><XCircle className="h-4 w-4" /> Deny</button>
      </div>
      {nothing && <p className="mt-2 text-xs muted">Tick at least one item to approve, or deny the request.</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ someone who can see me */
function SharingCard({ link, labels, onRevoke }: { link: FamilyLink; labels: Record<string, string>; onRevoke: () => void }) {
  const [perms, setPerms] = useState<Perms>(link.permissions);
  const [saved, setSaved] = useState<Perms>(link.permissions);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = useState(false);
  const dirty = JSON.stringify(perms) !== JSON.stringify(saved);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await put<FamilyLink>(`/family/${link.id}/permissions`, { permissions: perms });
      setSaved(r.permissions);
      setPerms(r.permissions);
      setMsg({ ok: true, text: "Saved. Changes apply on their very next view." });
    } catch (x) {
      setMsg({ ok: false, text: errMsg(x) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-start gap-3">
        <Avatar name={personName(link)} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 font-bold">{personName(link)} <DemoBadge show={link.is_demo} /></p>
          <p className="truncate text-xs muted">Your {link.relation} · since {fmtDate(link.responded_at ?? link.created_at)}</p>
        </div>
        <button className="btn-ghost shrink-0 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10" onClick={onRevoke}><ShieldOff className="h-4 w-4" /> Revoke</button>
      </div>
      <div className="mt-3"><PermSummary perms={saved} /></div>
      <button className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-brand-700 dark:text-brand-300" onClick={() => setOpen((o) => !o)}>
        Change what they can see <ChevronDown className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <PermToggles labels={labels} value={perms} onChange={setPerms} disabled={busy} />
          <button className="btn-primary w-full" disabled={busy || !dirty} onClick={save}>{busy ? "Saving…" : "Save permissions"}</button>
        </div>
      )}
      {msg && <p className={`mt-2 text-xs ${msg.ok ? "text-emerald-700 dark:text-emerald-300" : "text-red-600 dark:text-red-400"}`}>{msg.text}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ confirm revoke / leave */
function RevokeModal({ state, busy, err, onClose, onConfirm }: { state: { link: FamilyLink; mode: "revoke" | "leave" } | null; busy: boolean; err: string | null; onClose: () => void; onConfirm: () => void }) {
  if (!state) return null;
  const name = personName(state.link);
  const revoke = state.mode === "revoke";
  const pendingOut = !revoke && state.link.status === "pending";
  return (
    <Modal open onClose={onClose} title={revoke ? `Stop sharing with ${name}?` : pendingOut ? "Withdraw this request?" : `Stop viewing ${name}?`}>
      <p className="text-sm muted">
        {revoke
          ? `${name} will lose access immediately. They won't be able to see any of your health data unless they ask again and you approve.`
          : pendingOut
            ? `Your request to ${name} will be cancelled.`
            : `You will no longer see ${name}'s health data. To view it again, you would need to send a new request.`}
      </p>
      {err && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{err}</p>}
      <div className="mt-5 flex gap-2">
        <button className="btn-outline flex-1" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn flex-1 bg-red-600 text-white hover:bg-red-700" onClick={onConfirm} disabled={busy}>
          {revoke ? <ShieldOff className="h-4 w-4" /> : <LogOut className="h-4 w-4" />} {busy ? "Working…" : revoke ? "Revoke access" : pendingOut ? "Withdraw" : "Leave"}
        </button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ viewing a family member */
type Tab = "summary" | "records" | "timeline";

function MemberView({ link, onBack, onLeave }: { link: FamilyLink; onBack: () => void; onLeave: () => void }) {
  const navigate = useNavigate();
  const p = link.permissions;
  const tabs = ([
    ["summary", "Summary", Radar],
    ["records", "Records", FlaskConical],
    ["timeline", "Timeline", Clock],
  ] as const).filter(([k]) => p[k]);
  const [tab, setTab] = useState<Tab | null>(tabs[0]?.[0] ?? null);
  const name = personName(link);
  const first = name.split(" ")[0];

  return (
    <div>
      <button className="btn-ghost -ml-2 mb-3 px-2 py-1.5 text-sm" onClick={onBack}><ArrowLeft className="h-4 w-4" /> Family</button>
      <PageHeader
        icon={<Users className="h-6 w-6" />}
        title={name}
        subtitle={`Your ${link.relation}. You see only what ${first} chose to share, and every view is shown in their access log.`}
        right={
          <div className="flex flex-wrap gap-2">
            {p.chat && <button className="btn-primary" onClick={() => navigate(`/app/chat?scope=family:${link.id}`)}><MessageCircle className="h-4 w-4" /> Ask about {first}</button>}
            <button className="btn-outline hover:border-red-400 hover:text-red-600" onClick={onLeave}><LogOut className="h-4 w-4" /> Leave</button>
          </div>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <DemoBadge show={link.is_demo} />
        <span className="text-xs muted">Shared with you:</span>
        <PermSummary perms={p} />
      </div>

      {tabs.length > 1 && (
        <div className="no-scrollbar mb-5 flex gap-1 overflow-x-auto rounded-2xl bg-slate-100 p-1 dark:bg-white/5">
          {tabs.map(([k, label, Icon]) => (
            <button key={k} onClick={() => setTab(k)} className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition ${tab === k ? "bg-white text-brand-700 shadow-sm dark:bg-[#10201e] dark:text-brand-300" : "muted hover:text-slate-700 dark:hover:text-slate-200"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
      )}

      {!tab && <Empty icon={<Lock className="h-7 w-7" />} title="Nothing to show here" text={p.chat ? `${first} shared AI questions only. Use “Ask about ${first}”.` : `${first} hasn't shared a summary, records or timeline with you.`} />}
      {tab === "summary" && <SummaryTab linkId={link.id} />}
      {tab === "records" && <RecordsTab linkId={link.id} />}
      {tab === "timeline" && <TimelineTab linkId={link.id} />}
    </div>
  );
}

function Denied({ detail }: { detail: string }) {
  return <Empty icon={<Lock className="h-7 w-7" />} title={DENIED_MSG} text={`${detail} Only the account owner can share this with you.`} />;
}

function SummaryTab({ linkId }: { linkId: number }) {
  const { lang } = useApp();
  const { data, error, denied } = useMember<MemberSummary>(`/family/${linkId}/summary?lang=${lang}`);
  if (denied) return <Denied detail={denied} />;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return <Spinner />;
  return (
    <div className="space-y-6">
      <section className="card p-5">
        <h2 className="mb-4 flex items-center gap-2 font-bold"><Radar className="h-5 w-5 text-brand-600" /> Hidden risks</h2>
        {!data.hidden_risks.length ? <p className="text-sm muted">Not enough combined data yet to check for hidden risks.</p> : (
          <div className="grid gap-2 sm:grid-cols-2">
            {data.hidden_risks.map((r) => (
              <div key={r.id} className={`flex items-center gap-3 rounded-xl p-3 ${statusStyles[r.status].soft}`}>
                <div className={`h-10 w-1.5 rounded-full ${statusStyles[r.status].dot}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{r.hidden_condition}</p>
                  <p className="text-xs muted">{r.name}: <b className={statusStyles[r.status].text}>{fmtNum(r.value)}</b> · {fmtDate(r.date)}</p>
                </div>
                <StatusChip status={r.status}>{r.label.length > 18 ? r.label.split(" (")[0] : r.label}</StatusChip>
              </div>
            ))}
          </div>
        )}
        {!!data.hidden_risks.length && <p className="mt-3 text-xs muted">{data.score.label}. {data.score.explanation}</p>}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-4 flex items-center gap-2 font-bold"><FlaskConical className="h-5 w-5 text-brand-600" /> Latest values</h2>
          {!data.latest.length && <p className="text-sm muted">No key test values shared.</p>}
          <div className="divide-y divide-slate-100 dark:divide-white/5">
            {data.latest.map((v) => (
              <div key={v.name} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="font-semibold">{v.name}</span>
                <span className="flex items-center gap-2"><b>{fmtNum(v.value)}</b> <span className="text-xs muted">{v.unit} · {fmtDate(v.date, { month: "short", year: "numeric" })}</span><FlagChip flag={v.flag} /></span>
              </div>
            ))}
          </div>
        </section>
        <section className="card p-5">
          <h2 className="mb-4 flex items-center gap-2 font-bold"><ShieldCheck className="h-5 w-5 text-brand-600" /> Things worth discussing</h2>
          {!data.alerts.length && <p className="text-sm muted">No alerts.</p>}
          <div className="space-y-3">
            {data.alerts.map((a, i) => (
              <div key={i} className="flex gap-3">
                <LevelIcon level={a.level} />
                <div className="min-w-0"><p className="text-sm font-semibold">{a.title}</p><p className="line-clamp-3 text-xs muted">{a.text}</p></div>
              </div>
            ))}
          </div>
          {!!data.drifts.length && (
            <div className="mt-4 space-y-1.5 border-t border-slate-100 pt-3 dark:border-white/5">
              {data.drifts.map((d) => <p key={d.code} className="text-xs"><b>{d.name}</b> <span className="muted">{d.change_pct > 0 ? "+" : ""}{d.change_pct}% since {fmtDate(d.first_date, { month: "short", year: "numeric" })}, still in range</span></p>)}
            </div>
          )}
        </section>
      </div>

      {(data.wellness || data.medicines) && (
        <div className="grid gap-6 lg:grid-cols-2">
          {data.wellness && (
            <section className="card p-5">
              <h2 className="mb-4 flex items-center gap-2 font-bold"><HeartPulse className="h-5 w-5 text-rose-500" /> Home readings</h2>
              {!data.wellness.length && <p className="text-sm muted">No home readings yet.</p>}
              <div className="divide-y divide-slate-100 dark:divide-white/5">
                {data.wellness.map((w) => (
                  <div key={w.kind} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="font-semibold">{w.label}</span>
                    <span className="flex items-center gap-2">
                      <b>{w.latest === null ? "-" : w.latest2 !== null ? `${Math.round(w.latest)}/${Math.round(w.latest2)}` : fmtNum(w.latest, 1)}</b>
                      <span className="text-xs muted">{w.unit}{w.latest_at ? ` · ${fmtDate(w.latest_at, { day: "numeric", month: "short" })}` : ""}</span>
                      <StatusChip status={w.status}>{w.status === "green" ? "On track" : w.status === "yellow" ? "Watch" : "Discuss"}</StatusChip>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
          {data.medicines && (
            <section className="card p-5">
              <h2 className="mb-4 flex items-center gap-2 font-bold"><Pill className="h-5 w-5 text-violet-600" /> Current medicines</h2>
              {!data.medicines.length && <p className="text-sm muted">No active medicines.</p>}
              <div className="space-y-2">
                {data.medicines.map((m, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 dark:border-white/5">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-500/10"><Pill className="h-4 w-4" /></div>
                    <div className="min-w-0"><p className="text-sm font-bold">{m.brand} <span className="font-medium muted">{m.dose}</span></p><p className="truncate text-xs muted">{m.generic ?? ""}{m.frequency ? ` · ${m.frequency}` : ""}</p></div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
      <Disclaimer text={data.disclaimer ?? "This summary can help you support your family member. It is not a diagnosis; anything flagged is worth discussing with their doctor."} />
    </div>
  );
}

function RecordsTab({ linkId }: { linkId: number }) {
  const { data, error, denied } = useMember<Report[]>(`/family/${linkId}/records`);
  const [open, setOpen] = useState<number | null>(null);
  if (denied) return <Denied detail={denied} />;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return <Spinner />;
  if (!data.length) return <Empty icon={<FlaskConical className="h-7 w-7" />} title="No confirmed reports yet" text="Reports appear here once they are uploaded and confirmed." />;
  return (
    <div className="space-y-3">
      {data.map((r) => {
        const isOpen = open === r.id;
        return (
          <div key={r.id} className="card overflow-hidden">
            <button className="flex w-full items-center gap-3 p-4 text-left hover:bg-slate-50 dark:hover:bg-white/5" onClick={() => setOpen(isOpen ? null : r.id)}>
              <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${r.kind === "lab" ? "bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" : "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"}`}>
                {r.kind === "lab" ? <FlaskConical className="h-5 w-5" /> : <Pill className="h-5 w-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{r.lab_name || r.doctor_name || r.filename}</p>
                <p className="text-xs muted">{fmtDate(r.report_date)} · {r.kind === "lab" ? `${r.n_results} tests` : `${r.n_medicines} medicines`}</p>
              </div>
              {r.n_abnormal > 0 && <span className="chip bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300">{r.n_abnormal} outside range</span>}
              <ChevronDown className={`h-4 w-4 shrink-0 muted transition ${isOpen ? "rotate-180" : ""}`} />
            </button>
            {isOpen && (
              <div className="border-t border-slate-100 p-4 dark:border-white/5">
                {!!r.results?.length && (
                  <div className="divide-y divide-slate-100 text-sm dark:divide-white/5">
                    {r.results.map((x) => (
                      <div key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <span className="min-w-0 flex-1 font-semibold">{x.test_name}</span>
                        <span className="flex items-center gap-2">
                          <b className={x.flag === "H" || x.flag === "L" ? "text-red-600 dark:text-red-400" : ""}>{x.value !== null ? fmtNum(x.value) : x.value_raw ?? "-"}</b>
                          <span className="text-xs muted">{x.unit ?? x.unit_raw ?? ""}{x.ref_low !== null || x.ref_high !== null ? ` · normal ${x.ref_low ?? "–"}–${x.ref_high ?? "–"}` : ""}</span>
                          <FlagChip flag={x.flag} />
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {!!r.medicines?.length && (
                  <div className="mt-2 space-y-1">
                    {r.medicines.map((m) => <p key={m.id} className="flex items-center gap-2 text-sm"><Pill className="h-3.5 w-3.5 text-violet-600" /><b>{m.brand}</b> <span className="muted">{[m.generic, m.dose, m.frequency].filter(Boolean).join(" · ")}</span></p>)}
                  </div>
                )}
                {!r.results?.length && !r.medicines?.length && <p className="text-sm muted">No details shared for this report.</p>}
              </div>
            )}
          </div>
        );
      })}
      <Disclaimer text="Values outside the lab's range can have many causes and are worth discussing with their doctor." />
    </div>
  );
}

const EV: Record<MemberEvent["type"], { icon: typeof Pill; cls: string }> = {
  report: { icon: FlaskConical, cls: "bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" },
  medicine: { icon: Pill, cls: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" },
  symptom: { icon: Thermometer, cls: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" },
  checkup: { icon: CalendarCheck, cls: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" },
  insight: { icon: Radar, cls: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" },
};

function TimelineTab({ linkId }: { linkId: number }) {
  const { data, error, denied } = useMember<MemberEvent[]>(`/family/${linkId}/timeline`);
  if (denied) return <Denied detail={denied} />;
  if (error) return <ErrorBox msg={error} />;
  if (!data) return <Spinner />;
  if (!data.length) return <Empty icon={<Clock className="h-7 w-7" />} title="No events yet" text="Reports, medicines, symptoms and checkups will show up here." />;
  return (
    <section className="card p-5">
      <ol className="relative space-y-4 border-l-2 border-slate-100 pl-6 dark:border-white/5">
        {data.map((e, i) => {
          const M = EV[e.type] ?? EV.report;
          return (
            <li key={i} className="relative">
              <span className={`absolute -left-[37px] grid h-7 w-7 place-items-center rounded-full ring-4 ring-white dark:ring-[#10201e] ${M.cls}`}><M.icon className="h-3.5 w-3.5" /></span>
              <p className="text-[11px] font-semibold uppercase tracking-wide muted">{fmtDate(e.date)}</p>
              <p className="flex flex-wrap items-center gap-2 text-sm font-bold">{e.title} {e.status && <StatusChip status={e.status}>{e.status === "red" ? "Discuss" : e.status === "yellow" ? "Watch" : "OK"}</StatusChip>}</p>
              {e.subtitle && <p className="text-xs muted">{e.subtitle}</p>}
              {!!e.abnormal?.length && <p className="mt-1 text-xs text-red-600 dark:text-red-400">Outside range: {e.abnormal.join(", ")}</p>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
