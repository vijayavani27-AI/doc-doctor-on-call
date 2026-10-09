import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { UploadCloud, Camera, FileText, Lock, EyeOff, Sparkles, GitMerge, Ruler, CheckCircle2, Loader2, Pill, FlaskConical, Wand2 } from "lucide-react";
import { api } from "../lib/api";
import { useApp } from "../lib/store";
import type { Report } from "../lib/types";
import { PageHeader } from "../components/ui";
import { SampleReports } from "../components/SampleReports";
import { Link } from "react-router-dom";

const STEPS = [
  { icon: Lock, text: "Encrypting your file" },
  { icon: EyeOff, text: "Removing name, phone and ID numbers" },
  { icon: Sparkles, text: "Reading values, units and ranges" },
  { icon: GitMerge, text: "Matching test names to standard codes" },
  { icon: Ruler, text: "Converting units to one scale" },
];

export default function UploadPage() {
  const { profile, user, bump } = useApp();
  const nav = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<"auto" | "lab" | "prescription">("auto");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  async function send(file: File) {
    if (!profile) return;
    setErr(null);
    setBusy(true);
    setStep(0);
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 900);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind);
      const rep = await api.upload<Report>(`/profiles/${profile.id}/reports`, fd);
      bump();
      nav(`/app/records/${rep.id}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      clearInterval(timer);
      setBusy(false);
    }
  }

  const pick = (f?: File | null) => f && send(f);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader icon={<UploadCloud className="h-6 w-6" />} title="Add a report" subtitle={`For ${profile?.name}. Lab reports, scans, phone photos or handwritten prescriptions. You'll confirm everything before it's saved.`} />

      <div className="mb-4 flex gap-2">
        {([["auto", "Detect automatically", Wand2], ["lab", "Lab report", FlaskConical], ["prescription", "Prescription", Pill]] as const).map(([k, l, Icon]) => (
          <button key={k} onClick={() => setKind(k)} className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-semibold sm:text-sm ${kind === k ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300" : "border-slate-200 bg-white dark:border-white/10 dark:bg-white/5"}`}>
            <Icon className="h-4 w-4" /> {l}
          </button>
        ))}
      </div>

      {busy ? (
        <div className="card p-8">
          <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-2xl bg-brand-50 dark:bg-brand-500/10"><Loader2 className="h-8 w-8 animate-spin text-brand-600" /></div>
          <ul className="mx-auto max-w-sm space-y-3">
            {STEPS.map(({ icon: Icon, text }, i) => (
              <li key={text} className={`flex items-center gap-3 text-sm transition ${i <= step ? "" : "opacity-40"}`}>
                {i < step ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : i === step ? <Icon className="h-5 w-5 animate-pulse text-brand-600" /> : <Icon className="h-5 w-5" />}
                {text}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-center text-xs muted">{user?.ai_enabled ? `DOC's own reader (OCR + parser) goes first; ${(user.ai_engine ?? "AI").split(" ")[0]} helps with messy photos. Photos can take up to a minute.` : "DOC's own reader: PDF text and OCR for photos (English + Tamil). Unsure values are marked for you to check."}</p>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}
          className={`card flex flex-col items-center border-2 border-dashed px-6 py-14 text-center transition ${drag ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10" : "border-slate-300 dark:border-white/15"}`}
        >
          <div className="mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-700 text-white shadow-lift"><UploadCloud className="h-8 w-8" /></div>
          <p className="text-lg font-bold">Drop a file here</p>
          <p className="mt-1 text-sm muted">PDF, JPG, PNG or WEBP · up to 15 MB</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button className="btn-primary" onClick={() => input.current?.click()}><FileText className="h-4 w-4" /> Choose file</button>
            <button className="btn-outline" onClick={() => camera.current?.click()}><Camera className="h-4 w-4" /> Take photo</button>
          </div>
          <input ref={input} type="file" hidden accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => pick(e.target.files?.[0])} />
          <input ref={camera} type="file" hidden accept="image/*" capture="environment" onChange={(e) => pick(e.target.files?.[0])} />
        </div>
      )}
      {err && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">{err}</p>}

      <details className="card mt-6 p-5" open={profile?.counts.reports === 0}>
        <summary className="cursor-pointer font-bold">🧪 No reports yet? Download the test kit</summary>
        <p className="mb-4 mt-2 text-sm muted">6 sample PDFs for a fictional patient, plus an answer key that lists exactly what DOC should find. See the <Link to="/app/guide" className="font-semibold text-brand-700 dark:text-brand-300">Guide</Link> for the steps.</p>
        <SampleReports compact />
      </details>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {[
          [Lock, "Encrypted at rest", "Original files are stored encrypted. Only you can open them."],
          [EyeOff, "Personal details removed", "Names, phones and IDs are stripped from text before the AI sees it."],
          [CheckCircle2, "You stay in control", "Nothing counts until you confirm it. Unsure values are highlighted."],
        ].map(([Icon, title, text]) => {
          const I = Icon as typeof Lock;
          return (
            <div key={title as string} className="rounded-2xl bg-white/60 p-4 text-sm dark:bg-white/5">
              <I className="mb-2 h-5 w-5 text-brand-600" />
              <p className="font-semibold">{title as string}</p>
              <p className="text-xs muted">{text as string}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
