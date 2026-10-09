import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Settings as Cog, ShieldCheck, Users, Download, Trash2, History, RotateCcw, Sparkles, Check, Plus, Save, PartyPopper, IdCard, FileJson } from "lucide-react";
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

function AccountSecurity() {
  const { user } = useApp();
  if (!user) return null;
  const provider = { "google.com": "Google", password: "Email & password (Firebase)", demo: "Shared demo account", local: "Local account (development)" }[user.auth_provider] ?? user.auth_provider;
  return (
    <Section id="security" icon={<ShieldCheck className="h-5 w-5 text-brand-600" />} title="Sign-in & security" desc="Sign-in is handled by Google Firebase. Your health data is checked on our server on every request: only you, and family members you approve, can see it.">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-emerald-50 p-4 dark:bg-emerald-500/10">
        <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800 dark:text-emerald-200"><ShieldCheck className="h-5 w-5" /> Signed in with {provider}{user.email_verified ? " · email verified" : ""}</p>
        <span className="text-xs muted">{user.email}</span>
      </div>
      <ul className="mt-3 grid gap-1.5 text-xs muted sm:grid-cols-2">
        <li>• Files are encrypted before they are stored, in a private cloud bucket.</li>
        <li>• Family sharing needs your approval and can be stopped anytime.</li>
        <li>• Every view, upload and export is in the access log below.</li>
        <li>• Tip: turn on 2-Step Verification in your Google account for extra safety.</li>
      </ul>
    </Section>
  );
}

function AbhaSection() {
  const { profile, refreshProfiles, bump } = useApp();
  const [num, setNum] = useState("");
  const [addr, setAddr] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!profile) return null;
  const abha = profile.abha;
  async function run(fn: () => Promise<string | void>) {
    setErr(null); setMsg(null); setBusy(true);
    try { const m = await fn(); if (m) setMsg(m); await refreshProfiles(); bump(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Section id="abha" icon={<IdCard className="h-5 w-5 text-brand-600" />} title="ABHA (Ayushman Bharat Health Account)" desc="Link an ABHA number or address to this profile. It is added to your FHIR export. Demo mode: we only check the format; real ABDM linking needs government sandbox access and your OTP consent.">
      {abha ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-brand-50 p-4 dark:bg-brand-500/10">
            <div className="text-sm"><p className="font-semibold">{abha.number ?? ""}{abha.number && abha.address ? "  ·  " : ""}{abha.address ?? ""}</p><p className="text-xs muted">Linked {abha.linked_at ? fmtDate(abha.linked_at) : ""} · demo (mock)</p></div>
            <div className="flex gap-2">
              <button className="btn-outline py-2 text-xs" disabled={busy} onClick={() => run(async () => { const r = await api.post<{ results: number }>(`/profiles/${profile.id}/abha/import`); return `Imported a demo record with ${r.results} results (marked as demo).`; })}><Download className="h-3.5 w-3.5" /> Import records (demo)</button>
              <button className="btn-ghost py-2 text-xs text-red-600" disabled={busy} onClick={() => run(async () => { await api.del(`/profiles/${profile.id}/abha`); })}>Unlink</button>
            </div>
          </div>
        </div>
      ) : (
        <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={(e) => { e.preventDefault(); run(async () => { await api.post(`/profiles/${profile.id}/abha/link`, { abha_number: num || null, abha_address: addr || null }); return "ABHA linked (demo)."; }); }}>
          <input className="input" placeholder="ABHA number 12-3456-7890-1234" value={num} onChange={(e) => setNum(e.target.value)} inputMode="numeric" />
          <input className="input" placeholder="ABHA address name@abdm" value={addr} onChange={(e) => setAddr(e.target.value)} />
          <button className="btn-primary" disabled={busy || (!num && !addr)}>Link</button>
        </form>
      )}
      {msg && <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">{msg}</p>}
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
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
      <div><label className="label">Blood group</label>
        <select className="input" value={p.blood_group ?? ""} onChange={(e) => setP({ ...p, blood_group: e.target.value || null })}>
          <option value="">Not set</option>{["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((b) => <option key={b}>{b}</option>)}
        </select></div>
      <div><label className="label">Allergies</label><input className="input" placeholder="e.g. Penicillin, peanuts" value={(p.allergies ?? []).join(", ")} onChange={(e) => setP({ ...p, allergies: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} /></div>
      <div><label className="label">Emergency contact</label><input className="input" placeholder="Name" value={p.emergency_name ?? ""} onChange={(e) => setP({ ...p, emergency_name: e.target.value || null })} /></div>
      <div><label className="label">Emergency phone</label><input className="input" type="tel" placeholder="+91 98xxx xxxxx" value={p.emergency_phone ?? ""} onChange={(e) => setP({ ...p, emergency_phone: e.target.value || null })} /></div>
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
  const [confirmText, setConfirmText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const nav = useNavigate();
  const welcome = new URLSearchParams(location.search).get("welcome");
  const complete = new URLSearchParams(location.search).get("complete");

  useEffect(() => { if (location.hash) setTimeout(() => document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: "smooth" }), 100); }, []);
  if (!user || !profile) return null;
  const conditions = meta?.conditions ?? Object.keys(conditionLabels);

  return (
    <div className="space-y-6">
      <PageHeader icon={<Cog className="h-6 w-6" />} title="Settings" subtitle="Sign-in, family profiles, ABHA and privacy." />
      {welcome && <div className="card flex items-center gap-3 border-brand-300 bg-brand-50 p-4 text-sm dark:bg-brand-500/10"><PartyPopper className="h-5 w-5 text-brand-600" /> Welcome to DOC! Add your date of birth below (needed for formulas), then upload your first report.</div>}
      {(complete || profile.profile_incomplete) && <div className="card flex items-center gap-3 border-amber-300 bg-amber-50 p-4 text-sm dark:bg-amber-500/10"><PartyPopper className="h-5 w-5 text-amber-600" /> Almost done: please confirm your sex and date of birth below. Lab ranges and kidney formulas depend on them.</div>}

      <AccountSecurity />

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
          await api.patch(`/profiles/${profile.id}`, { name: p.name, relation: p.relation, dob: p.dob, sex: p.sex, height_cm: p.height_cm, weight_kg: p.weight_kg, conditions: p.conditions, color: p.color,
            blood_group: p.blood_group || null, allergies: p.allergies ?? [], emergency_name: p.emergency_name || null, emergency_phone: p.emergency_phone || null });
          await refreshProfiles(); bump();
        }} />
        {!profile.is_primary && <button className="btn-ghost mt-3 text-xs text-red-600" onClick={async () => { if (confirm(`Delete ${profile.name}'s profile and all their records?`)) { await api.del(`/profiles/${profile.id}`); await refreshProfiles(); bump(); } }}><Trash2 className="h-3.5 w-3.5" /> Delete this profile</button>}
      </Section>

      <AbhaSection />

      <Section id="ai" icon={<Sparkles className="h-5 w-5 text-brand-600" />} title="AI and own models">
        <p className="text-sm">DOC runs its <b>own models</b> first: OCR + report parser, 8 formulas, flags, XGBoost risk models, its own search model for chat, medicine and diet rule books, and Tamil templates. {meta?.ai_enabled ? <>The optional AI boost is on (<b>{meta.ai_engines?.join("  →  backup: ")}</b>): it helps with messy photos, handwriting and free-form chat. It never does the medical maths.</> : <>The optional AI boost is off. Set <code>GEMINI_API_KEY</code> in <code>backend/.env</code> to add help with messy photos, handwriting and free-form chat.</>}</p>
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
          <button className="btn-outline" onClick={() => openAuthed(`/fhir?profile_id=${profile.id}&download=1`, `doc-${profile.name.split(" ")[0]}.fhir.json`)}><FileJson className="h-4 w-4" /> Download FHIR R4 (for hospitals / ABDM)</button>
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
        <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); setErr(null); try { await api.post("/account/delete", { confirm: confirmText }); logout(); nav("/"); } catch (x) { setErr((x as Error).message); } }}>
          <p className="text-sm muted">This deletes every profile, report, file and result, and stops all family sharing. It cannot be undone. Export your data first if you want a copy.</p>
          <input className="input" placeholder="Type DELETE to confirm" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button className="btn-primary w-full bg-red-600 hover:bg-red-700" disabled={confirmText.trim().toUpperCase() !== "DELETE"}>Delete everything</button>
        </form>
      </Modal>
    </div>
  );
}
