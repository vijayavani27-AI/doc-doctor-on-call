import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { MessageCircle, Send, Mic, MicOff, ShieldCheck, ShieldAlert, Volume2, Stethoscope, Sparkles, WifiOff, User as UserIcon } from "lucide-react";
import { api } from "../lib/api";
import { useApp, useFetch } from "../lib/store";
import type { LabResult } from "../lib/types";
import { Logo, PageHeader } from "../components/ui";
import { ReportDrawer } from "../components/ReportDrawer";
import { t } from "../lib/i18n";

interface Answer { answer: string; citations: string[]; confidence: "high" | "medium" | "low"; see_doctor: boolean; follow_ups: string[]; verified: boolean | null; corrected?: boolean; unsupported_claims?: string[]; mode: "ai" | "offline"; engine?: string | null }
interface Msg { role: "user" | "assistant"; content: string; meta?: Answer }

const STARTERS = ["What hidden risks did you find?", "Is my sugar control improving?", "How are my kidneys?", "Which of my medicines need a check?", "What should I ask my doctor?"];
const SPEECH_LANG = { en: "en-IN", hi: "hi-IN", ta: "ta-IN" } as const;

type SR = { lang: string; interimResults: boolean; start: () => void; stop: () => void; onresult: (e: { results: { 0: { transcript: string } }[] }) => void; onend: () => void };

export default function Chat() {
  const { profile, lang } = useApp();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [src, setSrc] = useState<{ report: number; result: number } | null>(null);
  const recRef = useRef<SR | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const results = useFetch<LabResult[]>(profile ? `/profiles/${profile.id}/results` : null);
  const resultReport = useMemo(() => new Map((results.data ?? []).map((r) => [r.id, r.report_id])), [results.data]);

  useEffect(() => { setMsgs([]); }, [profile?.id]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  async function ask(q: string) {
    if (!q.trim() || !profile || busy) return;
    const history = msgs.map((m) => ({ role: m.role, content: m.content }));
    setMsgs((m) => [...m, { role: "user", content: q }]);
    setText("");
    setBusy(true);
    try {
      const a = await api.post<Answer>(`/profiles/${profile.id}/chat`, { message: q, history, language: lang });
      setMsgs((m) => [...m, { role: "assistant", content: a.answer, meta: a }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", content: `Sorry, something went wrong: ${(e as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  }

  function toggleMic() {
    const W = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const Ctor = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (!Ctor) return alert("Voice input isn't supported in this browser. Try Chrome.");
    if (listening) return recRef.current?.stop();
    const rec = new Ctor();
    rec.lang = SPEECH_LANG[lang];
    rec.interimResults = false;
    rec.onresult = (e) => setText(e.results[0][0].transcript);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  function speak(s: string) {
    const u = new SpeechSynthesisUtterance(s.replace(/\[[^\]]+\]/g, ""));
    u.lang = SPEECH_LANG[lang];
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }

  function renderAnswer(s: string): ReactNode[] {
    return s.split(/(\[(?:R|M|S)\d+\]|\[(?:I|A|V):[\w:.-]+\])/g).map((part, i) => {
      const m = part.match(/^\[(R|M|S)(\d+)\]$|^\[(I|A|V):([\w:.-]+)\]$/);
      if (!m) return <span key={i}>{part}</span>;
      if (m[1] === "R") {
        const rid = Number(m[2]);
        const rep = resultReport.get(rid);
        return <button key={i} onClick={() => rep && setSrc({ report: rep, result: rid })} className="mx-0.5 rounded-md bg-brand-100 px-1.5 py-0.5 align-middle text-[10px] font-bold text-brand-800 hover:bg-brand-200 dark:bg-brand-500/20 dark:text-brand-200">📄 source</button>;
      }
      if (m[3] === "I") return <Link key={i} to={`/app/risks#${m[4].replace("drift-", "")}`} className="mx-0.5 rounded-md bg-amber-100 px-1.5 py-0.5 align-middle text-[10px] font-bold text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">🧮 formula</Link>;
      if (m[3] === "V") return <Link key={i} to="/app/wellness" className="mx-0.5 rounded-md bg-rose-100 px-1.5 py-0.5 align-middle text-[10px] font-bold text-rose-800 dark:bg-rose-500/20 dark:text-rose-200">❤ home reading</Link>;
      if (m[1] === "M") return <Link key={i} to="/app/medicines" className="mx-0.5 rounded-md bg-violet-100 px-1.5 py-0.5 align-middle text-[10px] font-bold text-violet-800 dark:bg-violet-500/20 dark:text-violet-200">💊 med</Link>;
      return <span key={i} className="mx-0.5 rounded-md bg-slate-100 px-1.5 py-0.5 align-middle text-[10px] font-bold text-slate-600 dark:bg-white/10">ref</span>;
    });
  }

  return (
    <div className="flex h-[calc(100dvh-11rem)] flex-col lg:h-[calc(100dvh-7.5rem)]">
      <PageHeader icon={<MessageCircle className="h-6 w-6" />} title="Ask about your health" subtitle={`Answers come only from ${profile?.name.split(" ")[0]}'s records, with a source for every fact. A second AI checks each answer.`} />
      <div className="card flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
          {msgs.length === 0 && (
            <div className="grid h-full place-items-center text-center">
              <div>
                <Logo className="mx-auto h-14 w-14" />
                <p className="mt-3 font-bold">Hi! Ask me anything about these reports.</p>
                <p className="text-sm muted">I'll show the source for every fact, and say “I don't know” when the records don't say.</p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {STARTERS.map((s) => <button key={s} onClick={() => ask(s)} className="chip bg-brand-50 px-3 py-2 text-brand-800 hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-200">{s}</button>)}
                </div>
              </div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={`flex gap-3 animate-fade-up ${m.role === "user" ? "flex-row-reverse" : ""}`}>
              <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${m.role === "user" ? "bg-slate-200 dark:bg-white/10" : ""}`}>{m.role === "user" ? <UserIcon className="h-4 w-4" /> : <Logo className="h-8 w-8" />}</div>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${m.role === "user" ? "bg-brand-600 text-white" : "bg-slate-50 dark:bg-white/5"}`}>
                <div className="whitespace-pre-line">{m.role === "assistant" ? renderAnswer(m.content) : m.content}</div>
                {m.meta && (
                  <div className="mt-3 space-y-2">
                    {m.meta.see_doctor && <p className="flex items-center gap-1.5 rounded-lg bg-amber-100 px-2.5 py-1.5 text-xs font-semibold text-amber-900 dark:bg-amber-500/15 dark:text-amber-200"><Stethoscope className="h-3.5 w-3.5" /> Worth discussing with your doctor</p>}
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      {m.meta.mode === "offline" ? <span className="chip bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-300"><WifiOff className="h-3 w-3" /> offline answer</span>
                        : m.meta.verified === true ? <span className="chip bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"><ShieldCheck className="h-3 w-3" /> fact-checked</span>
                        : m.meta.verified === false ? <span className="chip bg-amber-100 text-amber-800" title={m.meta.unsupported_claims?.join("; ")}><ShieldAlert className="h-3 w-3" /> {m.meta.corrected ? "corrected by checker" : "partly unverified"}</span>
                        : <span className="chip bg-slate-100 text-slate-600"><Sparkles className="h-3 w-3" /> AI</span>}
                      {m.meta.engine && <span className="chip bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"><Sparkles className="h-3 w-3" /> {m.meta.engine.split(" (")[0]}</span>}
                      <span className="chip bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300">confidence: {m.meta.confidence}</span>
                      <span className="chip bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300">{m.meta.citations.length} sources</span>
                      <button className="chip bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-300" onClick={() => speak(m.content)}><Volume2 className="h-3 w-3" /> listen</button>
                    </div>
                    {i === msgs.length - 1 && !!m.meta.follow_ups.length && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {m.meta.follow_ups.map((f) => <button key={f} onClick={() => ask(f)} className="chip border border-brand-200 bg-white px-2.5 py-1 text-brand-800 hover:bg-brand-50 dark:border-brand-500/30 dark:bg-transparent dark:text-brand-200">{f}</button>)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex gap-3"><Logo className="h-8 w-8" /><div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm dark:bg-white/5"><span className="inline-flex gap-1"><span className="h-2 w-2 animate-bounce rounded-full bg-brand-500" /><span className="h-2 w-2 animate-bounce rounded-full bg-brand-500 [animation-delay:120ms]" /><span className="h-2 w-2 animate-bounce rounded-full bg-brand-500 [animation-delay:240ms]" /></span> <span className="ml-2 muted">reading records & fact-checking…</span></div></div>
          )}
          <div ref={end} />
        </div>
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); ask(text); }} className="flex items-center gap-2 border-t border-slate-100 p-3 dark:border-white/5">
          <button type="button" onClick={toggleMic} className={`btn-ghost rounded-full p-2.5 ${listening ? "bg-red-100 text-red-600" : ""}`} aria-label="Speak">{listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}</button>
          <input className="input flex-1 rounded-full" placeholder={lang === "hi" ? "अपना सवाल लिखें…" : lang === "ta" ? "உங்கள் கேள்வியை எழுதுங்கள்…" : "Type your question…"} value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn-primary rounded-full p-3" disabled={busy || !text.trim()} aria-label="Send"><Send className="h-4 w-4" /></button>
        </form>
      </div>
      <p className="mt-2 text-center text-[11px] muted">{t("notDoctor", lang)}</p>
      <ReportDrawer reportId={src?.report ?? null} highlight={src?.result} onClose={() => setSrc(null)} />
    </div>
  );
}
