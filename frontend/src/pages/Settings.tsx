import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Settings as Cog, ShieldCheck, KeyRound, Users, Download, Trash2, History, RotateCcw, Sparkles, Copy, Check, Plus, Save, PartyPopper } from "lucide-react";
import { api, openAuthed, setToken } from "../lib/api";
import { useApp, useFetch } from "../lib/store";
import { conditionLabels, fmtDate } from "../lib/format";
import type { Meta, Profile, User } from "../lib/types";
import { Modal, PageHeader } from "../components/ui";
import { Avatar } from "../components/Layout";

function Section({ id, icon, title, children, desc }: { id: string; icon: React.ReactNode; title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="card scroll-mt-24 p-6">
      <h2 className="flex items-center gap-2 text-lg font-bold">{icon}{title}</h2>
      {desc && <p className="mb-4 mt-1 text-sm muted">{desc}</p>}
      {children}
    </section>
  );
}

function TwoFactor() {
  const { user, setUser } = useApp();
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [disable, setDisable] = useState(false);
  const [pw, setPw] = useState("");
  const [copied, setCopied] = useState(false);
  if (!user) return null;

  async function enable(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      const r = await api.post<{ backup_codes: string[]; user: User }>("/auth/2fa/enable", { code });
      setCodes(r.backup_codes);
      setUser(r.user);
      setSetup(null);
      setCode("");
    } catch (e) { setErr((e as Error).message); }
  }
  async function off(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      const r = await api.post<{ user: User }>("/auth/2fa/disable", { password: pw, code });
      setUser(r.user);
      setDisable(false);
      setPw(""); setCode("");
    } catch (e) { setErr((e as Error).message); }
  }

  return (
    <Section id="security" icon={<ShieldCheck className="h-5 w-5 text-brand-600" />} title="Two-factor authentication (2FA)" desc="Protect health records with a 6-digit code from an authenticator app every time you sign in.">
      {user.totp_enabled ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-emerald-50 p-4 dark:bg-emerald-500/10">
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800 dark:text-emerald-200"><ShieldCheck className="h-5 w-5" /> 2FA is on · {user.backup_codes_left} backup codes left</p>
          <button className="btn-outline py-2 text-xs" onClick={() => setDisable(true)}>Turn off</button>
        </div>
      ) : setup ? (
        <div className="grid gap-6 sm:grid-cols-[200px_1fr]">
          <img src={setup.qr} alt="2FA QR code" className="w-full rounded-xl bg-white p-2 ring-1 ring-slate-200" />
          <form onSubmit={enable} className="space-y-3">
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              <li>Open Google Authenticator, Microsoft Authenticator or Authy.</li>
              <li>Scan this QR code (or enter the key below).</li>
              <li>Type the 6-digit code it shows.</li>
            </ol>
            <code className="block break-all rounded-lg bg-slate-100 p-2 text-xs dark:bg-white/10">{setup.secret}</code>
            <input className="input text-center text-xl font-bold tracking-[0.35em]" inputMode="numeric" placeholder="000000" value={code} onChange={(e) => setCode(e.target.value)} />
            {err && <p className="text-sm text-red-600">{err}</p>}
            <button className="btn-primary w-full" disabled={code.length < 6}><KeyRound className="h-4 w-4" /> Verify & turn on</button>
          </form>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-50 p-4 dark:bg-amber-500/10">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">2FA is off. Turn it on to protect your family's records.</p>
          <button className="btn-primary" onClick={async () => setSetup(await api.post("/auth/2fa/setup"))} disabled={user.is_demo} title={user.is_demo ? "Disabled on the shared demo account" : ""}>Set up 2FA</button>
        </div>
      )}
      {user.is_demo && !user.totp_enabled && <p className="mt-2 text-xs muted">2FA can't be turned on for the shared demo account. Create your own account to try it.</p>}

      <Modal open={!!codes} onClose={() => setCodes(null)} title="Save your backup codes">
        <p className="mb-3 text-sm muted">If you lose your phone, each code lets you sign in once. They won't be shown again.</p>
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-4 font-mono text-sm dark:bg-white/5">{codes?.map((c) => <span key={c}>{c}</span>)}</div>
        <button className="btn-outline mt-3 w-full" onClick={() => { navigator.clipboard.writeText(codes!.join("\n")); setCopied(true); }}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Copy codes</button>
      </Modal>
      <Modal open={disable} onClose={() => setDisable(false)} title="Turn off 2FA">
        <form onSubmit={off} className="space-y-3">
          <input className="input" type="password" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} />
          <input className="input" placeholder="6-digit code or backup code" value={code} onChange={(e) => setCode(e.target.value)} />
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button className="btn-primary w-full bg-red-600 hover:bg-red-700">Turn off 2FA</button>
        </form>
      </Modal>
    </Section>
  );
}

const COLORS = ["teal", "violet", "amber", "rose", "sky"];

function ProfileForm({ initial, onSave, conditions }: { initial: Partial<Profile>; onSave: (p: Partial<Profile>) => Promise<void>; conditions: string[] }) {
  const [p, setP] = useState(initial);
  const [saved, setSaved] = useState(false);
  useEffect(() => { setP(initial); }, [initial]);
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={async (e) => { e.preventDefault(); await onSave(p); setSaved(true); setTimeout(() => setSaved(false), 1500); }}>
      <div><label className="label">Name</label><input className="input" required value={p.name ?? ""} onChange={(e) => setP({ ...p, name: e.target.value })} /></div>
      <div><label className="label">Relation</label>
        <select className="input" value={p.relation ?? "self"} onChange={(e) => setP({ ...p, relation: e.target.value })}>
          {["self", "mother", "father", "spouse", "daughter", "son", "grandparent", "other"].map((r) => <option key={r}>{r}</option>)}
        </select></div>
      <div><label className="label">Date of birth</label><input className="input" type="date" value={p.dob ?? ""} onChange={(e) => setP({ ...p, dob: e.target.value || null })} /></div>
      <div><label className="label">Sex</label>
        <select className="input" value={p.sex ?? "F"} onChange={(e) => setP({ ...p, sex: e.target.value as "F" | "M" })}><option value="F">Female</option><option value="M">Male</option></select></div>
      <div><label className="label">Height (cm)</label><input className="input" type="number" value={p.height_cm ?? ""} onChange={(e) => setP({ ...p, height_cm: e.target.value ? Number(e.target.value) : null })} /></div>
      <div><label className="label">Weight (kg)</label><input className="input" type="number" value={p.weight_kg ?? ""} onChange={(e) => setP({ ...p, weight_kg: e.target.value ? Number(e.target.value) : null })} /></div>
      <div className="sm:col-span-2"><label className="label">Known conditions</label>
        <div className="flex flex-wrap gap-2">{conditions.map((c) => {
          const on = p.conditions?.includes(c);
          return <button type="button" key={c} onClick={() => setP({ ...p, conditions: on ? p.conditions!.filter((x) => x !== c) : [...(p.conditions ?? []), c] })} className={`chip px-3 py-1.5 ${on ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200"}`}>{conditionLabels[c] ?? c}</button>;
        })}</div>
        <p className="mt-1 text-xs muted">Conditions turn on the right care-gap reminders (e.g. yearly kidney checks for diabetes).</p>
      </div>
      <div className="flex gap-2 sm:col-span-2">{COLORS.map((c) => <button type="button" key={c} onClick={() => setP({ ...p, color: c })} className={`rounded-full p-0.5 ${p.color === c ? "ring-2 ring-brand-500" : ""}`}><Avatar name={p.name || "?"} color={c} size="h-8 w-8 text-xs" /></button>)}</div>
      <button className="btn-primary sm:col-span-2">{saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />} {saved ? "Saved" : "Save"}</button>
    </form>
  );
}

export default function SettingsPage() {
  const { user, profile, profiles, refreshProfiles, selectProfile, bump, logout, login } = useApp();
  const { data: meta } = useFetch<Meta>("/meta");
  const audit = useFetch<{ action: string; detail: string | null; ip: string | null; at: string }[]>("/audit");
  const [adding, setAdding] = useState(false);
  const [del, setDel] = useState(false);
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const nav = useNavigate();
  const welcome = new URLSearchParams(location.search).get("welcome");

  useEffect(() => { if (location.hash) setTimeout(() => document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: "smooth" }), 100); }, []);
  if (!user || !profile) return null;
  const conditions = meta?.conditions ?? Object.keys(conditionLabels);

  return (
    <div className="space-y-6">
      <PageHeader icon={<Cog className="h-6 w-6" />} title="Settings" subtitle="Security, family profiles and privacy." />
      {welcome && <div className="card flex items-center gap-3 border-brand-300 bg-brand-50 p-4 text-sm dark:bg-brand-500/10"><PartyPopper className="h-5 w-5 text-brand-600" /> Welcome to DOC! Add your date of birth below (needed for formulas), turn on 2FA, then upload your first report.</div>}

      <TwoFactor />

      <Section id="family" icon={<Users className="h-5 w-5 text-brand-600" />} title="Family profiles" desc="Manage health records for everyone you care for. Switch between them from the top bar.">
        <div className="mb-5 flex flex-wrap gap-2">
          {profiles.map((p) => (
            <button key={p.id} onClick={() => selectProfile(p.id)} className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm font-semibold ${p.id === profile.id ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10" : "border-slate-200 dark:border-white/10"}`}>
              <Avatar name={p.name} color={p.color} size="h-7 w-7 text-xs" /> {p.name.split(" ")[0]}
            </button>
          ))}
          <button className="btn-ghost py-1.5 text-brand-700" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add member</button>
        </div>
        <ProfileForm key={profile.id} initial={profile} conditions={conditions} onSave={async (p) => {
          await api.patch(`/profiles/${profile.id}`, { name: p.name, relation: p.relation, dob: p.dob, sex: p.sex, height_cm: p.height_cm, weight_kg: p.weight_kg, conditions: p.conditions, color: p.color });
          await refreshProfiles(); bump();
        }} />
        {!profile.is_primary && <button className="btn-ghost mt-3 text-xs text-red-600" onClick={async () => { if (confirm(`Delete ${profile.name}'s profile and all their records?`)) { await api.del(`/profiles/${profile.id}`); await refreshProfiles(); bump(); } }}><Trash2 className="h-3.5 w-3.5" /> Delete this profile</button>}
      </Section>

      <Section id="ai" icon={<Sparkles className="h-5 w-5 text-brand-600" />} title="AI engine">
        <p className="text-sm">{meta?.ai_enabled ? <>AI is on: <b>{meta.ai_engines?.join("  →  backup: ")}</b>. It reads documents, explains results and answers questions. All medical maths runs in tested code, not the AI.</> : <>Offline mode: reports are read by the built-in parser (text PDFs) and explanations use templates. Set <code>GEMINI_API_KEY</code> or <code>ANTHROPIC_API_KEY</code> in <code>backend/.env</code> to turn on AI for photos, handwriting, Hindi/Tamil and free-form chat.</>}</p>
        {meta && <p className="mt-2 text-xs muted">{meta.formulas.length} formulas · {meta.tests.length} lab tests in the catalogue</p>}
      </Section>

      <Section id="privacy" icon={<History className="h-5 w-5 text-brand-600" />} title="Privacy & access log" desc="Every sign-in, upload, export and shared-link view is recorded here.">
        <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-100 dark:border-white/5">
          <table className="w-full text-xs">
            <tbody>{(audit.data ?? []).map((a, i) => (
              <tr key={i} className="border-b border-slate-50 dark:border-white/5"><td className="p-2 font-semibold">{a.action.replace(/_/g, " ")}</td><td className="p-2 muted">{a.detail}</td><td className="whitespace-nowrap p-2 text-right muted">{fmtDate(a.at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn-outline" onClick={() => openAuthed("/export", "doc-export.json")}><Download className="h-4 w-4" /> Export all my data (JSON)</button>
          {user.is_demo ? (
            <button className="btn-outline" onClick={async () => { const r = await api.post<{ access_token: string }>("/demo/reset"); setToken(r.access_token); await login(r.access_token, await api.get<User>("/auth/me")); bump(); }}><RotateCcw className="h-4 w-4" /> Reset demo data</button>
          ) : (
            <button className="btn-outline text-red-600" onClick={() => setDel(true)}><Trash2 className="h-4 w-4" /> Delete account</button>
          )}
        </div>
      </Section>

      <Modal open={adding} onClose={() => setAdding(false)} title="Add a family member">
        <ProfileForm initial={{ name: "", relation: "mother", sex: "F", conditions: [], color: "violet" }} conditions={conditions} onSave={async (p) => {
          const np = await api.post<Profile>("/profiles", p);
          await refreshProfiles(); selectProfile(np.id); setAdding(false);
        }} />
      </Modal>
      <Modal open={del} onClose={() => setDel(false)} title="Delete account permanently">
        <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); setErr(null); try { await api.post("/account/delete", { password: pw }); logout(); nav("/"); } catch (x) { setErr((x as Error).message); } }}>
          <p className="text-sm muted">This deletes every profile, report, file and result. It cannot be undone. Export your data first if you want a copy.</p>
          <input className="input" type="password" placeholder="Confirm with your password" value={pw} onChange={(e) => setPw(e.target.value)} />
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button className="btn-primary w-full bg-red-600 hover:bg-red-700">Delete everything</button>
        </form>
      </Modal>
    </div>
  );
}
