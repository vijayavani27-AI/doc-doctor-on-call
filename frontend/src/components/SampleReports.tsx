import { Download, FileText, KeyRound } from "lucide-react";
import { useFetch } from "../lib/store";

interface SampleSet { set: string; title: string; files: { name: string; url: string }[] }

/** Download links for the fictional test kit and sample reports. */
export function SampleReports({ compact }: { compact?: boolean }) {
  const { data } = useFetch<SampleSet[]>("/samples");
  if (!data) return null;
  const sets = compact ? data.filter((s) => s.set === "test_kit") : data;
  return (
    <div className="space-y-4">
      {sets.map((s) => (
        <div key={s.set}>
          <p className="label">{s.title}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {s.files.map((f) => {
              const key = f.name.endsWith(".md");
              return (
                <a key={f.name} href={f.url} download={f.name} target={key ? "_blank" : undefined} rel="noreferrer"
                  className={`flex items-center gap-2 rounded-xl border p-2.5 text-xs font-semibold transition hover:border-brand-400 hover:shadow-soft ${key ? "border-amber-300 bg-amber-50 dark:bg-amber-500/10" : "border-slate-200 dark:border-white/10"}`}>
                  {key ? <KeyRound className="h-4 w-4 text-amber-600" /> : <FileText className="h-4 w-4 text-brand-600" />}
                  <span className="min-w-0 flex-1 truncate">{key ? "ANSWER KEY: what DOC should find" : f.name}</span>
                  <Download className="h-3.5 w-3.5 muted" />
                </a>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
