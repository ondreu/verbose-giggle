/**
 * Thin client for the auth API (#55e). Same-origin requests carry the
 * httpOnly session cookie automatically; we pass `credentials: "same-origin"`
 * explicitly for clarity. Each call returns a small discriminated result so the
 * UI can render error states without try/catch sprawl.
 */

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  emailVerified: boolean;
  role: "user" | "admin";
}

export interface AuthConfig {
  allowAnonymous: boolean;
  registrationEnabled: boolean;
}

export type AuthResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string };

async function post<T = void>(path: string, body: unknown): Promise<AuthResult<T>> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, status: 0, error: "Nepodařilo se spojit se serverem." };
  }
  let data: any = {};
  try {
    data = await res.json();
  } catch {
    /* empty/no body */
  }
  if (res.ok) return { ok: true, data: data as T };
  return { ok: false, status: res.status, error: data?.error || "Něco se pokazilo." };
}

export async function fetchAuthConfig(): Promise<AuthConfig> {
  try {
    const res = await fetch("/api/auth/config", { credentials: "same-origin" });
    if (res.ok) return (await res.json()) as AuthConfig;
  } catch {
    /* fall through */
  }
  // Safe default if the endpoint is unreachable: behave like self-hosted.
  return { allowAnonymous: true, registrationEnabled: true };
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  try {
    const res = await fetch("/api/auth/me", { credentials: "same-origin" });
    if (res.ok) return ((await res.json()) as { user: AuthUser }).user;
  } catch {
    /* fall through */
  }
  return null;
}

export const login = (email: string, password: string) =>
  post<{ user: AuthUser }>("/api/auth/login", { email, password });

export const register = (email: string, password: string) =>
  post<{ userId: string; emailVerified: boolean }>("/api/auth/register", { email, password });

export const resendVerification = (email: string) =>
  post("/api/auth/resend-verification", { email });

export const requestPasswordReset = (email: string) => post("/api/auth/forgot", { email });

export const logout = () => post("/api/auth/logout", {});
