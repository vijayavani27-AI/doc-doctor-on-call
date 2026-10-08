import { useState, type FormEvent } from "react";
import { Mail, MessageSquare, Clock, MapPin, Send, CheckCircle2, Loader2, Bug, Handshake, Trophy, HelpCircle } from "lucide-react";
import { api } from "../lib/api";
import { PublicLayout } from "../components/PublicLayout";
import { WaveBackground } from "../components/WaveBackground";
import { SITE } from "../lib/site";

const TOPICS = [
  { key: "general", label: "General question", icon: HelpCircle },
  { key: "feedback", label: "Feedback", icon: MessageSquare },
  { key: "bug", label: "Report a bug", icon: Bug },
  { key: "partnership", label: "Clinic / lab partnership", icon: Handshake },
  { key: "hackathon", label: "Hackathon / judges", icon: Trophy },
];

export default function Contact() {
  const [form, setForm] = useState({ name: "", email: "", topic: "general", message: "" });
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setState("sending");
    try {
      await api.post("/contact", form);
      setState("sent");
    } catch (x) {
      setErr((x as Error).message);
      setState("idle");
    }
  }

  return (
    <PublicLayout>
      <section className="relative overflow-hidden">
        <WaveBackground lines={6} />
        <div className="relative mx-auto max-w-3xl px-4 pb-10 pt-14 text-center sm:px-6">
          <p className="reveal text-xs font-bold uppercase tracking-[0.2em] text-brand-600">Contact</p>
          <h1 className="reveal mt-3 text-4xl font-extrabold tracking-tight text-ink sm:text-5xl dark:text-white">Let's talk</h1>
          <p className="reveal mx-auto mt-4 max-w-xl text-lg muted">Questions, feedback, bugs or partnership ideas. We read every message.</p>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 pb-20 sm:px-6 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-4">
          {[
            { icon: Mail, title: "Email", text: SITE.email, href: `mailto:${SITE.email}` },
            { icon: Clock, title: "Response time", text: "Usually within 1–2 days" },
            { icon: MapPin, title: "Based in", text: SITE.location },
          ].map(({ icon: Icon, title, text, href }) => (
            <div key={title} className="card spotlight reveal flex items-center gap-4 p-5">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"><Icon className="h-5 w-5" /></div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide muted">{title}</p>
                {href ? <a href={href} className="font-semibold text-ink hover:text-brand-700 dark:text-white">{text}</a> : <p className="font-semibold text-ink dark:text-white">{text}</p>}
              </div>
            </div>
          ))}
          <div className="card reveal bg-amber-50 p-5 text-sm dark:bg-amber-500/10">
            <p className="font-bold text-amber-900 dark:text-amber-200">Medical emergency?</p>
            <p className="mt-1 text-amber-900/80 dark:text-amber-200/80">DOC can't help in an emergency. Call <b>112</b> (India emergency) or <b>108</b> (ambulance), or go to the nearest hospital.</p>
          </div>
        </div>

        <div className="card spotlight reveal p-6 sm:p-8">
          {state === "sent" ? (
            <div className="grid h-full place-items-center py-10 text-center animate-fade-up">
              <div>
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15"><CheckCircle2 className="h-9 w-9" /></div>
                <h2 className="mt-4 text-2xl font-extrabold">Message sent!</h2>
                <p className="mt-1 muted">Thanks, {form.name.split(" ")[0]}. We'll reply to {form.email}.</p>
                <button className="btn-outline mt-6" onClick={() => { setState("idle"); setForm({ name: "", email: "", topic: "general", message: "" }); }}>Send another</button>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <h2 className="text-xl font-bold">Send us a message</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><label className="label" htmlFor="c-name">Your name</label><input id="c-name" className="input" required maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div><label className="label" htmlFor="c-email">Email</label><input id="c-email" type="email" className="input" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              </div>
              <div>
                <p className="label">Topic</p>
                <div className="flex flex-wrap gap-2">
                  {TOPICS.map(({ key, label, icon: Icon }) => (
                    <button type="button" key={key} onClick={() => setForm({ ...form, topic: key })}
                      className={`chip px-3 py-2 text-xs transition ${form.topic === key ? "bg-brand-600 text-white shadow-lift" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-200"}`}>
                      <Icon className="h-3.5 w-3.5" /> {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label" htmlFor="c-msg">Message</label>
                <textarea id="c-msg" className="input min-h-36 resize-y" required minLength={5} maxLength={3000} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="How can we help?" />
                <p className="mt-1 text-right text-[11px] muted">{form.message.length}/3000</p>
              </div>
              <p className="text-xs muted">Please don't include medical reports or personal health details in this form.</p>
              {err && <p className="text-sm font-medium text-red-600">{err}</p>}
              <button className="btn-primary magnetic w-full py-3" disabled={state === "sending"}>{state === "sending" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send message</button>
            </form>
          )}
        </div>
      </section>
    </PublicLayout>
  );
}
