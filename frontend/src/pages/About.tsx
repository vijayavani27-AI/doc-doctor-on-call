import { Link } from "react-router-dom";
import { HeartPulse, Target, Lightbulb, ShieldCheck, Code2, Users, Calculator, Sparkles, BookOpen, Languages, ArrowRight, Trophy } from "lucide-react";
import { PublicLayout } from "../components/PublicLayout";
import { WaveBackground } from "../components/WaveBackground";
import { initials } from "../lib/format";
import { SITE } from "../lib/site";

const PRINCIPLES = [
  { icon: Calculator, title: "Code does the maths", text: "AI reads and explains. Every medical score is calculated by tested code using published formulas, so results are exact and repeatable." },
  { icon: BookOpen, title: "Proof for every number", text: "Every value links to the report line it came from, and every score shows its formula and research paper." },
  { icon: ShieldCheck, title: "Safe by design", text: "2-step login, encrypted files, personal details removed before AI, expiring share links and a full access log." },
  { icon: Languages, title: "Simple for everyone", text: "Plain words, local languages and a quick check that you understood, made for families, not only doctors." },
];

const STACK = ["React + TypeScript", "Tailwind CSS", "FastAPI (Python)", "Claude AI", "SQLite / Postgres", "PWA (installable app)"];

export default function About() {
  return (
    <PublicLayout>
      <section className="relative overflow-hidden">
        <WaveBackground lines={6} />
        <div className="relative mx-auto max-w-4xl px-4 pb-16 pt-14 text-center sm:px-6">
          <p className="reveal text-xs font-bold uppercase tracking-[0.2em] text-brand-600">About us</p>
          <h1 className="reveal mt-3 text-4xl font-extrabold leading-tight tracking-tight text-ink sm:text-5xl dark:text-white">
            We built a second pair of eyes for every family's <span className="bg-gradient-to-r from-brand-600 to-teal-400 bg-clip-text text-transparent">medical reports</span>.
          </h1>
          <p className="reveal mx-auto mt-5 max-w-2xl text-lg muted">{SITE.name} ({SITE.fullName}) turns a folder of confusing reports into clear, early warnings you can take to your doctor.</p>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-5 px-4 pb-16 sm:px-6 md:grid-cols-3">
        {[
          { icon: Target, title: "The problem", text: "Families carry reports from many labs and doctors. Each page checks one number at a time, so dangerous patterns hide between reports, and a 5-minute doctor visit is too short to find them." },
          { icon: Lightbulb, title: "Our idea", text: "Join the numbers. DOC puts every lab on one scale, combines values across dates and labs, and runs proven medical formulas to spot liver, kidney, blood and sugar problems early." },
          { icon: HeartPulse, title: "Who it's for", text: "Caregivers, often a son or daughter looking after a parent with diabetes or high BP, and anyone who wants to understand their own health better." },
        ].map(({ icon: Icon, title, text }) => (
          <div key={title} className="card spotlight reveal p-6">
            <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"><Icon className="h-5 w-5" /></div>
            <h2 className="font-bold text-ink dark:text-white">{title}</h2>
            <p className="mt-2 text-sm leading-relaxed muted">{text}</p>
          </div>
        ))}
      </section>

      <section className="bg-gradient-to-b from-transparent to-brand-50/60 dark:to-brand-900/10">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="reveal text-center text-3xl font-extrabold tracking-tight text-ink dark:text-white">What we believe</h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {PRINCIPLES.map(({ icon: Icon, title, text }) => (
              <div key={title} className="card spotlight reveal flex gap-4 p-6">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-700 text-white"><Icon className="h-5 w-5" /></div>
                <div><h3 className="font-bold text-ink dark:text-white">{title}</h3><p className="mt-1 text-sm muted">{text}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="reveal">
            <h2 className="flex items-center gap-2 text-2xl font-extrabold text-ink dark:text-white"><Users className="h-6 w-6 text-brand-600" /> The team</h2>
            <p className="mt-2 text-sm muted">Built for the {SITE.hackathon}.</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              {SITE.team.map((m) => (
                <div key={m.name} className="card spotlight p-5 text-center">
                  <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-lg font-extrabold text-white">{initials(m.name)}</div>
                  <p className="mt-3 font-bold">{m.name}</p>
                  <p className="text-xs muted">{m.role}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="reveal">
            <h2 className="flex items-center gap-2 text-2xl font-extrabold text-ink dark:text-white"><Code2 className="h-6 w-6 text-brand-600" /> Built with</h2>
            <div className="mt-6 flex flex-wrap gap-2">{STACK.map((s) => <span key={s} className="chip bg-white px-3 py-1.5 text-sm shadow-soft dark:bg-white/10">{s}</span>)}</div>
            <div className="card mt-6 p-5">
              <p className="flex items-center gap-2 font-bold"><Trophy className="h-5 w-5 text-amber-500" /> By the numbers</p>
              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                {[["8", "medical formulas"], ["32", "lab tests"], ["45", "medicine brands"]].map(([n, l]) => (
                  <div key={l}><p className="text-2xl font-extrabold text-brand-700 dark:text-brand-300">{n}</p><p className="text-xs muted">{l}</p></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 pb-20 sm:px-6">
        <div className="card reveal mx-auto flex max-w-4xl flex-col items-center gap-4 p-8 text-center sm:flex-row sm:text-left">
          <Sparkles className="h-10 w-10 shrink-0 text-brand-600" />
          <div className="flex-1"><p className="text-lg font-bold">Want to see it in action?</p><p className="text-sm muted">Open the demo family or send us a message.</p></div>
          <div className="flex gap-2"><Link to="/" className="btn-primary magnetic">Try DOC <ArrowRight className="h-4 w-4" /></Link><Link to="/contact" className="btn-outline magnetic">Contact</Link></div>
        </div>
      </section>
    </PublicLayout>
  );
}
