import { useState } from "react";
import { Sparkles, Languages, CheckCircle2, XCircle } from "lucide-react";
import { api } from "../lib/api";
import { useApp } from "../lib/store";
import { LANG_NAMES, t } from "../lib/i18n";
import type { Lang } from "../lib/types";
import { Modal, Spinner } from "./ui";

interface Explanation {
  headline: string;
  explanation: string;
  what_to_do: string[];
  check_understanding: { question: string; options: string[]; answer_index: number } | null;
  mode: string;
  engine?: string | null;
  note?: string | null;
}

export function ExplainButton({ kind, id, small }: { kind: "result" | "risk" | "drift"; id: string | number; small?: boolean }) {
  const { profile, lang } = useApp();
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState<Lang>(lang);
  const [data, setData] = useState<Explanation | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<number | null>(null);

  async function load(l: Lang) {
    if (!profile) return;
    setLoading(true);
    setErr(null);
    setPicked(null);
    try {
      setData(await api.post<Explanation>(`/profiles/${profile.id}/explain`, { kind, id: String(id), language: l }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        className={small ? "chip bg-brand-50 text-brand-700 hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-300" : "btn-outline py-2 text-xs"}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
          load(language);
        }}
      >
        <Sparkles className={small ? "h-3 w-3" : "h-4 w-4"} /> {t("explain", lang)}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={<span className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-brand-600" /> Simple explanation</span>}>
        <div className="mb-4 flex items-center gap-2">
          <Languages className="h-4 w-4 muted" />
          {(Object.keys(LANG_NAMES) as Lang[]).map((l) => (
            <button
              key={l}
              onClick={() => {
                setLanguage(l);
                load(l);
              }}
              className={`chip ${language === l ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200"}`}
            >
              {LANG_NAMES[l]}
            </button>
          ))}
        </div>
        {loading && <Spinner label="Writing a simple explanation…" />}
        {err && <p className="text-sm text-red-600">{err}</p>}
        {data && !loading && (
          <div className="space-y-4 animate-fade-up">
            <p className="text-base font-bold text-ink dark:text-white">{data.headline}</p>
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700 dark:text-slate-300">{data.explanation}</p>
            <div className="rounded-xl bg-brand-50 p-4 dark:bg-brand-500/10">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-brand-700 dark:text-brand-300">What you can do</p>
              <ul className="space-y-1.5 text-sm">
                {data.what_to_do.map((w, i) => (
                  <li key={i} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />{w}</li>
                ))}
              </ul>
            </div>
            {data.check_understanding && (
              <div className="rounded-xl border border-dashed border-slate-300 p-4 dark:border-white/15">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide muted">Quick check: did that make sense?</p>
                <p className="mb-3 text-sm font-semibold">{data.check_understanding.question}</p>
                <div className="grid gap-2">
                  {data.check_understanding.options.map((o, i) => {
                    const correct = i === data.check_understanding!.answer_index;
                    const state = picked === null ? "" : correct ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-500/10" : picked === i ? "border-red-300 bg-red-50 dark:bg-red-500/10" : "opacity-60";
                    return (
                      <button key={i} disabled={picked !== null} onClick={() => setPicked(i)} className={`flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-left text-sm transition dark:border-white/10 ${state}`}>
                        {o}
                        {picked !== null && correct && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                        {picked === i && !correct && <XCircle className="h-4 w-4 text-red-500" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {data.note && <p className="text-xs text-amber-700 dark:text-amber-300">{data.note}</p>}
            <p className="text-xs muted">{data.mode === "ai" ? `Written by ${data.engine ?? "AI"} from your records.` : "Explanation from DOC's own templates."} {t("notDoctor", lang)}</p>
          </div>
        )}
      </Modal>
    </>
  );
}
