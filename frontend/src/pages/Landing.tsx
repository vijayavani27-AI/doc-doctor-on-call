import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Radar, ScanLine, GitMerge, Pill, MessageCircle, Stethoscope, ShieldCheck, Languages, Users, TrendingDown, IndianRupee, Loader2, PlayCircle, FileText, CheckCircle2, Lock, Sparkles, ChevronDown, Mail, HeartPulse,
} from "lucide-react";
import { useDemoLogin } from "./Auth";
import { WaveBackground } from "../components/WaveBackground";
import { PublicLayout } from "../components/PublicLayout";

const FEATURES = [
  { icon: Radar, title: "Hidden Disease Finder", text: "Runs 8 published formulas (FIB-4, eGFR, Mentzer, TyG…) by joining values from different labs and dates. Finds liver scarring, silent kidney decline, thalassaemia trait and insulin resistance.", star: true },
  { icon: ScanLine, title: "Reads any report", text: "PDFs, phone photos and handwritten prescriptions. Claude AI transcribes; you confirm anything it's unsure about." },
  { icon: GitMerge, title: "One scale for every lab", text: "2.5 lakhs/cumm, 250 ×10³/µL and 250000/cumm all become one trend line, mapped to standard LOINC test codes." },
  { icon: TrendingDown, title: "Personal-normal alerts", text: "Spots values that are still 'normal' but drifting steadily toward a limit for you." },
  { icon: Pill, title: "Medicine safety net", text: "Finds prescribing cascades, risky combinations for the kidneys, overdue B12 checks and side-effect timing." },
  { icon: IndianRupee, title: "Next Best Test & savings", text: "Tells you the cheapest test that unlocks the most insight, plus generic and Jan Aushadhi alternatives." },
  { icon: MessageCircle, title: "Ask AI with proof", text: "Every answer cites the exact report line. A second AI checks each claim, and it says 'I don't know' when unsure." },
  { icon: Stethoscope, title: "Doctor visit in 1 page", text: "Hidden risks, trends, medicines and the right questions as a PDF or a share link that expires." },
  { icon: Languages, title: "Your language", text: "Simple explanations in English, हिन्दी and தமிழ், with a quick check that you understood." },
  { icon: Users, title: "Whole family", text: "Manage parents and children from one account. Built for caregivers." },
  { icon: HeartPulse, title: "Wellness data", text: "Home BP, sugar, weight, heart rate, oxygen, steps and sleep, by hand or CSV import, checked against guideline targets and linked to your medicines." },
];

const FAQ = [
  ["Is DOC a doctor?", "No. DOC is a smart helper. It reads and organises your reports, finds patterns and explains them simply, so you can have a better talk with your real doctor. It never diagnoses or changes medicines."],
  ["What does “hidden risk” mean?", "Each lab report checks one number at a time. Some problems only show up when numbers from different reports are combined. For example, a liver test from one lab and a blood count from another give the FIB-4 liver score. DOC does that joining for you, using published medical formulas."],
  ["Which reports can I upload?", "Lab reports (PDF or photo), prescriptions, even handwritten ones. Old reports are useful too, because trends need history."],
  ["How do I know the results are right?", "Every number links to the exact line of the report it came from, and every score shows its formula and research source. You can also try the test kit with its answer key, or check any score in a free online calculator."],
  ["Is my data safe?", "Login uses a password plus a 6-digit code (2FA). Files are stored encrypted, names and phone numbers are removed before AI reading, and you can export or delete everything anytime."],
  ["Does it work in Hindi or Tamil?", "Yes. Explanations and chat answers can be in English, हिन्दी or தமிழ் (with AI turned on)."],
  ["Does it cost money?", "DOC is free for families in this hackathon version. The ₹ prices shown for tests and generic medicines are only estimates to help you plan."],
];

export default function Landing() {
  const demo = useDemoLogin();
  const [faq, setFaq] = useState<number | null>(0);
  return (
    <PublicLayout autoTour>
      {/* Hero */}
      <section className="relative">
        <div className="pointer-events-none absolute -top-40 left-1/2 h-[36rem] w-[60rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-brand-200/60 via-teal-100/40 to-amber-100/50 blur-3xl dark:from-brand-700/20 dark:via-transparent dark:to-amber-500/10" />
        <WaveBackground />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-2 lg:pt-20">
          <div className="animate-fade-up">
            <span className="chip mb-5 bg-white text-brand-700 shadow-soft dark:bg-white/10 dark:text-brand-300"><Sparkles className="h-3.5 w-3.5" /> AI-Powered Personal Health Copilot</span>
            <h1 className="text-4xl font-extrabold leading-[1.08] tracking-tight text-ink sm:text-5xl lg:text-6xl dark:text-white">
              Find the disease hiding <span className="bg-gradient-to-r from-brand-600 to-teal-400 bg-clip-text text-transparent">between your reports.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-slate-600 dark:text-slate-300">
              Each lab report checks one number at a time. DOC joins them across labs, dates and prescriptions, runs validated medical formulas, and explains what it finds in simple words, with proof for every claim.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button onClick={demo.start} disabled={demo.busy} className="btn-primary magnetic px-6 py-3 text-base">
                {demo.busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <PlayCircle className="h-5 w-5" />} Try the live demo
              </button>
              <Link to="/register" className="btn-outline magnetic px-6 py-3 text-base">Create free account</Link>
            </div>
            <p className="mt-4 flex items-center gap-2 text-xs muted"><Lock className="h-3.5 w-3.5" /> 2-factor login · encrypted files · not a diagnosis, a smarter way to prepare for your doctor</p>
          </div>

          {/* Visual: two "normal" reports -> one hidden risk */}
          <div className="relative mx-auto w-full max-w-md animate-fade-up [animation-delay:120ms]">
            <div className="grid grid-cols-2 gap-3">
              {[
                { lab: "Sunrise Diagnostics", date: "18 May 2026", rows: [["AST (SGOT)", "55 U/L"], ["ALT (SGPT)", "50 U/L"]] },
                { lab: "CityCare Pathology", date: "02 Jul 2026", rows: [["Platelets", "1.55 lakhs"], ["Haemoglobin", "12.0 g/dL"]] },
              ].map((r, i) => (
                <div key={i} className={`card p-3.5 ${i ? "translate-y-6" : ""}`}>
                  <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold muted"><FileText className="h-3.5 w-3.5" />{r.lab}</div>
                  {r.rows.map(([n, v]) => <div key={n} className="flex justify-between border-t border-slate-100 py-1.5 text-xs dark:border-white/5"><span>{n}</span><b>{v}</b></div>)}
                  <div className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> “Mostly normal”</div>
                  <div className="text-[10px] muted">{r.date}</div>
                </div>
              ))}
            </div>
            <div className="mx-auto my-3 mt-9 flex w-fit items-center gap-2 rounded-full bg-ink px-3 py-1 text-[11px] font-bold text-white dark:bg-white dark:text-ink"><GitMerge className="h-3.5 w-3.5" /> joined by DOC</div>
            <div className="card relative overflow-hidden border-red-200 p-5 shadow-lift dark:border-red-500/30">
              <div className="absolute right-4 top-4 h-3 w-3 animate-pulse-ring rounded-full bg-red-500" />
              <p className="text-xs font-bold uppercase tracking-wider text-red-600">Hidden risk found</p>
              <p className="mt-1 text-lg font-extrabold text-ink dark:text-white">Liver scarring: FIB-4 = 2.93</p>
              <p className="text-sm muted">(58 y × AST 55) ÷ (Platelets 155 × √ALT 50)</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-red-500"><div className="ml-[82%] h-2 w-1 bg-ink dark:bg-white" /></div>
              <div className="mt-1 flex justify-between text-[10px] muted"><span>1.30 low</span><span>2.67 high</span></div>
              <p className="mt-3 text-sm">Was 1.15 in 2023 → rising every year. <b>Next step:</b> ask about a FibroScan.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats strip */}
      <section className="border-y border-slate-200/70 bg-white/60 dark:border-white/5 dark:bg-white/[0.02]">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-8 text-center sm:px-6 md:grid-cols-4">
          {[["8", "validated formulas"], ["32", "lab tests understood"], ["45", "Indian brands → generics"], ["3", "languages"]].map(([n, l]) => (
            <div key={l}><p className="text-3xl font-extrabold text-brand-700 dark:text-brand-300">{n}</p><p className="text-sm muted">{l}</p></div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
        <p className="reveal text-center text-xs font-bold uppercase tracking-[0.2em] text-brand-600">Features</p>
        <h2 className="reveal mt-2 text-center text-3xl font-extrabold tracking-tight text-ink sm:text-4xl dark:text-white">Understand. Organise. Act.</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center muted">Everything a family needs to manage a long-term condition, from a pile of mixed reports.</p>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text, star }) => (
            <div key={title} className={`card spotlight reveal p-6 transition hover:-translate-y-0.5 hover:shadow-lift ${star ? "border-brand-300 ring-2 ring-brand-200 sm:col-span-2 lg:col-span-1 lg:row-span-2 dark:ring-brand-500/20" : ""}`}>
              <div className={`mb-4 grid h-11 w-11 place-items-center rounded-xl ${star ? "bg-gradient-to-br from-brand-400 to-brand-700 text-white" : "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"}`}><Icon className="h-5 w-5" /></div>
              <h3 className="font-bold text-ink dark:text-white">{title} {star && <span className="chip ml-1 bg-amber-300 text-amber-950">★ Core</span>}</h3>
              <p className="mt-2 text-sm leading-relaxed muted">{text}</p>
              {star && (
                <ul className="mt-5 space-y-2 text-sm">
                  {["FIB-4 & APRI: liver scarring", "eGFR CKD-EPI 2021 + decline rate: kidneys", "Mentzer index: thalassaemia vs iron deficiency", "TyG & TG/HDL: insulin resistance", "Non-HDL, corrected calcium"].map((x) => (
                    <li key={x} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />{x}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-20 bg-gradient-to-b from-transparent to-brand-50/60 dark:to-brand-900/10">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <p className="reveal text-center text-xs font-bold uppercase tracking-[0.2em] text-brand-600">How it works</p>
          <h2 className="reveal mt-2 text-center text-3xl font-extrabold tracking-tight text-ink dark:text-white">Three steps, about a minute</h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {[
              ["1", "Snap or upload", "Photos, PDFs, prescriptions. Personal details are removed before AI reading, and files are encrypted."],
              ["2", "Confirm in 10 seconds", "DOC shows what it read, line by line. Low-confidence values are highlighted for you to fix."],
              ["3", "See what's hiding", "Formulas run across all your reports. Get risks, trends, medicine checks and the next best test."],
            ].map(([n, title, text]) => (
              <div key={n} className="card spotlight reveal p-6">
                <div className="mb-4 grid h-10 w-10 place-items-center rounded-full bg-ink text-sm font-extrabold text-white dark:bg-white dark:text-ink">{n}</div>
                <h3 className="font-bold text-ink dark:text-white">{title}</h3>
                <p className="mt-2 text-sm muted">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="card spotlight reveal grid gap-8 p-8 md:grid-cols-2 md:p-12">
          <div>
            <ShieldCheck className="h-10 w-10 text-brand-600" />
            <h2 className="mt-4 text-2xl font-extrabold text-ink dark:text-white">Built to be trusted</h2>
            <p className="mt-2 muted">The AI reads and explains. Medical maths is done by tested code using published equations, so results are repeatable and auditable.</p>
          </div>
          <ul className="space-y-3 text-sm">
            {["Every number links to its source report line", "A second AI fact-checks every chat answer", "Says “I don't know” instead of guessing", "Time-based 2FA, backup codes, rate-limited login", "Encrypted uploads; personal details removed before AI", "Share links that expire; full access log; delete anytime"].map((x) => (
              <li key={x} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />{x}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 pb-20 sm:px-6">
        <p className="reveal text-center text-xs font-bold uppercase tracking-[0.2em] text-brand-600">FAQ</p>
        <h2 className="reveal mt-2 text-center text-3xl font-extrabold tracking-tight text-ink dark:text-white">Questions people ask</h2>
        <div className="mt-10 space-y-3">
          {FAQ.map(([q, a], i) => (
            <div key={q} className={`card spotlight reveal overflow-hidden transition ${faq === i ? "ring-1 ring-brand-300 dark:ring-brand-500/30" : ""}`}>
              <button className="flex w-full items-center justify-between gap-4 p-5 text-left font-bold" onClick={() => setFaq(faq === i ? null : i)} aria-expanded={faq === i}>
                {q}
                <ChevronDown className={`h-5 w-5 shrink-0 text-brand-600 transition-transform ${faq === i ? "rotate-180" : ""}`} />
              </button>
              <div className={`grid transition-all duration-300 ${faq === i ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                <div className="overflow-hidden"><p className="px-5 pb-5 text-sm leading-relaxed muted">{a}</p></div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA band */}
      <section className="px-4 pb-20 sm:px-6">
        <div className="reveal relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 px-6 py-14 text-center text-white shadow-lift sm:px-12">
          <WaveBackground tone="white" lines={5} />
          <div className="relative">
            <h2 className="text-3xl font-extrabold sm:text-4xl">See what your reports are hiding</h2>
            <p className="mx-auto mt-3 max-w-xl text-brand-100">Try the demo family in one click, or create a free account and upload your first report.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <button onClick={demo.start} disabled={demo.busy} className="btn magnetic bg-white px-6 py-3 text-base text-brand-800 hover:bg-brand-50">{demo.busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <PlayCircle className="h-5 w-5" />} Try the live demo</button>
              <Link to="/contact" className="btn magnetic border border-white/40 px-6 py-3 text-base text-white hover:bg-white/10"><Mail className="h-5 w-5" /> Contact us</Link>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
