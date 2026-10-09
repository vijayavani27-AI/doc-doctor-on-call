import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ShieldCheck, Lock, Mail, User as UserIcon, Loader2, PlayCircle, Eye, EyeOff } from "lucide-react";
import { api } from "../lib/api";
import { useApp } from "../lib/store";
import type { User } from "../lib/types";
import { Logo } from "../components/ui";
import { WaveBackground, CursorGlow } from "../components/WaveBackground";
import { CursorFX } from "../components/CursorFX";
import { OnboardingTour } from "../components/OnboardingTour";
import { authConfig, friendly, registerWithEmail, resetPassword, signInWithEmail, signInWithGoogle, type AuthConfig } from "../lib/firebase";

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
        <div className="relative flex items-center gap-2 text-sm text-brand-100"><ShieldCheck className="h-4 w-4" /> Google sign-in · encrypted files · you control sharing</div>
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

function useAuthMode() {
  const [cfg, setCfg] = useState<AuthConfig | null>(null);
  useEffect(() => {
    authConfig().then(setCfg);
  }, []);
  return cfg;
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function Divider({ text = "or" }: { text?: string }) {
  return <div className="my-5 flex items-center gap-3 text-xs muted"><span className="h-px flex-1 bg-slate-200 dark:bg-white/10" /> {text} <span className="h-px flex-1 bg-slate-200 dark:bg-white/10" /></div>;
}

export function Login() {
  const { login } = useApp();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const cfg = useAuthMode();
  const fire = cfg?.mode === "firebase";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<"" | "email" | "google">("");
  const demo = useDemoLogin();
  const [tour, setTour] = useState(false);

  async function done(s: Session) {
    await login(s.access_token, s.user);
    nav(s.user.profile_incomplete ? "/app/settings?complete=1" : loc.state?.from || "/app");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setNote(null);
    setBusy("email");
    try {
      await done(fire ? await signInWithEmail(email, password) : await api.post<Session>("/auth/login", { email, password }));
    } catch (e) {
      setErr(friendly(e));
    } finally {
      setBusy("");
    }
  }

  async function google() {
    setErr(null);
    setBusy("google");
    try {
      await done(await signInWithGoogle());
    } catch (e) {
      setErr(friendly(e));
    } finally {
      setBusy("");
    }
  }

  async function forgot() {
    setErr(null);
    if (!email) return setErr("Type your email above first, then tap 'Forgot password'.");
    try {
      await resetPassword(email);
      setNote("If an account exists for this email, a reset link is on its way. Check your inbox and spam folder.");
    } catch (e) {
      setErr(friendly(e));
    }
  }

  return (
    <Shell title="Welcome back" subtitle="Sign in to see your family's health picture.">
      {fire && (
        <>
          <button className="btn-outline w-full" onClick={google} disabled={!!busy}>
            {busy === "google" ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />} Continue with Google
          </button>
          <Divider text="or use email" />
        </>
      )}
      <form onSubmit={submit} className="space-y-3">
        <Field icon={<Mail className="h-4 w-4" />} type="email" placeholder="Email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <div className="relative">
          <Field icon={<Lock className="h-4 w-4" />} type={show ? "text" : "password"} placeholder="Password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 muted" onClick={() => setShow((s) => !s)} aria-label="Show password">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
        </div>
        {fire && <div className="text-right"><button type="button" className="text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300" onClick={forgot}>Forgot password?</button></div>}
        {err && <p className="text-sm font-medium text-red-600">{err}</p>}
        {note && <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">{note}</p>}
        <button className="btn-primary w-full" disabled={!!busy || !cfg}>{busy === "email" && <Loader2 className="h-4 w-4 animate-spin" />} Sign in</button>
      </form>
      <Divider />
      <button className="btn-outline w-full" onClick={demo.start} disabled={demo.busy}>{demo.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4 text-brand-600" />} Explore the demo family</button>
      <p className="mt-6 text-center text-sm muted">New here? <Link to="/register" className="font-semibold text-brand-700 dark:text-brand-300">Create an account</Link></p>
      <p className="mt-2 text-center text-sm"><button className="font-semibold text-brand-700 underline-offset-2 hover:underline dark:text-brand-300" onClick={() => setTour(true)}>How does DOC work? Take the 1-minute tour</button></p>
      <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs muted"><ShieldCheck className="h-3.5 w-3.5" /> {fire ? "Secure sign-in by Google Firebase" : "Local development sign-in"}</p>
      <OnboardingTour open={tour} onClose={() => setTour(false)} onDemo={demo.start} demoBusy={demo.busy} />
    </Shell>
  );
}

export function Register() {
  const { login } = useApp();
  const nav = useNavigate();
  const cfg = useAuthMode();
  const fire = cfg?.mode === "firebase";
  const [form, setForm] = useState({ name: "", email: "", password: "", sex: "F" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<"" | "email" | "google">("");
  const strength = [form.password.length >= 8, /[A-Za-z]/.test(form.password), /\d/.test(form.password), /[^A-Za-z0-9]/.test(form.password) || form.password.length >= 12].filter(Boolean).length;

  async function done(s: Session) {
    await login(s.access_token, s.user);
    nav(s.user.profile_incomplete ? "/app/settings?complete=1" : "/app?welcome=1");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (strength < 3) return setErr("Please use at least 8 characters with letters and numbers.");
    setBusy("email");
    try {
      await done(fire ? await registerWithEmail(form.name, form.email, form.password, form.sex) : await api.post<Session>("/auth/register", form));
    } catch (e) {
      setErr(friendly(e));
    } finally {
      setBusy("");
    }
  }

  async function google() {
    setErr(null);
    setBusy("google");
    try {
      await done(await signInWithGoogle({ sex: form.sex }));
    } catch (e) {
      setErr(friendly(e));
    } finally {
      setBusy("");
    }
  }

  const sexPicker = (
    <>
      <div className="flex gap-2">
        {[["F", "Female"], ["M", "Male"]].map(([v, l]) => (
          <button type="button" key={v} onClick={() => setForm({ ...form, sex: v })} className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${form.sex === v ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300" : "border-slate-300 dark:border-white/15"}`}>{l}</button>
        ))}
      </div>
      <p className="text-xs muted">Sex is needed for correct lab ranges and kidney formulas.</p>
    </>
  );

  return (
    <Shell title="Create your account" subtitle="Free. Your reports stay encrypted and private.">
      {fire && (
        <div className="space-y-3">
          {sexPicker}
          <button className="btn-outline w-full" onClick={google} disabled={!!busy}>
            {busy === "google" ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />} Sign up with Google
          </button>
          <Divider text="or use email" />
        </div>
      )}
      <form onSubmit={submit} className="space-y-3">
        <Field icon={<UserIcon className="h-4 w-4" />} placeholder="Your name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Field icon={<Mail className="h-4 w-4" />} type="email" placeholder="Email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Field icon={<Lock className="h-4 w-4" />} type="password" placeholder="Password (8+ chars, letters & numbers)" autoComplete="new-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <div className="flex gap-1">{[0, 1, 2, 3].map((i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i < strength ? (strength >= 3 ? "bg-emerald-500" : "bg-amber-500") : "bg-slate-200 dark:bg-white/10"}`} />)}</div>
        {!fire && sexPicker}
        {err && <p className="text-sm font-medium text-red-600">{err}</p>}
        <button className="btn-primary w-full" disabled={!!busy || !cfg}>{busy === "email" && <Loader2 className="h-4 w-4 animate-spin" />} Create account</button>
        {fire && <p className="text-xs muted">We'll email you a link to confirm your address.</p>}
      </form>
      <p className="mt-6 text-center text-sm muted">Already have an account? <Link to="/login" className="font-semibold text-brand-700 dark:text-brand-300">Sign in</Link></p>
    </Shell>
  );
}
