import type { Lang } from "./types";

const dict = {
  dashboard: { en: "Home", hi: "होम", ta: "முகப்பு" },
  upload: { en: "Upload", hi: "अपलोड", ta: "பதிவேற்று" },
  records: { en: "Records", hi: "रिकॉर्ड", ta: "பதிவுகள்" },
  timeline: { en: "Timeline", hi: "टाइमलाइन", ta: "காலவரிசை" },
  risks: { en: "Hidden Risks", hi: "छिपे खतरे", ta: "மறைந்த அபாயங்கள்" },
  medicines: { en: "Medicines", hi: "दवाइयाँ", ta: "மருந்துகள்" },
  chat: { en: "Ask AI", hi: "AI से पूछें", ta: "AI-யிடம் கேள்" },
  doctor: { en: "Doctor Visit", hi: "डॉक्टर विज़िट", ta: "மருத்துவர் சந்திப்பு" },
  settings: { en: "Settings", hi: "सेटिंग्स", ta: "அமைப்புகள்" },
  wellness: { en: "Wellness", hi: "वेलनेस", ta: "நலவாழ்வு" },
  guide: { en: "Guide", hi: "गाइड", ta: "வழிகாட்டி" },
  more: { en: "More", hi: "और", ta: "மேலும்" },
  hello: { en: "Hello", hi: "नमस्ते", ta: "வணக்கம்" },
  todo: { en: "Top things to do now", hi: "अभी करने योग्य मुख्य बातें", ta: "இப்போது செய்ய வேண்டியவை" },
  explain: { en: "Explain simply", hi: "आसान भाषा में समझाएँ", ta: "எளிமையாக விளக்கு" },
  logout: { en: "Log out", hi: "लॉग आउट", ta: "வெளியேறு" },
  notDoctor: {
    en: "DOC helps you understand your records. It does not replace your doctor.",
    hi: "DOC आपकी रिपोर्ट समझने में मदद करता है। यह डॉक्टर की जगह नहीं लेता।",
    ta: "DOC உங்கள் அறிக்கைகளைப் புரிந்துகொள்ள உதவுகிறது. இது மருத்துவருக்கு மாற்று அல்ல.",
  },
} as const;

export type Key = keyof typeof dict;

export function t(key: Key, lang: Lang = "en"): string {
  return dict[key][lang] ?? dict[key].en;
}

export const LANG_NAMES: Record<Lang, string> = { en: "English", hi: "हिन्दी", ta: "தமிழ்" };
