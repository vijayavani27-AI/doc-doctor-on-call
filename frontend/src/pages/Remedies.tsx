import { useState } from "react";
import { HeartHandshake, Search, ChevronDown, CheckCircle2, Ban, ShieldAlert, Stethoscope, Phone, BookOpen } from "lucide-react";
import { useApp, useFetch } from "../lib/store";
import type { Lang } from "../lib/types";
import { Disclaimer, Empty, ErrorBox, PageHeader, Spinner } from "../components/ui";

interface Remedy {
  key: string; title: string; title_ta?: string; title_hi?: string; summary: string;
  self_care: string[]; avoid: string[]; red_flags: string[]; see_doctor_if: string[]; sources: string[];
}
interface RemedyData { items: Remedy[]; disclaimer: string; emergency: { numbers: { label: string; number: string }[] } }

function titleFor(r: Remedy, lang: Lang) {
  if (lang === "ta" && r.title_ta) return r.title_ta;
  if (lang === "hi" && r.title_hi) return r.title_hi;
  return r.title;
}

function List({ items, icon: Icon, iconCls }: { items: string[]; icon: typeof CheckCircle2; iconCls: string }) {
  return <ul className="space-y-1.5 text-sm">{items.map((x) => <li key={x} className="flex gap-2"><Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconCls}`} />{x}</li>)}</ul>;
}

export default function Remedies() {
  const { lang } = useApp();
  const { data, error } = useFetch<RemedyData>("/remedies");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  if (error) return <ErrorBox msg={error} />;
  if (!data) return <Spinner />;

  const numbers = data.emergency?.numbers?.length ? data.emergency.numbers : [{ label: "Emergency", number: "112" }, { label: "Ambulance", number: "108" }];
  const ql = q.trim().toLowerCase();
  const items = !ql ? data.items : data.items.filter((r) =>
    [r.title, r.title_ta ?? "", r.title_hi ?? "", r.summary, r.key.replace(/_/g, " "), ...r.self_care].some((s) => s.toLowerCase().includes(ql)));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader icon={<HeartHandshake className="h-6 w-6" />} title="Home care guide" subtitle="Simple, safe self-care for common problems, the warning signs that need a doctor, and what not to do." />

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input className="input pl-9" placeholder="Search, e.g. fever, cough, burn, loose motion" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <p className="mb-6 flex items-start gap-2 rounded-xl bg-brand-50 p-3 text-xs text-brand-900 dark:bg-brand-500/10 dark:text-brand-200">
        <Stethoscope className="mt-0.5 h-4 w-4 shrink-0" />{data.disclaimer}
      </p>

      {!items.length ? (
        <Empty icon={<Search className="h-7 w-7" />} title="Nothing found" text="Try another word, or ask DOC in the chat." />
      ) : (
        <div className="space-y-3">
          {items.map((r) => {
            const isOpen = open === r.key;
            const title = titleFor(r, lang);
            return (
              <div key={r.key} className="card overflow-hidden">
                <button type="button" onClick={() => setOpen(isOpen ? null : r.key)} aria-expanded={isOpen} className="flex w-full items-start gap-3 p-5 text-left">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/10"><HeartHandshake className="h-5 w-5" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{title}{title !== r.title && <span className="ml-2 text-sm font-medium muted">{r.title}</span>}</p>
                    <p className={`mt-0.5 text-sm muted ${isOpen ? "" : "line-clamp-2"}`}>{r.summary}</p>
                  </div>
                  <ChevronDown className={`mt-1 h-5 w-5 shrink-0 text-slate-400 transition ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen && (
                  <div className="space-y-5 border-t border-slate-100 px-5 pb-5 pt-4 dark:border-white/5">
                    <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-500/30 dark:bg-red-500/10">
                      <p className="mb-2 flex items-center gap-2 font-bold text-red-700 dark:text-red-300"><ShieldAlert className="h-5 w-5" /> Get help now if</p>
                      <ul className="space-y-1.5 text-sm text-red-900 dark:text-red-100">{r.red_flags.map((x) => <li key={x} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />{x}</li>)}</ul>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {numbers.map((n) => <a key={n.number} href={`tel:${n.number}`} className="btn bg-red-600 py-2 text-white hover:bg-red-700"><Phone className="h-4 w-4" /> {n.number} · {n.label}</a>)}
                      </div>
                    </div>
                    {!!r.self_care.length && <div><h3 className="mb-2 font-bold">What usually helps</h3><List items={r.self_care} icon={CheckCircle2} iconCls="text-emerald-500" /></div>}
                    {!!r.avoid.length && <div><h3 className="mb-2 font-bold">Avoid</h3><List items={r.avoid} icon={Ban} iconCls="text-amber-500" /></div>}
                    {!!r.see_doctor_if.length && <div><h3 className="mb-2 font-bold">See a doctor if</h3><List items={r.see_doctor_if} icon={Stethoscope} iconCls="text-sky-500" /></div>}
                    {!!r.sources.length && <p className="flex gap-1 text-[11px] muted"><BookOpen className="mt-0.5 h-3 w-3 shrink-0" />Sources: {r.sources.join(" · ")}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <Disclaimer text={data.disclaimer} />
    </div>
  );
}
