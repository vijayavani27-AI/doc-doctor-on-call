import { Link } from "react-router-dom";
import { ShieldCheck, FileText, Stethoscope } from "lucide-react";
import { PublicLayout } from "../components/PublicLayout";
import { SITE } from "../lib/site";

const SECTIONS = [
  {
    id: "privacy", icon: ShieldCheck, title: "Privacy policy",
    items: [
      ["What we store", "Your account (name, email, hashed password), the profiles you add, the reports you upload (stored encrypted), the values you confirm, medicines, symptoms and an access log."],
      ["Why we store it", "Only to show you your own health picture, calculate insights and create summaries you choose to share. We don't sell or share your data."],
      ["AI processing", "When AI reading is turned on, report text is sent to the AI provider with names, phone numbers and ID numbers removed first. Photos can't be cleaned automatically, so they are sent only when needed (this can be turned off)."],
      ["Sharing", "Nothing is shared unless you create a share link. Links show first names only, expire automatically, can be revoked, and every view is logged."],
      ["Your rights", "You can export all your data as a file or delete your account and everything in it from Settings at any time, in line with India's Digital Personal Data Protection Act, 2023."],
      ["Security", "Passwords are hashed (bcrypt), 2-step login is available, uploads are encrypted at rest, and logins are rate-limited."],
    ],
  },
  {
    id: "terms", icon: FileText, title: "Terms of use",
    items: [
      ["The service", `${SITE.name} is a hackathon prototype provided "as is" to help people organise and understand their medical records.`],
      ["Your responsibility", "Check the values DOC reads before confirming them, keep your sign-in (Google account or password) safe, and only upload reports you have the right to manage (yours, or a family member's with their consent)."],
      ["Fair use", "Don't misuse the service, try to access other people's data, or upload harmful files."],
      ["Changes", "Features may change as the project develops."],
    ],
  },
  {
    id: "disclaimer", icon: Stethoscope, title: "Medical disclaimer",
    items: [
      ["Not a doctor", `${SITE.name} (${SITE.fullName}) does not provide medical advice, diagnosis or treatment. The name describes an always-available helper for your records, not a medical professional.`],
      ["Screening scores", "Risk scores use published formulas, which are screening tools with known limits. A high score means “ask your doctor”, not “you have this disease”."],
      ["Medicines", "Never start, stop or change a medicine because of DOC. Talk to your doctor or pharmacist first. Prices shown are estimates."],
      ["Emergencies", "In an emergency call 112 or 108, or go to the nearest hospital."],
    ],
  },
];

export default function Legal() {
  return (
    <PublicLayout>
      <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <h1 className="text-4xl font-extrabold tracking-tight text-ink dark:text-white">Legal</h1>
        <p className="mt-2 muted">Plain-language privacy policy, terms and medical disclaimer.</p>
        <div className="mt-6 flex flex-wrap gap-2">{SECTIONS.map((s) => <Link key={s.id} to={`/legal#${s.id}`} className="chip bg-white px-3 py-1.5 shadow-soft dark:bg-white/10">{s.title}</Link>)}</div>
        <div className="mt-10 space-y-8">
          {SECTIONS.map(({ id, icon: Icon, title, items }) => (
            <section key={id} id={id} className="card reveal scroll-mt-24 p-6 sm:p-8">
              <h2 className="flex items-center gap-2 text-xl font-bold"><Icon className="h-5 w-5 text-brand-600" /> {title}</h2>
              <dl className="mt-4 space-y-4">
                {items.map(([k, v]) => (
                  <div key={k}><dt className="font-semibold text-ink dark:text-white">{k}</dt><dd className="mt-1 text-sm leading-relaxed muted">{v}</dd></div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <p className="mt-8 text-xs muted">Last updated {new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" })}. Questions? <Link to="/contact" className="font-semibold text-brand-700 dark:text-brand-300">Contact us</Link>.</p>
      </div>
    </PublicLayout>
  );
}
