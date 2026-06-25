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
  creditsEnabled: boolean;
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
  return { allowAnonymous: true, registrationEnabled: true, creditsEnabled: false };
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
  credits: number;
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

/** A capped, paginated list response (#59h): the array plus its true total. */
export interface Page {
  total: number;
  limit: number;
  offset: number;
}

export const adminListUsers = () =>
  request<{ users: AdminUser[] } & Page>("GET", "/api/admin/users");
export const adminOverview = () => request<AdminOverview>("GET", "/api/admin/overview");
export const adminAudit = () =>
  request<{ entries: AuditEntry[] } & Page>("GET", "/api/admin/audit");
export const adminSetRole = (id: string, role: "admin" | "user") =>
  put(`/api/admin/users/${id}/role`, { role });
export const adminSetVerified = (id: string, verified: boolean) =>
  put(`/api/admin/users/${id}/verify`, { verified });
export const adminDeleteUser = (id: string) => request("DELETE", `/api/admin/users/${id}`);
export const adminGrantCredits = (id: string, amount: number, reason?: string) =>
  request<{ balance: number }>("POST", `/api/admin/users/${id}/credits`, { amount, reason });

// --- Admin: server settings / health / usage / vaults / backups (#57b) -----

export interface CreditPricing {
  perMessage: number;
  perModelMessage: Record<string, number>;
  perCampaign: number;
  perImage: number;
  perThousandTtsChars: number;
  perThousandPromptTokens: number;
  perThousandCompletionTokens: number;
}
export interface ServerSettings {
  allowAnonymous: boolean;
  /** True when the live value differs from the boot snapshot routing uses (#59f). */
  allowAnonymousPendingRestart?: boolean;
  registrationEnabled: boolean;
  requireVerifiedEmail: boolean;
  creditsEnabled: boolean;
  pricing: CreditPricing;
  /** Models the per-message price table covers (primary + re-roll alternates). */
  models: string[];
  providers: {
    llm: { provider: string; model: string; baseUrl: string; hasKey: boolean };
    image: { enabled: boolean; model: string | null };
    tts: { engine: string };
    srdPath: string;
  };
}
export type ServerSettingsPatch = Partial<
  Pick<ServerSettings, "allowAnonymous" | "registrationEnabled" | "requireVerifiedEmail" | "creditsEnabled">
> & { pricing?: Partial<CreditPricing> };

export const adminGetServerSettings = () =>
  request<ServerSettings>("GET", "/api/admin/server-settings");
export const adminSaveServerSettings = (patch: ServerSettingsPatch) =>
  put<ServerSettings>("/api/admin/server-settings", patch);

export interface AdminHealth {
  ok: boolean;
  startedAt: string;
  uptimeSec: number;
  node: string;
  memory: { rss: number; heapUsed: number; heapTotal: number };
  vaultPath: string;
  users: number;
  activeSessions: number;
  auth: {
    allowAnonymous: boolean;
    registrationEnabled: boolean;
    requireVerifiedEmail: boolean;
    smtp: boolean;
    publicUrl: string;
  };
  credits: { enabled: boolean; pricing: CreditPricing };
  providers: ServerSettings["providers"];
}
export const adminHealth = () => request<AdminHealth>("GET", "/api/admin/health");

export interface AdminUsage {
  byReason: { reason: string; spent: number; granted: number; count: number }[];
  byUser: { userId: string; email: string | null; balance: number; spent: number; entries: number }[];
  totals: { spent: number; granted: number; entries: number };
  byUserTotal: number;
  limit: number;
  offset: number;
  creditsEnabled: boolean;
}
export const adminUsage = () => request<AdminUsage>("GET", "/api/admin/usage");

export interface AdminCampaign {
  scope: string;
  folder: string;
  name: string;
  sizeBytes: number;
  ownerEmail: string | null;
}
export const adminListVaults = () =>
  request<{ campaigns: AdminCampaign[] } & Page>("GET", "/api/admin/vaults");
export const adminDeleteCampaign = (scope: string, folder: string) =>
  request("DELETE", `/api/admin/vaults/${encodeURIComponent(scope)}/campaigns/${encodeURIComponent(folder)}`);
export const adminExportCampaignUrl = (scope: string, folder: string) =>
  `/api/admin/vaults/${encodeURIComponent(scope)}/campaigns/${encodeURIComponent(folder)}/export`;

export interface BackupInfo {
  name: string;
  sizeBytes: number;
  createdAt: string;
}
export const adminListBackups = () => request<{ backups: BackupInfo[] }>("GET", "/api/admin/backups");
export const adminCreateBackup = () => post<BackupInfo>("/api/admin/backups", {});
export const adminDeleteBackup = (name: string) =>
  request("DELETE", `/api/admin/backups/${encodeURIComponent(name)}`);
export const adminBackupUrl = (name: string) => `/api/admin/backups/${encodeURIComponent(name)}`;

// --- Credits (#56e) --------------------------------------------------------

export interface CreditMovement {
  id: string;
  delta: number;
  reason: string;
  ref: string | null;
  createdAt: string;
}

export const fetchCredits = () =>
  request<{ balance: number; history: CreditMovement[] }>("GET", "/api/credits");
