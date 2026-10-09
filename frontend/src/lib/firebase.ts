/** Firebase Authentication (Google + email). Loaded only when the server says sign-in mode is "firebase".
 * The browser gets a Firebase ID token and exchanges it once at /api/auth/firebase for a DOC session. */
import type { FirebaseApp } from "firebase/app";
import type { Auth } from "firebase/auth";
import { api } from "./api";
import type { User } from "./types";

export interface AuthConfig {
  mode: "firebase" | "local";
  firebase: { apiKey: string; authDomain: string; projectId: string; appId: string } | null;
}
export interface Session { access_token: string; user: User; created?: boolean }

let cfgPromise: Promise<AuthConfig> | null = null;
let authPromise: Promise<Auth> | null = null;

export function authConfig(): Promise<AuthConfig> {
  if (!cfgPromise) cfgPromise = api.get<AuthConfig>("/auth/config").catch(() => ({ mode: "local", firebase: null }) as AuthConfig);
  return cfgPromise;
}

async function auth(): Promise<Auth> {
  if (!authPromise) {
    authPromise = (async () => {
      const cfg = await authConfig();
      if (cfg.mode !== "firebase" || !cfg.firebase) throw new Error("Firebase sign-in is not configured");
      const [{ initializeApp, getApps }, { getAuth, browserLocalPersistence, setPersistence }] = await Promise.all([
        import("firebase/app"),
        import("firebase/auth"),
      ]);
      const app: FirebaseApp = getApps()[0] ?? initializeApp(cfg.firebase);
      const a = getAuth(app);
      await setPersistence(a, browserLocalPersistence);
      return a;
    })();
  }
  return authPromise;
}

const MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "Wrong email or password.",
  "auth/wrong-password": "Wrong email or password.",
  "auth/user-not-found": "No account with this email. Create one first.",
  "auth/email-already-in-use": "An account with this email already exists. Sign in instead.",
  "auth/weak-password": "Password is too weak. Use at least 8 characters with letters and numbers.",
  "auth/invalid-email": "That email address doesn't look right.",
  "auth/popup-closed-by-user": "The Google window was closed before signing in.",
  "auth/popup-blocked": "Your browser blocked the Google window. Allow pop-ups and try again.",
  "auth/cancelled-popup-request": "Sign-in was cancelled.",
  "auth/too-many-requests": "Too many attempts. Please wait a few minutes and try again.",
  "auth/network-request-failed": "Network problem. Check your internet and try again.",
  "auth/unauthorized-domain": "This website address isn't allowed for sign-in yet (Firebase authorized domains).",
};

export function friendly(e: unknown): string {
  const code = (e as { code?: string })?.code;
  return (code && MESSAGES[code]) || (e as Error)?.message || "Sign-in failed. Please try again.";
}

async function exchange(idToken: string, extra?: { name?: string; sex?: string }): Promise<Session> {
  return api.post<Session>("/auth/firebase", { id_token: idToken, ...extra });
}

export async function signInWithGoogle(extra?: { sex?: string }): Promise<Session> {
  const a = await auth();
  const { GoogleAuthProvider, signInWithPopup } = await import("firebase/auth");
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const cred = await signInWithPopup(a, provider);
  return exchange(await cred.user.getIdToken(), { name: cred.user.displayName ?? undefined, ...extra });
}

export async function signInWithEmail(email: string, password: string): Promise<Session> {
  const a = await auth();
  const { signInWithEmailAndPassword } = await import("firebase/auth");
  const cred = await signInWithEmailAndPassword(a, email, password);
  return exchange(await cred.user.getIdToken());
}

export async function registerWithEmail(name: string, email: string, password: string, sex: string): Promise<Session> {
  const a = await auth();
  const { createUserWithEmailAndPassword, sendEmailVerification, updateProfile } = await import("firebase/auth");
  const cred = await createUserWithEmailAndPassword(a, email, password);
  await updateProfile(cred.user, { displayName: name }).catch(() => {});
  sendEmailVerification(cred.user).catch(() => {});
  return exchange(await cred.user.getIdToken(true), { name, sex });
}

export async function resetPassword(email: string): Promise<void> {
  const a = await auth();
  const { sendPasswordResetEmail } = await import("firebase/auth");
  await sendPasswordResetEmail(a, email);
}

export async function firebaseSignOut(): Promise<void> {
  if (!authPromise) return;
  try {
    const a = await authPromise;
    const { signOut } = await import("firebase/auth");
    await signOut(a);
  } catch {
    /* not signed in with Firebase */
  }
}
