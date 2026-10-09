import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { MessageCircle, Send, Mic, MicOff, ShieldCheck, ShieldAlert, Volume2, Square, Stethoscope, Sparkles, WifiOff, User as UserIcon, Users, Phone, Loader2, Layers } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { useApp, useFetch } from "../lib/store";
import type { LabResult } from "../lib/types";
import { Logo, PageHeader } from "../components/ui";
import { ReportDrawer } from "../components/ReportDrawer";
import { t } from "../lib/i18n";

interface Urgent { level: string; message: string; reasons: string[]; call: { label: string; number: string }[] }
interface ChatScope { type: "me" | "family"; profile_id?: number; link_id?: number; name: string; sections?: string[] }
interface Answer {
  answer: string; citations: string[]; confidence: "high" | "medium" | "low"; see_doctor: boolean; follow_ups: string[]; verified: boolean | null;
  corrected?: boolean; unsupported_claims?: string[]; mode: "ai" | "offline"; engine?: string | null;
  scope?: ChatScope; urgent?: Urgent | null; disclaimer?: string;
}
interface Msg { role: "user" | "assistant"; content: string; meta?: Answer }
interface FamilyLinkLite { id: number; relation: string; person: { name: string | null; email: string }; permissions: Record<string, boolean>; is_demo: boolean }
interface Members { i_can_view: FamilyLinkLite[]; can_view_me: FamilyLinkLite[] }
interface SpeakPlan { voice_lang: string; rate: number; chunks: string[] }

const STARTERS = ["What hidden risks did you find?", "Is my sugar control improving?", "How are my kidneys?", "Which of my medicines need a check?", "What should I ask my doctor?"];
const familyStarters = (n: string) => [`What should I know about ${n}'s health?`, `Is anything in ${n}'s reports worth discussing with a doctor?`, `How are ${n}'s kidneys?`, `What changed in ${n}'s latest report?`];
const SPEECH_LANG = { en: "en-IN", hi: "hi-IN", ta: "ta-IN" } as const;

type SR = {
  lang: string; interimResults: boolean; start: () => void; stop: () => void;
  onresult: (e: { results: { 0: { transcript: string } }[] }) => void; onend: () => void; onerror?: (e: { error?: string }) => void;
};

/** Prominent red banner for code-rule emergencies (from the API's `urgent`). */
function UrgentBanner({ u }: { u: Urgent }) {
  return (
    <div role="alert" className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
      <p className="flex items-start gap-2 font-bold"><ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />{u.message}</p>
      {!!u.reasons.length && <ul className="ml-7 mt-1 list-disc space-y-0.5 text-xs">{u.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
      <div className="ml-7 mt-3 flex flex-wrap gap-2">
        {u.call.map((c) => (
          <a key={c.number} href={`tel:${c.number}`} className="btn bg-red-600 px-3 py-2 text-xs text-white hover:bg-red-700 animate-pulse-ring"><Phone className="h-3.5 w-3.5" /> {c.number} · {c.label}</a>
        ))}
      </div>
    </div>
  );
}

export default function Chat() {
  const { profile, lang } = useApp();
  const [params, setParams] = useSearchParams();
  const scope = /^family:\d+$/.test(params.get("scope") ?? "") ? (params.get("scope") as string) : "me";
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceErr, setVoiceErr] = useState<string | null>(null);
  const [voiceUrgent, setVoiceUrgent] = useState<Urgent | null>(null);
  const [speaking, setSpeaking] = useState<number | null>(null);
  const [scopeNote, setScopeNote] = useState<string | null>(null);
  const [src, setSrc] = useState<{ report: number; result: number } | null>(null);
  const recRef = useRef<SR | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const speakRun = useRef(0);
  const end = useRef<HTMLDivElement>(null);
  const results = useFetch<LabResult[]>(profile ? `/profiles/${profile.id}/results` : null);
  const members = useFetch<Members>("/family/members");
  const resultReport = useMemo(() => new Map((results.data ?? []).map((r) => [r.id, r.report_id])), [results.data]);
  const familyOptions = useMemo(() => (members.data?.i_can_view ?? []).filter((l) => l.permissions.chat), [members.data]);
  const isFamily = scope !== "me";
  const current = isFamily ? familyOptions.find((l) => `family:${l.id}` === scope) : undefined;
  const subjectName = isFamily ? (current?.person.name || current?.person.email || "your family member") : profile?.name ?? "";
  const subjectFirst = subjectName.split(" ")[0];

  useEffect(() => { setMsgs([]); }, [profile?.id, scope]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);
  useEffect(() => () => {
    speakRun.current++;
    window.speechSynthesis?.cancel();
    recRef.current?.stop();
    if (mediaRef.current?.state === "recording") mediaRef.current.stop();
  }, []);

  // If the URL asks for a family scope that isn't (or is no longer) shared for chat, fall back to "me" with a calm note.
  useEffect(() => {
    if (!isFamily || !members.data) return;
    if (!current) {
      setScopeNote("That family member hasn't shared AI questions with you, or access was revoked or not shared.");
      selectScope("me");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFamily, members.data, current]);

  function selectScope(s: string) {
    if (s !== "me") setScopeNote(null);
    const next = new URLSearchParams(params);
    if (s === "me") next.delete("scope");
    else next.set("scope", s);
    setParams(next, { replace: true });
  }

  async function ask(q: string) {
    if (!q.trim() || !profile || busy) return;
    const history = msgs.map((m) => ({ role: m.role, content: m.content }));
    setMsgs((m) => [...m, { role: "user", content: q }]);
    setText("");
    setVoiceUrgent(null);
    setBusy(true);
    try {
      const a = await api.post<Answer>(`/profiles/${profile.id}/chat`, { message: q, history, language: lang, scope });
      setMsgs((m) => [...m, { role: "assistant", content: a.answer, meta: a }]);
    } catch (e) {
      const denied = e instanceof ApiError && (e.status === 403 || e.status === 404) && isFamily;
      setMsgs((m) => [...m, { role: "assistant", content: denied ? `Access was revoked or not shared. ${(e as Error).message}` : `Sorry, something went wrong: ${(e as Error).message}` }]);
      if (denied) members.reload();
    } finally {
      setBusy(false);
    }
  }

  /* ---------------- voice input: browser speech recognition, else record + server transcription */
  async function toggleMic() {
    setVoiceErr(null);
    const W = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const Ctor = W.SpeechRecognition || W.webkitSpeechRecognition;
    if (listening) {
      recRef.current?.stop();
      if (mediaRef.current?.state === "recording") mediaRef.current.stop();
      return;
    }
    if (Ctor) {
      const rec = new Ctor();
      rec.lang = SPEECH_LANG[lang];
      rec.interimResults = false;
      rec.onresult = (e) => setText(e.results[0][0].transcript);
      rec.onerror = (e) => setVoiceErr(e.error === "not-allowed" ? "Microphone permission was blocked. Allow it in your browser settings, or type your question." : e.error === "no-speech" ? "Didn't catch that. Please try again." : "Voice input stopped. Please type your question.");
      rec.onend = () => setListening(false);
      recRef.current = rec;
      setListening(true);
      rec.start();
      return;
    }
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setVoiceErr("Voice input isn't supported in this browser. Try Chrome or Edge, or type your question.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        setListening(false);
        const type = (mr.mimeType || "audio/webm").split(";")[0];
        const blob = new Blob(chunks, { type });
        if (!blob.size) return;
        const fd = new FormData();
        fd.append("file", blob, `voice.${type.split("/")[1] || "webm"}`);
        fd.append("language", lang);
        setTranscribing(true);
        try {
          const r = await api.upload<{ text: string; urgent?: Urgent | null }>("/voice/transcribe", fd);
          setText(r.text);
          setVoiceUrgent(r.urgent ?? null);
        } catch (e) {
          setVoiceErr((e as Error).message);
        } finally {
          setTranscribing(false);
        }
      };
      mediaRef.current = mr;
      mr.start();
      setListening(true);
      setTimeout(() => mr.state === "recording" && mr.stop(), 110_000); // server limit is ~2 minutes
    } catch {
      setVoiceErr("Couldn't use the microphone. Allow microphone access, or type your question.");
    }
  }

  /* ---------------- read aloud: server prepares clean sentence chunks, the browser speaks them */
  function stopSpeaking() {
    speakRun.current++;
    window.speechSynthesis?.cancel();
    setSpeaking(null);
  }

  async function speak(idx: number, s: string) {
    if (!("speechSynthesis" in window)) return setVoiceErr("Read-aloud isn't supported in this browser.");
    stopSpeaking();
    const run = speakRun.current;
    setSpeaking(idx);
    let plan: SpeakPlan;
    try {
      plan = await api.post<SpeakPlan>("/voice/speak", { text: s.slice(0, 4000), language: lang });
    } catch {
      plan = { voice_lang: SPEECH_LANG[lang], rate: 0.95, chunks: [s.replace(/\[[^\]]+\]/g, "")] };
    }
    if (run !== speakRun.current) return;
    const voice = speechSynthesis.getVoices().find((v) => v.lang === plan.voice_lang) ?? speechSynthesis.getVoices().find((v) => v.lang.startsWith(plan.voice_lang.split("-")[0]));
    plan.chunks.forEach((c, i) => {
      const u = new SpeechSynthesisUtterance(c);
      u.lang = plan.voice_lang;
      u.rate = plan.rate;
      if (voice) u.voice = voice;
      if (i === plan.chunks.length - 1) u.onend = () => run === speakRun.current && setSpeaking(null);
      u.onerror = () => run === speakRun.current && setSpeaking(null);
      speechSynthesis.speak(u);
    });
    if (!plan.chunks.length) setSpeaking(null);
  }

  function renderAnswer(s: string): ReactNode[] {
    return s.split(/(\[(?:R|M|S)\d+\]|\[(?:I|A|V):[\w:.-]+\])/g).map((part, i) => {
      const m = part.match(/^\[(R|M|S)(\d+)\]$|^\[(I|A|V):([\w:.-]+)\]$/);
      if (!m) return <span key={i}>{part}</span>;
      // Family answers cite the other person's records, which aren't linkable from your own pages.
      if (isFamily) return <span key={i} className="mx-0.5 rounded-md bg-slate-100 px-1.5 py-0.5 align-middle text-[10px] font-bold text-slate-600 dark:bg-white/10">source</span>;
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

  const starters = isFamily ? familyStarters(subjectFirst) : STARTERS;
  const scopeBtn = (active: boolean) => `chip shrink-0 px-3 py-2 ${active ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-200"}`;

  return (
    <div className="flex h-[calc(100dvh-11rem)] flex-col lg:h-[calc(100dvh-7.5rem)]">
      <PageHeader icon={<MessageCircle className="h-6 w-6" />} title="Ask about your health"
        subtitle={isFamily
          ? `Answers come only from what ${subjectFirst} chose to share with you, with a source for every fact. A second AI checks each answer.`
          : `Answers come only from ${profile?.name.split(" ")[0]}'s records, with a source for every fact. A second AI checks each answer.`} />

      {/* Scope selector: me or an approved family member who shared "chat" */}
      <div className="mb-3 flex items-center gap-2">
        <span className="shrink-0 text-xs font-semibold uppercase tracking-wide muted">Asking about</span>
        <div className="no-scrollbar flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
          <button type="button" className={scopeBtn(!isFamily)} onClick={() => selectScope("me")}><UserIcon className="h-3.5 w-3.5" /> Me ({profile?.name.split(" ")[0]})</button>
          {familyOptions.map((l) => (
            <button type="button" key={l.id} className={scopeBtn(scope === `family:${l.id}`)} onClick={() => selectScope(`family:${l.id}`)}>
              <Users className="h-3.5 w-3.5" /> {(l.person.name || l.person.email).split(" ")[0]} <span className="opacity-70">· {l.relation}</span>{l.is_demo && <span className="opacity-70">· demo</span>}
            </button>
          ))}
          {members.data && !familyOptions.length && <Link to="/app/family" className="chip shrink-0 px-3 py-2 text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-500/10"><Users className="h-3.5 w-3.5" /> Family sharing →</Link>}
        </div>
      </div>
      {scopeNote && <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">{scopeNote}</p>}

      <div className="card flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
          {msgs.length === 0 && (
            <div className="grid h-full place-items-center text-center">
              <div>
                <Logo className="mx-auto h-14 w-14" />
                <p className="mt-3 font-bold">{isFamily ? `Hi! Ask me about ${subjectFirst}'s shared records.` : "Hi! Ask me anything about these reports."}</p>
                <p className="text-sm muted">I'll show the source for every fact, and say “I don't know” when the records don't say.</p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {starters.map((s) => <button key={s} onClick={() => ask(s)} className="chip bg-brand-50 px-3 py-2 text-brand-800 hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-200">{s}</button>)}
                </div>
              </div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className="space-y-2">
              {m.meta?.urgent && <UrgentBanner u={m.meta.urgent} />}
              <div className={`flex gap-3 animate-fade-up ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${m.role === "user" ? "bg-slate-200 dark:bg-white/10" : ""}`}>{m.role === "user" ? <UserIcon className="h-4 w-4" /> : <Logo className="h-8 w-8" />}</div>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${m.role === "user" ? "bg-brand-600 text-white" : "bg-slate-50 dark:bg-white/5"}`}>
                  <div className="whitespace-pre-line">{m.role === "assistant" ? renderAnswer(m.content) : m.content}</div>
                  {m.meta && (
                    <div className="mt-3 space-y-2">
                      {m.meta.see_doctor && <p className="flex items-center gap-1.5 rounded-lg bg-amber-100 px-2.5 py-1.5 text-xs font-semibold text-amber-900 dark:bg-amber-500/15 dark:text-amber-200"><Stethoscope className="h-3.5 w-3.5" /> Worth discussing with your doctor</p>}
                      {m.meta.scope?.type === "family" && (
                        <p className="flex flex-wrap items-center gap-1 text-[11px] muted">
                          <Layers className="h-3 w-3" /> About {m.meta.scope.name}, using only:
                          {(m.meta.scope.sections ?? []).map((s) => <span key={s} className="chip bg-slate-100 px-2 text-[10px] text-slate-600 dark:bg-white/10 dark:text-slate-300">{s}</span>)}
                          {!m.meta.scope.sections?.length && <span>no shared sections</span>}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                        {m.meta.mode === "offline" ? <span className="chip bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-300"><WifiOff className="h-3 w-3" /> DOC's own answer</span>
                          : m.meta.verified === true ? <span className="chip bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"><ShieldCheck className="h-3 w-3" /> fact-checked</span>
                          : m.meta.verified === false ? <span className="chip bg-amber-100 text-amber-800" title={m.meta.unsupported_claims?.join("; ")}><ShieldAlert className="h-3 w-3" /> {m.meta.corrected ? "corrected by checker" : "partly unverified"}</span>
                          : <span className="chip bg-slate-100 text-slate-600"><Sparkles className="h-3 w-3" /> AI</span>}
                        {m.meta.engine && <span className="chip bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"><Sparkles className="h-3 w-3" /> {m.meta.engine.split(" (")[0]}</span>}
                        <span className="chip bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300">confidence: {m.meta.confidence}</span>
                        <span className="chip bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300">{m.meta.citations.length} sources</span>
                        {speaking === i
                          ? <button className="chip bg-brand-100 text-brand-800 hover:bg-brand-200 dark:bg-brand-500/20 dark:text-brand-200" onClick={stopSpeaking}><Square className="h-3 w-3" /> stop</button>
                          : <button className="chip bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-300" onClick={() => speak(i, m.content)}><Volume2 className="h-3 w-3" /> listen</button>}
                      </div>
                      {i === msgs.length - 1 && !!m.meta.follow_ups.length && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {m.meta.follow_ups.map((f) => <button key={f} onClick={() => ask(f)} className="chip border border-brand-200 bg-white px-2.5 py-1 text-brand-800 hover:bg-brand-50 dark:border-brand-500/30 dark:bg-transparent dark:text-brand-200">{f}</button>)}
                        </div>
                      )}
                      {m.meta.disclaimer && <p className="pt-1 text-[11px] leading-snug muted">{m.meta.disclaimer}</p>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex gap-3"><Logo className="h-8 w-8" /><div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm dark:bg-white/5"><span className="inline-flex gap-1"><span className="h-2 w-2 animate-bounce rounded-full bg-brand-500" /><span className="h-2 w-2 animate-bounce rounded-full bg-brand-500 [animation-delay:120ms]" /><span className="h-2 w-2 animate-bounce rounded-full bg-brand-500 [animation-delay:240ms]" /></span> <span className="ml-2 muted">reading records & fact-checking…</span></div></div>
          )}
          <div ref={end} />
        </div>
        {(voiceUrgent || voiceErr) && (
          <div className="space-y-2 border-t border-slate-100 px-3 pt-3 dark:border-white/5">
            {voiceUrgent && <UrgentBanner u={voiceUrgent} />}
            {voiceErr && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">{voiceErr}</p>}
          </div>
        )}
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); ask(text); }} className="flex items-center gap-2 border-t border-slate-100 p-3 dark:border-white/5">
          <button type="button" onClick={toggleMic} disabled={transcribing} className={`btn-ghost rounded-full p-2.5 ${listening ? "bg-red-100 text-red-600" : ""}`} aria-label={listening ? "Stop listening" : "Speak"} title={listening ? "Stop" : "Speak your question"}>
            {transcribing ? <Loader2 className="h-5 w-5 animate-spin" /> : listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>
          <input className="input flex-1 rounded-full" placeholder={transcribing ? "Transcribing…" : listening ? "Listening…" : lang === "hi" ? "अपना सवाल लिखें…" : lang === "ta" ? "உங்கள் கேள்வியை எழுதுங்கள்…" : "Type your question…"} value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn-primary rounded-full p-3" disabled={busy || !text.trim()} aria-label="Send"><Send className="h-4 w-4" /></button>
        </form>
      </div>
      <p className="mt-2 text-center text-[11px] muted">{t("notDoctor", lang)}</p>
      <ReportDrawer reportId={src?.report ?? null} highlight={src?.result} onClose={() => setSrc(null)} />
    </div>
  );
}
