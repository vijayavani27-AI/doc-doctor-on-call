import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  X, ArrowRight, ArrowLeft, Upload, Camera, FileText, CheckCircle2, AlertTriangle, GitMerge, Pill, IndianRupee, Languages, Stethoscope, Share2, ShieldCheck, Lock, KeyRound, PlayCircle, Loader2,
} from "lucide-react";
import { Logo } from "./ui";

const KEY = "doc_tour_seen";

export function tourSeen(): boolean {
  try { return localStorage.getItem(KEY) === "1"; } catch { return true; }
}
function markSeen() {
  try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ }
}

/* ---------- small animated illustrations, one per slide ---------- */
function Visual({ children }: { children: ReactNode }) {
  return <div className="relative mx-auto grid h-52 w-full max-w-sm place-items-center sm:h-60">{children}</div>;
}

const VISUALS: ReactNode[] = [
  <Visual key="0">
    <div className="absolute h-40 w-40 animate-ping rounded-full bg-brand-300/20 [animation-duration:2.4s]" />
    <div className="absolute h-28 w-28 rounded-full bg-brand-200/40 blur-xl" />
    <Logo className="relative h-24 w-24 shadow-lift" />
    <svg viewBox="0 0 300 40" className="absolute bottom-4 w-72 text-brand-500"><path className="tour-ecg" d="M0 20h90l10-14 12 28 10-22 8 8h170" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
  </Visual>,
  <Visual key="1">
    <div className="tour-float card absolute left-6 top-8 w-32 -rotate-6 p-3"><FileText className="h-5 w-5 text-brand-600" /><div className="mt-2 space-y-1"><div className="h-1.5 rounded bg-slate-200" /><div className="h-1.5 w-3/4 rounded bg-slate-200" /><div className="h-1.5 w-1/2 rounded bg-slate-200" /></div><p className="mt-2 text-[10px] font-bold muted">Lab report.pdf</p></div>
    <div className="tour-float card absolute right-6 top-14 w-32 rotate-6 p-3 [animation-delay:.6s]"><Camera className="h-5 w-5 text-violet-600" /><div className="mt-2 h-12 rounded-lg bg-gradient-to-br from-slate-100 to-slate-200" /><p className="mt-2 text-[10px] font-bold muted">Photo of Rx</p></div>
    <div className="absolute bottom-4 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-700 text-white shadow-lift"><Upload className="h-7 w-7 animate-bounce" /></div>
  </Visual>,
  <Visual key="2">
    <div className="card w-72 space-y-2 p-4 text-xs">
      {[["Haemoglobin", "12.6 g/dL", true], ["Platelets", "1.55 lakhs", true], ["SGPT (ALT)", "5O U/L ?", false]].map(([n, v, ok], i) => (
        <div key={i} className={`tour-row flex items-center justify-between rounded-lg border p-2 ${ok ? "border-slate-200" : "border-amber-300 bg-amber-50"}`} style={{ animationDelay: `${i * 0.25}s` }}>
          <span className="font-semibold">{n as string}</span><span className="flex items-center gap-1">{v as string}{ok ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}</span>
        </div>
      ))}
      <div className="mt-1 rounded-lg bg-brand-600 py-1.5 text-center font-bold text-white">Confirm & save</div>
    </div>
  </Visual>,
  <Visual key="3">
    <div className="absolute left-2 top-6 w-28 rounded-xl border border-slate-200 bg-white p-2 text-[10px] shadow-soft"><b>Lab A · May</b><br />Liver AST 55<br />ALT 50</div>
    <div className="absolute right-2 top-6 w-28 rounded-xl border border-slate-200 bg-white p-2 text-[10px] shadow-soft"><b>Lab B · July</b><br />Platelets 155<br />✓ “normal”</div>
    <GitMerge className="tour-merge absolute top-24 h-7 w-7 text-brand-600" />
    <div className="card absolute bottom-2 w-60 border-red-200 p-3 text-xs">
      <p className="font-bold uppercase tracking-wide text-red-600">Hidden risk found</p>
      <p className="text-sm font-extrabold">Liver damage score: 2.93</p>
      <div className="mt-2 h-1.5 rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-red-500"><div className="tour-marker h-3 w-1 -translate-y-[3px] rounded bg-ink" /></div>
    </div>
  </Visual>,
  <Visual key="4">
    <div className="card w-72 space-y-2 p-4 text-xs">
      <div className="flex items-center gap-2"><Pill className="h-4 w-4 text-violet-600" /><b>Telma 40</b><span className="muted">= Telmisartan</span></div>
      <div className="tour-row flex items-center gap-1.5 rounded-lg bg-emerald-50 p-2 text-emerald-800"><IndianRupee className="h-3.5 w-3.5" />Generic saves ~₹3,400/year</div>
      <div className="tour-row flex items-center gap-1.5 rounded-lg bg-red-50 p-2 text-red-700 [animation-delay:.3s]"><AlertTriangle className="h-3.5 w-3.5" />These 3 medicines together can hurt the kidneys</div>
      <div className="tour-row flex items-center gap-1.5 rounded-lg bg-amber-50 p-2 text-amber-800 [animation-delay:.6s]"><AlertTriangle className="h-3.5 w-3.5" />Swelling started after a new BP tablet</div>
    </div>
  </Visual>,
  <Visual key="5">
    <div className="w-72 space-y-2 text-xs">
      <div className="ml-auto w-fit rounded-2xl rounded-br-sm bg-brand-600 px-3 py-2 text-white">How are my kidneys?</div>
      <div className="tour-row w-fit max-w-[85%] rounded-2xl rounded-bl-sm bg-white px-3 py-2 shadow-soft [animation-delay:.4s]">Your kidney score fell from 87 to 58 <span className="rounded bg-brand-100 px-1 text-[9px] font-bold text-brand-800">📄 source</span> Please ask your doctor.</div>
      <div className="flex justify-center gap-1.5 pt-2">{["English", "हिन्दी", "தமிழ்"].map((l) => <span key={l} className="chip bg-white shadow-soft"><Languages className="h-3 w-3" />{l}</span>)}</div>
    </div>
  </Visual>,
  <Visual key="6">
    <div className="card relative w-56 rotate-[-3deg] p-4 text-[10px]">
      <div className="mb-2 rounded-lg bg-gradient-to-r from-brand-600 to-brand-800 p-2 text-white"><b className="text-xs">Doctor visit summary</b></div>
      <div className="space-y-1"><div className="h-1.5 rounded bg-red-200" /><div className="h-1.5 w-4/5 rounded bg-slate-200" /><div className="h-1.5 w-3/5 rounded bg-slate-200" /></div>
      <p className="mt-2 font-bold">Questions for the doctor</p>
      <div className="mt-1 space-y-1"><div className="h-1.5 rounded bg-slate-200" /><div className="h-1.5 w-2/3 rounded bg-slate-200" /></div>
    </div>
    <div className="tour-float absolute bottom-6 right-8 grid h-12 w-12 place-items-center rounded-full bg-emerald-500 text-white shadow-lift"><Share2 className="h-5 w-5" /></div>
    <div className="tour-float absolute left-10 top-8 grid h-12 w-12 place-items-center rounded-full bg-sky-500 text-white shadow-lift [animation-delay:.5s]"><Stethoscope className="h-5 w-5" /></div>
  </Visual>,
  <Visual key="7">
    <div className="absolute h-36 w-36 rounded-full bg-brand-200/40 blur-2xl" />
    <ShieldCheck className="relative h-24 w-24 text-brand-600" />
    <div className="tour-float absolute left-8 top-10 chip bg-white px-3 py-1.5 shadow-soft"><KeyRound className="h-3.5 w-3.5 text-brand-600" /> 2-step login</div>
    <div className="tour-float absolute right-6 top-20 chip bg-white px-3 py-1.5 shadow-soft [animation-delay:.4s]"><Lock className="h-3.5 w-3.5 text-brand-600" /> Encrypted files</div>
    <div className="tour-float absolute bottom-8 left-14 chip bg-white px-3 py-1.5 shadow-soft [animation-delay:.8s]"><Share2 className="h-3.5 w-3.5 text-brand-600" /> You control sharing</div>
  </Visual>,
];

const SLIDES = [
  { tag: "Welcome", title: "Hi, I'm DOC (Doctor On Call)", text: "Your AI helper for medical reports. I read your reports, put them together, and tell you in simple words what needs attention." },
  { tag: "Step 1", title: "Add your reports", text: "Upload lab report PDFs or take a photo of reports and prescriptions. Add old ones too: the more history, the more I can find." },
  { tag: "Step 2", title: "Check what I read", text: "I show every number I read, with the line it came from. Anything I'm unsure about is yellow. You fix it and press Confirm." },
  { tag: "Step 3 ★", title: "I find hidden risks", text: "Each report checks one number at a time. I join numbers from different labs and dates and use proven medical formulas to spot problems no single report shows." },
  { tag: "Step 4", title: "Medicines, made safer", text: "See cheaper generic options, risky medicine combinations, and side effects that started after a new tablet." },
  { tag: "Step 5", title: "Ask me anything", text: "Ask questions in English, Hindi or Tamil, by typing or speaking. Every answer shows where it came from, and I say “I don't know” instead of guessing." },
  { tag: "Step 6", title: "Ready for your doctor", text: "Get a one-page summary with the right questions to ask. Download a PDF or share a link that expires." },
  { tag: "Safe & private", title: "Your data stays yours", text: "2-step login, encrypted files and a full access log. I help you understand. I don't replace your doctor." },
];

export function OnboardingTour({ open, onClose, onDemo, demoBusy }: { open: boolean; onClose: () => void; onDemo?: () => void; demoBusy?: boolean }) {
  const [i, setI] = useState(0);
  const touch = useRef<number | null>(null);
  const last = i === SLIDES.length - 1;

  const close = () => { markSeen(); onClose(); setTimeout(() => setI(0), 300); };
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setI((x) => Math.min(x + 1, SLIDES.length - 1));
      if (e.key === "ArrowLeft") setI((x) => Math.max(x - 1, 0));
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  if (!open) return null;
  const s = SLIDES[i];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-0 backdrop-blur-md sm:p-6" role="dialog" aria-modal="true" aria-label="Welcome tour">
      <div
        className="relative flex h-full w-full flex-col overflow-hidden bg-white sm:h-auto sm:max-w-xl sm:rounded-3xl sm:shadow-2xl dark:bg-[#10201e]"
        onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (touch.current === null) return;
          const dx = e.changedTouches[0].clientX - touch.current;
          if (dx < -50) setI((x) => Math.min(x + 1, SLIDES.length - 1));
          if (dx > 50) setI((x) => Math.max(x - 1, 0));
          touch.current = null;
        }}
      >
        <div className="flex items-center justify-between px-5 pt-5">
          <span className="chip bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">{s.tag}</span>
          <button onClick={close} className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10" aria-label="Skip tour">Skip <X className="h-3.5 w-3.5" /></button>
        </div>

        <div className="bg-gradient-to-b from-brand-50/80 to-transparent px-6 pb-2 pt-4 dark:from-brand-500/10">
          <div key={i} className="animate-fade-up">{VISUALS[i]}</div>
        </div>

        <div className="flex flex-1 flex-col px-6 pb-6 sm:flex-none">
          <div key={`t${i}`} className="animate-fade-up">
            <h2 className="text-2xl font-extrabold tracking-tight text-ink dark:text-white">{s.title}</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">{s.text}</p>
          </div>

          <div className="mt-6 flex items-center justify-center gap-1.5">
            {SLIDES.map((_, j) => (
              <button key={j} onClick={() => setI(j)} aria-label={`Slide ${j + 1}`} className={`h-2 rounded-full transition-all ${j === i ? "w-7 bg-brand-600" : "w-2 bg-slate-300 hover:bg-slate-400 dark:bg-white/20"}`} />
            ))}
          </div>

          <div className="mt-auto pt-6 sm:mt-6">
            {last ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {onDemo && (
                  <button className="btn-primary py-3" onClick={() => { markSeen(); onDemo(); }} disabled={demoBusy}>
                    {demoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />} Try the live demo
                  </button>
                )}
                <Link to="/register" className="btn-outline py-3" onClick={markSeen}>Create free account</Link>
                <button className="text-xs font-semibold text-slate-500 hover:text-brand-700 sm:col-span-2" onClick={() => setI(0)}>Watch again</button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <button className="btn-ghost" onClick={() => setI((x) => Math.max(x - 1, 0))} disabled={i === 0}><ArrowLeft className="h-4 w-4" /> Back</button>
                <span className="text-xs font-semibold muted">{i + 1} / {SLIDES.length}</span>
                <button className="btn-primary" onClick={() => setI((x) => x + 1)}>Next <ArrowRight className="h-4 w-4" /></button>
              </div>
            )}
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-1 bg-slate-100 dark:bg-white/5"><div className="h-full bg-brand-500 transition-all duration-500" style={{ width: `${((i + 1) / SLIDES.length) * 100}%` }} /></div>
      </div>
    </div>
  );
}
