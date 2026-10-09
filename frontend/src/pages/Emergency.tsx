import { useState, type FormEvent, type ReactNode } from "react";
import { Siren, Phone, Ambulance, BrainCircuit, Share2, Copy, CheckCircle2, ShieldAlert, Hospital, LocateFixed, MapPin, Navigation, Search, Droplet, Pill, AlertTriangle, UserRound, ListChecks, Loader2 } from "lucide-react";
import { useApp, useFetch } from "../lib/store";
import { conditionLabels } from "../lib/format";
import { Disclaimer, PageHeader, Spinner } from "../components/ui";
import { t } from "../lib/i18n";

interface CallNumber { label: string; number: string }
interface Urgent { level: string; message: string; reasons: string[]; call: CallNumber[] }
interface SosCard {
  name: string; age: number | null; sex: "F" | "M" | null; blood_group: string | null; allergies: string[]; conditions: string[];
  emergency_contact: { name: string | null; phone: string | null }; medicines: string[]; red_risks: string[];
}
interface Sos { numbers: CallNumber[]; card: SosCard; urgent: Urgent | null; share_message: string; steps: string[]; disclaimer?: string }

interface Place { id: string; name: string; type: string; lat: number; lon: number; km: number; phone: string | null; emergency: boolean; address: string | null }
interface OsmElement { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }

const STATIC_NUMBERS: CallNumber[] = [
  { label: "Emergency (all services)", number: "112" },
  { label: "Ambulance", number: "108" },
  { label: "Tele-MANAS mental health helpline (24x7, free)", number: "14416" },
];
const NUM_STYLE: Record<string, { cls: string; icon: typeof Phone }> = {
  "112": { cls: "bg-red-600 hover:bg-red-700", icon: Siren },
  "108": { cls: "bg-orange-500 hover:bg-orange-600", icon: Ambulance },
  "14416": { cls: "bg-violet-600 hover:bg-violet-700", icon: BrainCircuit },
};
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const RADIUS_M = 5000;

function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function getPosition(timeout = 12000): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("unsupported"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      (e) => reject(e),
      { enableHighAccuracy: true, timeout, maximumAge: 60_000 },
    );
  });
}

async function overpass(lat: number, lon: number): Promise<OsmElement[]> {
  const q = `[out:json][timeout:20];(nwr["amenity"="hospital"](around:${RADIUS_M},${lat},${lon});nwr["amenity"="clinic"](around:${RADIUS_M},${lat},${lon});nwr["healthcare"="hospital"](around:${RADIUS_M},${lat},${lon}););out center 40;`;
  let last: unknown = null;
  for (const url of OVERPASS) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 25_000);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(q),
        signal: ctl.signal,
      });
      if (!res.ok) throw new Error(`Map service error ${res.status}`);
      const j = (await res.json()) as { elements?: OsmElement[] };
      return j.elements ?? [];
    } catch (e) {
      last = e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw last instanceof Error ? last : new Error("Map service unavailable");
}

function toPlaces(els: OsmElement[], origin: { lat: number; lon: number }): Place[] {
  const seen = new Set<string>();
  const out: Place[] = [];
  for (const e of els) {
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    if (lat === undefined || lon === undefined) continue;
    const tags = e.tags ?? {};
    const isClinic = tags.amenity === "clinic" && tags.healthcare !== "hospital";
    const name = tags.name || tags["name:en"] || (isClinic ? "Unnamed clinic" : "Unnamed hospital");
    const key = `${name.toLowerCase()}|${lat.toFixed(3)}|${lon.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const phone = (tags.phone || tags["contact:phone"] || tags["contact:mobile"] || "").split(/[;,]/)[0].trim() || null;
    const address = [tags["addr:housenumber"], tags["addr:street"], tags["addr:suburb"], tags["addr:city"]].filter(Boolean).join(", ") || null;
    out.push({ id: `${e.type}/${e.id}`, name, type: isClinic ? "Clinic" : "Hospital", lat, lon, km: haversineKm(origin, { lat, lon }), phone, emergency: tags.emergency === "yes", address });
  }
  return out.sort((a, b) => a.km - b.km);
}

function UrgentBanner({ u }: { u: Urgent }) {
  const calls = [...u.call];
  for (const n of [{ label: "Emergency", number: "112" }, { label: "Ambulance", number: "108" }]) if (!calls.some((c) => c.number === n.number)) calls.push(n);
  return (
    <div role="alert" className="card mb-6 border-red-300 bg-red-50 p-5 text-red-900 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
      <div className="flex items-start gap-3">
        <ShieldAlert className="h-6 w-6 shrink-0 text-red-600" />
        <div className="min-w-0 flex-1">
          <p className="font-extrabold">{u.message}</p>
          {!!u.reasons.length && <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">{u.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
          <div className="mt-3 flex flex-wrap gap-2">
            {calls.map((c) => <a key={c.number} href={`tel:${c.number}`} className="btn bg-red-600 text-white hover:bg-red-700"><Phone className="h-4 w-4" /> {c.number} · {c.label}</a>)}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="mt-0.5 text-slate-400">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide muted">{label}</p>
        <div className="text-sm font-semibold">{children}</div>
      </div>
    </div>
  );
}

function shareText(sos: Sos, location: string) {
  const c = sos.card;
  const lines = [
    sos.share_message.replace("{location}", location),
    "",
    `Emergency card: ${c.name}${c.age ? `, ${c.age} yrs` : ""}${c.sex ? `, ${c.sex === "F" ? "female" : "male"}` : ""}`,
    c.blood_group ? `Blood group: ${c.blood_group}` : "",
    `Allergies: ${c.allergies.length ? c.allergies.join(", ") : "none known"}`,
    c.conditions.length ? `Conditions: ${c.conditions.map((x) => conditionLabels[x] ?? x).join(", ")}` : "",
    c.medicines.length ? `Medicines: ${c.medicines.join("; ")}` : "",
    c.emergency_contact.phone ? `Emergency contact: ${c.emergency_contact.name ?? ""} ${c.emergency_contact.phone}`.trim() : "",
  ];
  return lines.filter((l, i) => l !== "" || i === 1).join("\n");
}

export default function Emergency() {
  const { profile, lang } = useApp();
  const { data: sos, error, loading } = useFetch<Sos>(profile ? `/profiles/${profile.id}/sos?lang=${lang}` : null);
  const numbers = sos?.numbers?.length ? sos.numbers : STATIC_NUMBERS;

  const [withLoc, setWithLoc] = useState(true);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  const [phase, setPhase] = useState<"idle" | "locating" | "searching" | "done" | "error">("idle");
  const [places, setPlaces] = useState<Place[]>([]);
  const [hErr, setHErr] = useState<string | null>(null);
  const [askArea, setAskArea] = useState(false);
  const [area, setArea] = useState("");
  const [where, setWhere] = useState<string | null>(null);

  async function share() {
    if (!sos) return;
    setSharing(true);
    setShareMsg(null);
    let loc = "not shared";
    if (withLoc) {
      try {
        const p = await getPosition(8000);
        loc = `https://www.google.com/maps?q=${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;
      } catch {
        loc = "not available";
      }
    }
    const text = shareText(sos, loc);
    try {
      if (navigator.share) {
        await navigator.share({ title: `Emergency: ${sos.card.name}`, text });
        setShareMsg("Shared.");
      } else {
        await navigator.clipboard.writeText(text);
        setShareMsg("Copied to clipboard. Paste it into WhatsApp or SMS.");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        try {
          await navigator.clipboard.writeText(text);
          setShareMsg("Copied to clipboard. Paste it into WhatsApp or SMS.");
        } catch {
          setShareMsg("Could not share automatically. Please read the card out over the phone.");
        }
      }
    } finally {
      setSharing(false);
    }
  }

  async function search(origin: { lat: number; lon: number }, label: string) {
    setPhase("searching");
    setWhere(label);
    try {
      const els = await overpass(origin.lat, origin.lon);
      setPlaces(toPlaces(els, origin));
      setPhase("done");
    } catch {
      setHErr("The map service is busy right now. Please try again in a minute, or call 108 for an ambulance.");
      setPhase("error");
    }
  }

  async function findNearMe() {
    setHErr(null);
    setPhase("locating");
    try {
      const p = await getPosition();
      await search(p, "your location");
    } catch (e) {
      const denied = (e as GeolocationPositionError)?.code === 1;
      setHErr(denied ? "Location permission was not given. Type your city or area instead." : "Could not get your location. Type your city or area instead.");
      setAskArea(true);
      setPhase("error");
    }
  }

  async function findByArea(e: FormEvent) {
    e.preventDefault();
    if (!area.trim()) return;
    setHErr(null);
    setPhase("locating");
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(area.trim())}`, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error();
      const j = (await res.json()) as { lat: string; lon: string; display_name: string }[];
      if (!j.length) {
        setHErr(`We could not find "${area.trim()}". Try a nearby city or landmark.`);
        setPhase("error");
        return;
      }
      await search({ lat: Number(j[0].lat), lon: Number(j[0].lon) }, j[0].display_name.split(",").slice(0, 2).join(","));
    } catch {
      setHErr("Could not look up that place right now. Please try again, or call 108.");
      setPhase("error");
    }
  }

  const busy = phase === "locating" || phase === "searching";
  const c = sos?.card;

  return (
    <div>
      <PageHeader icon={<Siren className="h-6 w-6" />} title="SOS & hospitals" subtitle="One tap to call for help, an emergency card to show the ambulance team, and the nearest hospitals with directions." />

      {sos?.urgent && <UrgentBanner u={sos.urgent} />}

      <section className="mb-6 grid gap-3 sm:grid-cols-3">
        {numbers.map((n) => {
          const s = NUM_STYLE[n.number] ?? { cls: "bg-brand-600 hover:bg-brand-700", icon: Phone };
          return (
            <a key={n.number} href={`tel:${n.number}`} className={`flex items-center gap-4 rounded-2xl p-5 text-white shadow-lift transition active:scale-[0.98] ${s.cls}`} aria-label={`Call ${n.number}, ${n.label}`}>
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/20"><s.icon className="h-7 w-7" /></div>
              <div className="min-w-0">
                <p className="text-3xl font-extrabold leading-none">{n.number}</p>
                <p className="mt-1 text-sm font-semibold text-white/90">{n.label}</p>
              </div>
              <Phone className="ml-auto h-5 w-5 shrink-0 opacity-80" />
            </a>
          );
        })}
      </section>
      {error && <p className="mb-6 text-xs muted">Could not load your emergency card ({error}). The numbers above always work.</p>}

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="card p-5 lg:col-span-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-bold"><UserRound className="h-5 w-5 text-red-500" /> Emergency card</h2>
            {sos && (
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs muted">
                  <input type="checkbox" checked={withLoc} onChange={(e) => setWithLoc(e.target.checked)} className="accent-brand-600" /> Include my location
                </label>
                <button className="btn-primary py-2 text-xs" onClick={share} disabled={sharing}>
                  {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : typeof navigator.share === "function" ? <Share2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Share
                </button>
              </div>
            )}
          </div>
          {shareMsg && <p className="mb-2 flex items-center gap-2 rounded-xl bg-brand-50 p-3 text-sm dark:bg-brand-500/10"><CheckCircle2 className="h-4 w-4 text-brand-600" />{shareMsg}</p>}
          {loading && !c ? <Spinner /> : c ? (
            <div className="divide-y divide-slate-100 dark:divide-white/5">
              <div className="flex flex-wrap items-end justify-between gap-3 pb-3">
                <div>
                  <p className="text-xl font-extrabold text-ink dark:text-white">{c.name}</p>
                  <p className="text-sm muted">{[c.age ? `${c.age} years` : null, c.sex ? (c.sex === "F" ? "Female" : "Male") : null].filter(Boolean).join(" · ") || "Age not set"}</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-semibold uppercase tracking-wide muted">Blood group</p>
                  <p className="flex items-center justify-end gap-1 text-2xl font-extrabold text-red-600 dark:text-red-400"><Droplet className="h-5 w-5" />{c.blood_group || "?"}</p>
                </div>
              </div>
              <Row icon={<AlertTriangle className="h-4 w-4" />} label="Allergies">
                {c.allergies.length ? <span className="text-red-700 dark:text-red-300">{c.allergies.join(", ")}</span> : <span className="font-normal muted">None recorded</span>}
              </Row>
              <Row icon={<ListChecks className="h-4 w-4" />} label="Conditions">
                {c.conditions.length ? <div className="flex flex-wrap gap-1.5">{c.conditions.map((x) => <span key={x} className="chip bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200">{conditionLabels[x] ?? x}</span>)}</div> : <span className="font-normal muted">None recorded</span>}
              </Row>
              <Row icon={<Pill className="h-4 w-4" />} label="Current medicines">
                {c.medicines.length ? <ul className="space-y-0.5">{c.medicines.map((m) => <li key={m}>{m}</li>)}</ul> : <span className="font-normal muted">None recorded</span>}
              </Row>
              {!!c.red_risks.length && (
                <Row icon={<ShieldAlert className="h-4 w-4 text-red-500" />} label="Flagged in reports (worth telling the doctor)">
                  <ul className="space-y-0.5 text-red-700 dark:text-red-300">{c.red_risks.map((r) => <li key={r}>{r}</li>)}</ul>
                </Row>
              )}
              <Row icon={<Phone className="h-4 w-4" />} label="Emergency contact">
                {c.emergency_contact.phone ? (
                  <a href={`tel:${c.emergency_contact.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-2 text-brand-700 hover:underline dark:text-brand-300">
                    {c.emergency_contact.name || "Contact"} · {c.emergency_contact.phone}
                  </a>
                ) : <span className="font-normal muted">Not set. Add one in Settings so DOC can show it here.</span>}
              </Row>
            </div>
          ) : null}
        </section>

        <section className="card p-5 lg:col-span-2">
          <h2 className="mb-3 flex items-center gap-2 font-bold"><ListChecks className="h-5 w-5 text-brand-600" /> What to do now</h2>
          <ol className="space-y-3">
            {(sos?.steps ?? ["Call 112 (or 108 for an ambulance) and say where you are.", "Stay with the person; keep them still and comfortable.", "Show this card to the ambulance team or doctor.", "Do not give food, drink or extra medicine unless a doctor tells you."]).map((s, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-red-100 text-xs font-bold text-red-700 dark:bg-red-500/15 dark:text-red-300">{i + 1}</span>
                <span className="pt-0.5">{s}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-extrabold"><Hospital className="h-5 w-5 text-red-500" /> Nearby hospitals</h2>
            <p className="text-sm muted">Hospitals and clinics within 5 km, from OpenStreetMap. Your location is used only in your browser for this search.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={findNearMe} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />} Find hospitals near me</button>
            {!askArea && <button className="btn-outline" onClick={() => setAskArea(true)}><MapPin className="h-4 w-4" /> Search an area</button>}
          </div>
        </div>

        {askArea && (
          <form onSubmit={findByArea} className="card mb-4 flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
            <input className="input flex-1" placeholder="City, area or landmark, e.g. Adyar, Chennai" value={area} onChange={(e) => setArea(e.target.value)} />
            <button className="btn-outline" disabled={busy || !area.trim()}><Search className="h-4 w-4" /> Search</button>
          </form>
        )}
        {hErr && <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">{hErr}</p>}
        {phase === "locating" && <Spinner label="Finding your location…" />}
        {phase === "searching" && <Spinner label="Looking for hospitals nearby…" />}

        {phase === "done" && (
          places.length ? (
            <>
              <p className="mb-3 text-xs muted">{places.length} place{places.length > 1 ? "s" : ""} near {where}, nearest first. Call ahead if you can; for an emergency, call 108.</p>
              <div className="grid gap-3 md:grid-cols-2">
                {places.map((p) => (
                  <div key={p.id} className="card flex flex-col gap-3 p-4">
                    <div className="flex items-start gap-3">
                      <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${p.type === "Hospital" ? "bg-red-50 text-red-600 dark:bg-red-500/10" : "bg-sky-50 text-sky-600 dark:bg-sky-500/10"}`}><Hospital className="h-5 w-5" /></div>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold">{p.name}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span className="chip bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200">{p.type}</span>
                          {p.emergency && <span className="chip bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"><Siren className="h-3 w-3" /> Emergency</span>}
                        </div>
                        {p.address && <p className="mt-1 truncate text-xs muted">{p.address}</p>}
                      </div>
                      <p className="shrink-0 text-right text-lg font-extrabold text-ink dark:text-white">{p.km < 10 ? p.km.toFixed(1) : Math.round(p.km)} <span className="text-xs font-medium muted">km</span></p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {p.phone && <a href={`tel:${p.phone.replace(/[^\d+]/g, "")}`} className="btn-outline py-2 text-xs"><Phone className="h-4 w-4" /> {p.phone}</a>}
                      <a href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}`} target="_blank" rel="noopener noreferrer" className="btn-primary py-2 text-xs"><Navigation className="h-4 w-4" /> Directions</a>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="card p-5 text-sm muted">No hospitals found within 5 km of {where} on OpenStreetMap. Try a nearby city, or call 108 for an ambulance.</p>
          )
        )}
        <p className="mt-3 text-[11px] muted">Data © <a className="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>. Listings may be incomplete or out of date.</p>
      </section>

      <Disclaimer text={sos?.disclaimer ?? `${t("notDoctor", lang)} In an emergency, call 112 or 108 first. This page does not replace emergency services.`} />
    </div>
  );
}
