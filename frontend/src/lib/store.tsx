import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, getToken, setToken, setUnauthorizedHandler } from "./api";
import { firebaseSignOut } from "./firebase";
import type { Lang, Profile, User } from "./types";

interface AppState {
  user: User | null;
  loading: boolean;
  profiles: Profile[];
  profile: Profile | null;
  lang: Lang;
  dark: boolean;
  setDark: (v: boolean) => void;
  setLang: (l: Lang) => void;
  selectProfile: (id: number) => void;
  refreshProfiles: () => Promise<void>;
  login: (token: string, user: User) => Promise<void>;
  logout: () => void;
  setUser: (u: User) => void;
  /** bump to make pages refetch after data changes */
  version: number;
  bump: () => void;
}

const Ctx = createContext<AppState | null>(null);
const PROFILE_KEY = "ct_profile";

function readLS(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLS(key: string, v: string | null) {
  try {
    if (v === null) localStorage.removeItem(key);
    else localStorage.setItem(key, v);
  } catch {
    /* ignore */
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileId, setProfileId] = useState<number | null>(() => Number(readLS(PROFILE_KEY)) || null);
  const [version, setVersion] = useState(0);
  const [dark, setDarkState] = useState<boolean>(() => {
    const s = readLS("ct_dark");
    return s ? s === "1" : window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const logout = useCallback(() => {
    firebaseSignOut();
    setToken(null);
    setUser(null);
    setProfiles([]);
  }, []);

  useEffect(() => { setUnauthorizedHandler(logout); }, [logout]);

  const refreshProfiles = useCallback(async () => {
    const ps = await api.get<Profile[]>("/profiles");
    setProfiles(ps);
    setProfileId((cur) => (cur && ps.some((p) => p.id === cur) ? cur : ps[0]?.id ?? null));
  }, []);

  useEffect(() => {
    (async () => {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        setUser(await api.get<User>("/auth/me"));
        await refreshProfiles();
      } catch {
        setToken(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshProfiles]);

  const login = useCallback(
    async (token: string, u: User) => {
      setToken(token);
      setUser(u);
      await refreshProfiles();
    },
    [refreshProfiles],
  );

  const value = useMemo<AppState>(
    () => ({
      user,
      loading,
      profiles,
      profile: profiles.find((p) => p.id === profileId) ?? profiles[0] ?? null,
      lang: user?.language ?? "en",
      dark,
      setDark: (v) => {
        setDarkState(v);
        writeLS("ct_dark", v ? "1" : "0");
      },
      setLang: (l) => {
        if (!user) return;
        setUser({ ...user, language: l });
        api.patch("/auth/me", { language: l }).catch(() => {});
      },
      selectProfile: (id) => {
        setProfileId(id);
        writeLS(PROFILE_KEY, String(id));
      },
      refreshProfiles,
      login,
      logout,
      setUser,
      version,
      bump: () => setVersion((v) => v + 1),
    }),
    [user, loading, profiles, profileId, dark, refreshProfiles, login, logout, version],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp outside AppProvider");
  return c;
}

/** Small data hook: refetches when the path, active profile or app version changes. */
export function useFetch<T>(path: string | null) {
  const { version } = useApp();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    setLoading(true);
    setError(null);
    api
      .get<T>(path)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [path, version, tick]);
  return { data, error, loading, reload: () => setTick((t) => t + 1), setData };
}
