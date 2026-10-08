import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, Compass, ArrowRight, Mail, MapPin, Heart, ArrowUp, Moon, Sun } from "lucide-react";
import { useApp } from "../lib/store";
import { NAV, SITE } from "../lib/site";
import { Logo } from "./ui";
import { CursorFX } from "./CursorFX";
import { CursorGlow } from "./WaveBackground";
import { OnboardingTour } from "./OnboardingTour";
import { useDemoLogin } from "../pages/Auth";

/** Reveal-on-scroll: any element with class `reveal` fades/slides in when it enters the screen. */
export function useReveal(dep?: unknown) {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>(".reveal:not(.reveal-in)");
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add("reveal-in"); io.unobserve(e.target); }
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [dep]);
}

function useActiveSection() {
  const loc = useLocation();
  const [active, setActive] = useState<string>("");
  useEffect(() => {
    if (loc.pathname !== "/") { setActive(""); return; }
    const ids = ["features", "how", "faq"];
    const onScroll = () => {
      let cur = "";
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top < window.innerHeight * 0.4) cur = id;
      }
      setActive(cur);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [loc.pathname]);
  return active;
}

export function PublicHeader({ onTour }: { onTour: () => void }) {
  const { user, dark, setDark } = useApp();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const loc = useLocation();
  const active = useActiveSection();
  useEffect(() => {
    const f = () => setScrolled(window.scrollY > 8);
    f();
    window.addEventListener("scroll", f, { passive: true });
    return () => window.removeEventListener("scroll", f);
  }, []);
  useEffect(() => setOpen(false), [loc.pathname, loc.hash]);

  const isActive = (to: string) => {
    if (to.startsWith("/#")) return loc.pathname === "/" && active === to.slice(2);
    if (to === "/") return loc.pathname === "/" && !active;
    return loc.pathname === to;
  };

  return (
    <header className={`sticky top-0 z-40 transition-all ${scrolled ? "border-b border-slate-200/70 bg-white/80 shadow-soft backdrop-blur-lg dark:border-white/5 dark:bg-[#0a1413]/80" : "bg-transparent"}`}>
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5" aria-label="DOC home">
          <Logo className="h-9 w-9" />
          <span className="leading-none">
            <span className="block text-lg font-extrabold text-ink dark:text-white">{SITE.name}</span>
            <span className="block text-[11px] font-semibold muted">{SITE.fullName}</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.label} to={n.to} className={`relative rounded-full px-3.5 py-2 text-sm font-semibold transition ${isActive(n.to) ? "text-brand-700 dark:text-brand-300" : "text-slate-600 hover:text-ink dark:text-slate-300 dark:hover:text-white"}`}>
              {n.label}
              <span className={`absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-brand-500 transition-transform ${isActive(n.to) ? "scale-x-100" : "scale-x-0"}`} />
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1.5">
          <button className="btn-ghost hidden rounded-full p-2 sm:inline-flex" onClick={() => setDark(!dark)} aria-label="Toggle dark mode">{dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
          <button className="btn-ghost hidden md:inline-flex" onClick={onTour}><Compass className="h-4 w-4" /> Tour</button>
          {user ? (
            <Link to="/app" className="btn-primary magnetic">Open app <ArrowRight className="h-4 w-4" /></Link>
          ) : (
            <>
              <Link to="/login" className="btn-ghost hidden sm:inline-flex">Sign in</Link>
              <Link to="/register" className="btn-primary magnetic hidden sm:inline-flex">Get started</Link>
            </>
          )}
          <button className="btn-ghost rounded-full p-2 lg:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menu" aria-expanded={open}>{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
        </div>
      </div>

      {open && (
        <div className="border-t border-slate-200/70 bg-white/95 px-4 pb-5 pt-2 backdrop-blur-lg animate-fade-up lg:hidden dark:border-white/5 dark:bg-[#0a1413]/95">
          <nav className="grid gap-1" aria-label="Mobile">
            {NAV.map((n) => (
              <Link key={n.label} to={n.to} className={`rounded-xl px-3 py-3 text-base font-semibold ${isActive(n.to) ? "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300" : "text-slate-700 dark:text-slate-200"}`}>{n.label}</Link>
            ))}
          </nav>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button className="btn-outline" onClick={() => { setOpen(false); onTour(); }}><Compass className="h-4 w-4" /> Tour</button>
            <button className="btn-outline" onClick={() => setDark(!dark)}>{dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />} {dark ? "Light" : "Dark"}</button>
            {!user && <Link to="/login" className="btn-outline">Sign in</Link>}
            {!user && <Link to="/register" className="btn-primary">Get started</Link>}
          </div>
        </div>
      )}
    </header>
  );
}

export function PublicFooter() {
  const cols = [
    { title: "Product", links: [["Features", "/#features"], ["How it works", "/#how"], ["Hidden Disease Finder", "/#features"], ["FAQ", "/#faq"]] },
    { title: "Company", links: [["About", "/about"], ["Contact", "/contact"], ["Guide (after login)", "/app/guide"]] },
    { title: "Legal", links: [["Privacy policy", "/legal#privacy"], ["Terms of use", "/legal#terms"], ["Medical disclaimer", "/legal#disclaimer"]] },
  ];
  return (
    <footer className="relative border-t border-slate-200/70 bg-white/60 dark:border-white/5 dark:bg-white/[0.02]">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Link to="/" className="flex items-center gap-2.5"><Logo className="h-9 w-9" /><span className="text-lg font-extrabold text-ink dark:text-white">{SITE.name} <span className="text-sm font-semibold muted">{SITE.fullName}</span></span></Link>
          <p className="mt-3 max-w-xs text-sm muted">{SITE.tagline} An AI health copilot that reads, joins and explains your medical reports.</p>
          <div className="mt-4 space-y-1.5 text-sm">
            <a href={`mailto:${SITE.email}`} className="flex items-center gap-2 muted hover:text-brand-700"><Mail className="h-4 w-4" /> {SITE.email}</a>
            <p className="flex items-center gap-2 muted"><MapPin className="h-4 w-4" /> {SITE.location}</p>
          </div>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-ink dark:text-white">{c.title}</p>
            <ul className="space-y-2 text-sm">
              {c.links.map(([l, to]) => <li key={l}><Link to={to} className="muted transition hover:text-brand-700 dark:hover:text-brand-300">{l}</Link></li>)}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-200/70 dark:border-white/5">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs muted sm:flex-row sm:px-6">
          <p>© {new Date().getFullYear()} {SITE.name} ({SITE.fullName}). Decision support only, not a diagnosis.</p>
          <p className="flex items-center gap-1">Made with <Heart className="h-3 w-3 fill-red-500 text-red-500" /> for the {SITE.hackathon.split(" · ")[0]}</p>
        </div>
      </div>
    </footer>
  );
}

function BackToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const f = () => setShow(window.scrollY > 700);
    window.addEventListener("scroll", f, { passive: true });
    return () => window.removeEventListener("scroll", f);
  }, []);
  return (
    <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Back to top"
      className={`magnetic fixed bottom-6 right-6 z-30 grid h-11 w-11 place-items-center rounded-full bg-brand-600 text-white shadow-lift transition-all ${show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"}`}>
      <ArrowUp className="h-5 w-5" />
    </button>
  );
}

/** Shared shell for public pages: header, cursor effects, tour, footer, scroll-to-hash. */
export function PublicLayout({ children, autoTour = false }: { children: ReactNode; autoTour?: boolean }) {
  const { user } = useApp();
  const demo = useDemoLogin();
  const loc = useLocation();
  const [tour, setTour] = useState(false);

  useEffect(() => {
    if (!autoTour || user) return;
    let seen = true;
    try { seen = localStorage.getItem("doc_tour_seen") === "1"; } catch { /* ignore */ }
    if (!seen) {
      const id = setTimeout(() => setTour(true), 700);
      return () => clearTimeout(id);
    }
  }, [autoTour, user]);

  useEffect(() => {
    if (loc.hash) {
      const id = setTimeout(() => document.getElementById(loc.hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
      return () => clearTimeout(id);
    }
    window.scrollTo({ top: 0 });
  }, [loc.pathname, loc.hash]);

  useReveal(loc.pathname);

  return (
    <div className="relative min-h-dvh overflow-x-clip">
      <CursorGlow />
      <CursorFX />
      <PublicHeader onTour={() => setTour(true)} />
      <main>{children}</main>
      <PublicFooter />
      <BackToTop />
      <OnboardingTour open={tour} onClose={() => setTour(false)} onDemo={demo.start} demoBusy={demo.busy} />
    </div>
  );
}

