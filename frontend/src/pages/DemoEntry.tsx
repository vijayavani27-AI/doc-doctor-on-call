import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useApp } from "../lib/store";
import type { User } from "../lib/types";
import { Spinner } from "../components/ui";

/** /demo opens the demo family directly (handy link for judges): /demo?next=/app/risks */
export default function DemoEntry() {
  const { login } = useApp();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const next = params.get("next") || "/app";
    try { localStorage.setItem("doc_tour_seen", "1"); } catch { /* ignore */ }
    api.post<{ access_token: string; user: User }>("/auth/demo")
      .then((s) => login(s.access_token, s.user))
      .then(() => nav(next.startsWith("/app") ? next : "/app", { replace: true }))
      .catch((e) => setErr((e as Error).message));
  }, [login, nav, params]);
  return <div className="grid min-h-dvh place-items-center">{err ? <p className="text-red-600">{err}</p> : <Spinner label="Opening the demo family…" />}</div>;
}
