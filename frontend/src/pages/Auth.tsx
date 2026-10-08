import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ShieldCheck, Lock, Mail, User as UserIcon, KeyRound, Loader2, PlayCircle, Eye, EyeOff } from "lucide-react";
import { api } from "../lib/api";
import { useApp } from "../lib/store";
import type { User } from "../lib/types";
import { Logo } from "../components/ui";
import { WaveBackground, CursorGlow } from "../components/WaveBackground";
import { CursorFX } from "../components/CursorFX";
import { OnboardingTour } from "../components/OnboardingTour";

interface Session { access_token: string; user: User }

function Shell({ children, title, subtitle }: { children: ReactNode; title: string; subtitle: string }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <CursorFX />
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <WaveBackground tone="white" lines={6} />
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-amber-300/20 blur-3xl" />
        <Link to="/" className="relative flex items-center gap-3">
          <Logo className="h-10 w-10 ring-2 ring-white/30" />
          <span className="text-xl font-extrabold">DOC <span className="text-sm font-semibold text-brand-100">· Doctor On Call</span></span>
        </Link>
        <div className="relative max-w-md">
          <p className="text-4xl font-extrabold leading-tight">Every report says “normal”. Together they tell a different story.</p>
          <p className="mt-4 text-brand-100">DOC joins numbers across labs, dates and prescriptions, and runs published medical formulas to find risks that hide between reports.</p>
        </div>
        <div className="relative flex items-center gap-2 text-sm text-brand-100"><ShieldCheck className="h-4 w-4" /> Two-factor login · encrypted files · you control sharing</div>
      </div>
      <div className="relative flex items-center justify-center overflow-hidden p-6">
        <CursorGlow />
        <WaveBackground className="opacity-40 lg:hidden" lines={5} intensity={0.8} />
        <div className="relative z-10 w-full max-w-sm animate-fade-up">
          <Link to="/" className="mb-8 flex items-center gap-2 lg:hidden"><Logo /> <span className="text-lg font-extrabold">DOC</span></Link>
          <h1 className="text-2xl font-extrabold text-ink dark:text-white">{title}</h1>
          <p className="mb-6 mt-1 text-sm muted">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

function Field({ icon, ...props }: { icon: ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 muted">{icon}</span>
      <input {...props} className="input pl-10" />
    </div>
  );
}

export function useDemoLogin() {
  const { login } = useApp();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  return {
    busy,
    start: async () => {
      setBusy(true);
      try {
        const s = await api.post<Session>("/auth/demo");
        await login(s.access_token, s.user);
        nav("/app");
      } finally {
        setBusy(false);
      }
    },
  };
}

export function Login() {
  const { login } = useApp();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const demo = useDemoLogin();
  const [tour, setTour] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      if (!challenge) {
        const r = await api.post<Session | { requires_2fa: true; challenge_token: string }>("/auth/login", { email, password });
        if ("requires_2fa" in r) {
          setChallenge(r.challenge_token);
          return;
        }
        await login(r.access_token, r.user);
      } else {
        const r = await api.post<Session>("/auth/2fa/verify", { challenge_token: challenge, code });
        await login(r.access_token, r.user);
      }
      nav(loc.state?.from || "/app");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (challenge)
    return (
      <Shell title="Two-step verification" subtitle="Open your authenticator app (Google Authenticator, Microsoft Authenticator, Authy) and enter the 6-digit code for DOC.">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid place-items-center py-2"><div className="grid h-16 w-16 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/10"><KeyRound className="h-8 w-8" /></div></div>
          <input
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123 456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="input text-center text-2xl font-bold tracking-[0.4em]"
          />
          <p className="text-xs muted">Lost your phone? Enter one of your backup codes (like <code>a1b2-c3d4</code>) instead.</p>
          {err && <p className="text-sm font-medium text-red-600">{err}</p>}
          <button className="btn-primary w-full" disabled={busy || code.length < 6}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Verify &amp; sign in</button>
          <button type="button" className="btn-ghost w-full" onClick={() => { setChallenge(null); setCode(""); }}>Back</button>
        </form>
      </Shell>
    );

  return (
    <Shell title="Welcome back" subtitle="Sign in to see your family's health picture.">
      <form onSubmit={submit} className="space-y-3">
        <Field icon={<Mail className="h-4 w-4" />} type="email" placeholder="Email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <div className="relative">
          <Field icon={<Lock className="h-4 w-4" />} type={show ? "text" : "password"} placeholder="Password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 muted" onClick={() => setShow((s) => !s)} aria-label="Show password">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
        </div>
        {err && <p className="text-sm font-medium text-red-600">{err}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Sign in</button>
      </form>
      <div className="my-5 flex items-center gap-3 text-xs muted"><span className="h-px flex-1 bg-slate-200 dark:bg-white/10" /> or <span className="h-px flex-1 bg-slate-200 dark:bg-white/10" /></div>
      <button className="btn-outline w-full" onClick={demo.start} disabled={demo.busy}>{demo.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4 text-brand-600" />} Explore the demo family</button>
      <p className="mt-6 text-center text-sm muted">New here? <Link to="/register" className="font-semibold text-brand-700 dark:text-brand-300">Create an account</Link></p>
      <p className="mt-2 text-center text-sm"><button className="font-semibold text-brand-700 underline-offset-2 hover:underline dark:text-brand-300" onClick={() => setTour(true)}>How does DOC work? Take the 1-minute tour</button></p>
      <OnboardingTour open={tour} onClose={() => setTour(false)} onDemo={demo.start} demoBusy={demo.busy} />
    </Shell>
  );
}

export function Register() {
  const { login } = useApp();
  const nav = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", sex: "F" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const strength = [form.password.length >= 8, /[A-Za-z]/.test(form.password), /\d/.test(form.password), /[^A-Za-z0-9]/.test(form.password) || form.password.length >= 12].filter(Boolean).length;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const r = await api.post<Session>("/auth/register", form);
      await login(r.access_token, r.user);
      nav("/app/settings?welcome=1#security");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell title="Create your account" subtitle="Free. Your reports stay encrypted and private.">
      <form onSubmit={submit} className="space-y-3">
        <Field icon={<UserIcon className="h-4 w-4" />} placeholder="Your name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Field icon={<Mail className="h-4 w-4" />} type="email" placeholder="Email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Field icon={<Lock className="h-4 w-4" />} type="password" placeholder="Password (8+ chars, letters & numbers)" autoComplete="new-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <div className="flex gap-1">{[0, 1, 2, 3].map((i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i < strength ? (strength >= 3 ? "bg-emerald-500" : "bg-amber-500") : "bg-slate-200 dark:bg-white/10"}`} />)}</div>
        <div className="flex gap-2">
          {[["F", "Female"], ["M", "Male"]].map(([v, l]) => (
            <button type="button" key={v} onClick={() => setForm({ ...form, sex: v })} className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${form.sex === v ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300" : "border-slate-300 dark:border-white/15"}`}>{l}</button>
          ))}
        </div>
        <p className="text-xs muted">Sex is needed for correct lab ranges and kidney formulas.</p>
        {err && <p className="text-sm font-medium text-red-600">{err}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Create account</button>
      </form>
      <p className="mt-6 text-center text-sm muted">Already have an account? <Link to="/login" className="font-semibold text-brand-700 dark:text-brand-300">Sign in</Link></p>
    </Shell>
  );
}
