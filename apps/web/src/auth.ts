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

async function request<T>(method: string, path: string, body?: unknown): Promise<AuthResult<T>> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body !== undefined ? { "content-type": "application/json" } : undefined,
      credentials: "same-origin",
      body: body !== undefined ? JSON.stringify(body) : undefined,
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

const post = <T = void>(path: string, body: unknown) => request<T>("POST", path, body);

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

// --- Account settings (#58a) ----------------------------------------------

const put = <T = void>(path: string, body: unknown) => request<T>("PUT", path, body);

export const changeProfile = (displayName: string | null) =>
  put<{ user: AuthUser }>("/api/account/profile", { displayName });

export const changeEmail = (email: string) =>
  put<{ user: AuthUser }>("/api/account/email", { email });

export const changePassword = (currentPassword: string, newPassword: string) =>
  put("/api/account/password", { currentPassword, newPassword });

export const deleteAccount = () => request("DELETE", "/api/account");

// --- Admin (#57d) ----------------------------------------------------------

export interface AdminUser extends AuthUser {
  createdAt: string;
}
export interface AdminOverview {
  users: number;
  admins: number;
  unverified: number;
}
export interface AuditEntry {
  id: string;
  actorId: string;
  action: string;
  targetId: string | null;
  detail: string | null;
  createdAt: string;
}

export const adminListUsers = () => request<{ users: AdminUser[] }>("GET", "/api/admin/users");
export const adminOverview = () => request<AdminOverview>("GET", "/api/admin/overview");
export const adminAudit = () => request<{ entries: AuditEntry[] }>("GET", "/api/admin/audit");
export const adminSetRole = (id: string, role: "admin" | "user") =>
  put(`/api/admin/users/${id}/role`, { role });
export const adminSetVerified = (id: string, verified: boolean) =>
  put(`/api/admin/users/${id}/verify`, { verified });
export const adminDeleteUser = (id: string) => request("DELETE", `/api/admin/users/${id}`);
