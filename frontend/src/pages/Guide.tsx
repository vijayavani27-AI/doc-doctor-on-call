import { Link } from "react-router-dom";
import {
  BookOpen, UserPlus, Upload, ClipboardCheck, Radar, Home, FolderOpen, Activity, Pill, MessageCircle, Stethoscope, Settings, ShieldCheck, CheckCircle2, FlaskConical, Calculator, Sparkles, HeartPulse,
} from "lucide-react";
import { PageHeader } from "../components/ui";
import { SampleReports } from "../components/SampleReports";

const STEPS = [
  { icon: UserPlus, title: "Set up the person", text: "Settings → Family profiles. Add the date of birth, sex and known conditions (e.g. Diabetes, High BP). The formulas need age and sex. Conditions switch on the right reminders.", to: "/app/settings#family" },
  { icon: ShieldCheck, title: "Turn on 2FA (recommended)", text: "Settings → Two-factor authentication → scan the QR code with Google/Microsoft Authenticator → type the 6-digit code. Save your backup codes.", to: "/app/settings#security" },
  { icon: Upload, title: "Upload reports", text: "Upload → choose a PDF or take a photo. Old reports matter: the more history, the more DOC can find.", to: "/app/upload" },
  { icon: ClipboardCheck, title: "Check & confirm", text: "DOC shows every value it read, with its source line. Yellow rows are ones it's unsure about; fix them, then press Confirm & save.", to: "/app/records" },
  { icon: Radar, title: "See hidden risks", text: "Hidden Risks shows scores calculated by joining your reports, what each means, and the next step.", to: "/app/risks" },
  { icon: Stethoscope, title: "Take it to your doctor", text: "Doctor Visit → download the PDF or share a link that expires. It includes the questions to ask.", to: "/app/doctor" },
];

const FEATURES: { icon: typeof Home; page: string; to: string; items: string[] }[] = [
  { icon: Home, page: "Home (Dashboard)", to: "/app", items: ["Health snapshot score", "Top 3 things to do now", "Hidden-risk tiles", "Next best test", "Key numbers with mini-charts", "Alerts & silent trends", "Recent reports"] },
  { icon: Radar, page: "Hidden Risks ★", to: "/app/risks", items: ["8 medical formulas joined across reports: FIB-4, APRI, eGFR + decline rate, Mentzer, TyG, TG/HDL, Non-HDL, corrected calcium", "Colour gauge, formula with your numbers, citation", "Every input links to its report", "Trend over the years", "Personal-normal (silent drift) alerts", "Next Best Test with ₹ estimate"] },
  { icon: Upload, page: "Upload & Review", to: "/app/upload", items: ["PDF / photo / camera", "AI reading with a confidence score per value (offline reader for text PDFs)", "Unit conversion to one scale", "Personal details removed before AI", "Edit, add or delete values before saving", "Encrypted original file"] },
  { icon: FolderOpen, page: "Records", to: "/app/records", items: ["All reports with search & filters", "All values table with LOINC codes", "'As printed' vs stored value", "Explain any value simply"] },
  { icon: Activity, page: "Timeline & Trends", to: "/app/timeline", items: ["One chart per test across all labs", "Normal-range band and lab-change markers", "Score history", "Timeline of reports, medicines, symptoms and risks"] },
  { icon: HeartPulse, page: "Wellness", to: "/app/wellness", items: ["Home BP, sugar, weight & BMI, heart rate, oxygen, steps, sleep", "Add by hand or import a CSV (template provided)", "30-day averages and charts against guideline targets", "Linked to medicines, e.g. BP rise after a painkiller", "Shown in Ask AI and the Doctor summary"] },
  { icon: Pill, page: "Medicines", to: "/app/medicines", items: ["Brand → generic name", "Yearly saving with generics", "Kidney dose checks", "Prescribing cascades", "Risky combinations (triple whammy)", "Monitoring due (e.g. B12 on metformin)", "Symptom diary & side-effect timing"] },
  { icon: MessageCircle, page: "Ask AI", to: "/app/chat", items: ["Answers only from your records", "Source button on every fact", "Second AI fact-checks the answer", "Says 'I don't know' when unsure", "Voice input & read aloud", "English / Hindi / Tamil"] },
  { icon: Stethoscope, page: "Doctor Visit", to: "/app/doctor", items: ["One-page summary", "PDF download & print", "Share link that expires (24 h / 3 d / 7 d), can be revoked, views counted", "WhatsApp share"] },
  { icon: Settings, page: "Settings", to: "/app/settings", items: ["2FA with QR + backup codes", "Family profiles (up to 10)", "Language & dark mode", "Access log", "Export all data", "Delete account"] },
];

export default function Guide() {
  return (
    <div className="space-y-6">
      <PageHeader icon={<BookOpen className="h-6 w-6" />} title="How to use DOC" subtitle="DOC (Doctor On Call) reads your medical reports, joins them together, finds hidden risks and helps you prepare for your doctor." />

      <section className="card p-6">
        <h2 className="mb-4 text-lg font-bold">Quick start</h2>
        <ol className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, text, to }, i) => (
            <li key={title}>
              <Link to={to} className="flex h-full gap-3 rounded-2xl border border-slate-200 p-4 transition hover:border-brand-400 hover:shadow-soft dark:border-white/10">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-600 text-sm font-extrabold text-white">{i + 1}</span>
                <div>
                  <p className="flex items-center gap-1.5 font-bold"><Icon className="h-4 w-4 text-brand-600" /> {title}</p>
                  <p className="mt-1 text-sm muted">{text}</p>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section className="card border-brand-300 p-6 ring-2 ring-brand-100 dark:ring-brand-500/20">
        <h2 className="flex items-center gap-2 text-lg font-bold"><FlaskConical className="h-5 w-5 text-brand-600" /> Test that DOC works (no real reports needed)</h2>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm">
          <li>Download the 6 test-kit PDFs and the answer key below.</li>
          <li>Settings → Add member: <b>Ravi Kumar</b>, Male, born <b>10-05-1972</b>, condition <b>High BP</b>. Select Ravi in the top bar.</li>
          <li>Upload the PDFs one by one (01 → 06) and confirm each.</li>
          <li>Medicines → Log a symptom: <b>Ankle or leg swelling</b>, started <b>20-05-2026</b>.</li>
          <li>Compare with the answer key. Expected: <b>FIB-4 2.70 (high)</b>, <b>eGFR 65 with rapid decline</b>, <b>TyG 9.31</b>, a triple-whammy medicine alert and a prescribing cascade.</li>
        </ol>
        <div className="mt-5"><SampleReports /></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3 text-sm">
          <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5"><Calculator className="mb-1 h-4 w-4 text-brand-600" /><b>Check the maths yourself.</b> <span className="muted">Every score card shows the formula with your numbers. Compare it with any online FIB-4 or NKF eGFR calculator.</span></div>
          <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5"><CheckCircle2 className="mb-1 h-4 w-4 text-brand-600" /><b>Check the reading.</b> <span className="muted">Click any input chip to open the source report and compare it with the PDF.</span></div>
          <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/5"><Sparkles className="mb-1 h-4 w-4 text-brand-600" /><b>Want a ready-made example?</b> <span className="muted">Log out and press "Try the live demo" to see a family with 3 years of data.</span></div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">All features</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, page, to, items }) => (
            <Link key={page} to={to} className="card p-5 transition hover:-translate-y-0.5 hover:shadow-lift">
              <p className="mb-2 flex items-center gap-2 font-bold"><Icon className="h-5 w-5 text-brand-600" /> {page}</p>
              <ul className="space-y-1 text-sm">{items.map((x) => <li key={x} className="flex gap-1.5"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600" /><span className="muted">{x}</span></li>)}</ul>
            </Link>
          ))}
        </div>
      </section>

      <p className="text-xs muted">DOC helps you understand and organise your records. It is not a doctor, does not diagnose, and you should never change medicines without medical advice.</p>
    </div>
  );
}
