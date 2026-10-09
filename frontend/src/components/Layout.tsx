import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Home, Upload, FolderOpen, BookOpen, HeartPulse, Activity, Radar, Pill, MessageCircle, Stethoscope, Settings, Moon, Sun, LogOut, ChevronDown, Plus, Menu, Sparkles, WifiOff,
  Users, CalendarCheck, Gauge, Utensils, Bandage, HeartHandshake, Siren,
} from "lucide-react";
import { useApp } from "../lib/store";
import { LANG_NAMES, t, type Key } from "../lib/i18n";
import { initials, profileColors } from "../lib/format";
import type { Lang } from "../lib/types";
import { Logo, Modal } from "./ui";

const NAV: { to: string; key: Key; icon: typeof Home; star?: boolean }[] = [
  { to: "/app", key: "dashboard", icon: Home },
  { to: "/app/risks", key: "risks", icon: Radar, star: true },
  { to: "/app/upload", key: "upload", icon: Upload },
  { to: "/app/records", key: "records", icon: FolderOpen },
  { to: "/app/timeline", key: "timeline", icon: Activity },
  { to: "/app/wellness", key: "wellness", icon: HeartPulse },
  { to: "/app/medicines", key: "medicines", icon: Pill },
  { to: "/app/chat", key: "chat", icon: MessageCircle },
  { to: "/app/doctor", key: "doctor", icon: Stethoscope },
  { to: "/app/settings", key: "settings", icon: Settings },
  { to: "/app/guide", key: "guide", icon: BookOpen },
];

const TOOLS: { to: string; key: Key; icon: typeof Home }[] = [
  { to: "/app/family", key: "family", icon: Users },
  { to: "/app/care", key: "care", icon: CalendarCheck },
  { to: "/app/screening", key: "screening", icon: Gauge },
  { to: "/app/meals", key: "meals", icon: Utensils },
  { to: "/app/wound", key: "wound", icon: Bandage },
  { to: "/app/remedies", key: "remedies", icon: HeartHandshake },
  { to: "/app/emergency", key: "emergency", icon: Siren },
];

function Avatar({ name, color, size = "h-9 w-9 text-sm" }: { name: string; color: string; size?: string }) {
  return <div className={`grid shrink-0 place-items-center rounded-full bg-gradient-to-br font-bold text-white ${profileColors[color] ?? profileColors.teal} ${size}`}>{initials(name)}</div>;
}

function ProfileSwitcher() {
  const { profiles, profile, selectProfile } = useApp();
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  if (!profile) return null;
  return (
    <div className="relative">
      <button className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3 text-sm font-semibold shadow-sm hover:border-brand-400 dark:border-white/10 dark:bg-white/5" onClick={() => setOpen((o) => !o)}>
        <Avatar name={profile.name} color={profile.color} size="h-7 w-7 text-xs" />
        <span className="max-w-[5.5rem] truncate sm:max-w-[9rem]">{profile.name.split(" ")[0]}</span>
        <ChevronDown className="h-4 w-4 muted" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="card absolute right-0 z-40 mt-2 w-64 p-2 animate-fade-up">
            <p className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider muted">Family profiles</p>
            {profiles.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  selectProfile(p.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-slate-50 dark:hover:bg-white/5 ${p.id === profile.id ? "bg-brand-50 dark:bg-brand-500/10" : ""}`}
              >
                <Avatar name={p.name} color={p.color} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{p.name}</p>
                  <p className="text-xs capitalize muted">{p.relation}{p.age ? ` · ${p.age} y` : ""}</p>
                </div>
              </button>
            ))}
            <button className="mt-1 flex w-full items-center gap-2 rounded-xl p-2 text-sm font-semibold text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-white/5" onClick={() => { setOpen(false); nav("/app/settings#family"); }}>
              <Plus className="h-4 w-4" /> Add family member
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function TopControls() {
  const { lang, setLang, dark, setDark, user } = useApp();
  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      {user && (
        <span className={`hidden items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold lg:inline-flex ${user.ai_enabled ? "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300" : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300"}`} title={user.ai_enabled ? `DOC's own OCR, parser, formulas and ML models run first; ${user.ai_engine} is an optional boost` : "DOC's own OCR, parser, formulas and ML models (no external AI)"}>
          {user.ai_enabled ? <Sparkles className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />} {user.ai_enabled ? `Own models + ${(user.ai_engine ?? "").split(" ")[0]}` : "Own models"}
        </span>
      )}
      <NavLink to="/app/emergency" className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-1.5 text-[11px] font-extrabold text-white shadow-sm hover:bg-red-700" aria-label="SOS emergency">
        <Siren className="h-3.5 w-3.5" /> SOS
      </NavLink>
      <select aria-label="Language" value={lang} onChange={(e) => setLang(e.target.value as Lang)} className="rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold dark:border-white/10 dark:bg-white/5">
        {(Object.keys(LANG_NAMES) as Lang[]).map((l) => <option key={l} value={l}>{l === "en" ? "EN" : LANG_NAMES[l]}</option>)}
      </select>
      <button className="btn-ghost rounded-full p-2" onClick={() => setDark(!dark)} aria-label="Toggle dark mode">
        {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
      <ProfileSwitcher />
    </div>
  );
}

export function AppLayout() {
  const { lang, user, logout } = useApp();
  const [more, setMore] = useState(false);
  const nav = useNavigate();
  const mobileMain = NAV.filter((n) => ["/app", "/app/risks", "/app/chat"].includes(n.to));

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-slate-200/70 bg-white/80 px-4 py-5 backdrop-blur lg:flex dark:border-white/5 dark:bg-[#0c1917]/80">
        <div className="mb-8 flex items-center gap-2.5 px-2">
          <Logo className="h-9 w-9" />
          <div>
            <p className="text-lg font-extrabold leading-none text-ink dark:text-white">DOC</p>
            <p className="text-[11px] muted">Doctor On Call · AI copilot</p>
          </div>
        </div>
        <nav className="-mx-1 flex-1 space-y-1 overflow-y-auto px-1">
          {NAV.map(({ to, key, icon: Icon, star }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/app"}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${isActive ? "bg-brand-600 text-white shadow-lift" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"}`
              }
            >
              <Icon className="h-[18px] w-[18px]" />
              <span className="flex-1">{t(key, lang)}</span>
              {star && <span className="rounded-md bg-amber-400 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-950">★</span>}
            </NavLink>
          ))}
          <p className="px-3 pb-1 pt-4 text-[11px] font-bold uppercase tracking-wider muted">{t("tools", lang)}</p>
          {TOOLS.map(({ to, key, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${isActive ? "bg-brand-600 text-white shadow-lift" : to === "/app/emergency" ? "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"}`
              }
            >
              <Icon className="h-[18px] w-[18px]" />
              <span className="flex-1">{t(key, lang)}</span>
            </NavLink>
          ))}
        </nav>
        <div className="mt-4 rounded-2xl bg-slate-50 p-3 dark:bg-white/5">
          <p className="truncate text-sm font-semibold">{user?.name}</p>
          <p className="truncate text-xs muted">{user?.email}</p>
          <button className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-red-600" onClick={() => { logout(); nav("/"); }}>
            <LogOut className="h-3.5 w-3.5" /> {t("logout", lang)}
          </button>
        </div>
      </aside>

      {/* Top bar */}
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200/60 bg-[#f6faf9]/85 px-4 py-3 backdrop-blur sm:px-6 dark:border-white/5 dark:bg-[#0a1413]/85">
        <div className="flex items-center gap-2 lg:hidden">
          <Logo className="h-8 w-8" />
          <span className="font-extrabold text-ink dark:text-white">DOC</span>
        </div>
        <div className="hidden lg:block" />
        <TopControls />
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:pb-12">
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden dark:border-white/10 dark:bg-[#0c1917]/95">
        <div className="mx-auto grid max-w-md grid-cols-5 items-end px-2 pt-1.5">
          {mobileMain.slice(0, 2).map(({ to, key, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === "/app"} className={({ isActive }) => `flex flex-col items-center gap-0.5 py-1.5 text-[10.5px] font-semibold ${isActive ? "text-brand-700 dark:text-brand-300" : "text-slate-500"}`}>
              <Icon className="h-5 w-5" /> {t(key, lang)}
            </NavLink>
          ))}
          <NavLink to="/app/upload" className="-mt-6 flex flex-col items-center gap-0.5 text-[10.5px] font-semibold text-slate-500">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-700 text-white shadow-lift"><Upload className="h-6 w-6" /></span>
            {t("upload", lang)}
          </NavLink>
          {mobileMain.slice(2).map(({ to, key, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `flex flex-col items-center gap-0.5 py-1.5 text-[10.5px] font-semibold ${isActive ? "text-brand-700 dark:text-brand-300" : "text-slate-500"}`}>
              <Icon className="h-5 w-5" /> {t(key, lang)}
            </NavLink>
          ))}
          <button onClick={() => setMore(true)} className="flex flex-col items-center gap-0.5 py-1.5 text-[10.5px] font-semibold text-slate-500">
            <Menu className="h-5 w-5" /> {t("more", lang)}
          </button>
        </div>
      </nav>
      <Modal open={more} onClose={() => setMore(false)} title="Menu">
        <div className="grid grid-cols-3 gap-2">
          {[...NAV, ...TOOLS].map(({ to, key, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === "/app"} onClick={() => setMore(false)} className={({ isActive }) => `flex flex-col items-center gap-1.5 rounded-2xl border p-3 text-center text-xs font-semibold ${isActive ? "border-brand-400 bg-brand-50 text-brand-700 dark:bg-brand-500/10" : "border-slate-200 dark:border-white/10"}`}>
              <Icon className="h-5 w-5" /> {t(key, lang)}
            </NavLink>
          ))}
        </div>
        <button className="btn-outline mt-4 w-full" onClick={() => { logout(); nav("/"); }}><LogOut className="h-4 w-4" /> {t("logout", lang)}</button>
      </Modal>
    </div>
  );
}

export { Avatar };
