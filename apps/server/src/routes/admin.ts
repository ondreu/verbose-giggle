/**
 * Admin endpoints (#57). The route prefix `/api/admin` is gated to the admin
 * role by the auth guard (`auth/middleware.ts`), so handlers here can assume
 * the caller is an admin (`req.user` is a non-null admin). Mutating actions are
 * recorded to the append-only audit log (#57c). Safety rails prevent an admin
 * from locking themselves out (no self-demote / self-delete).
 */
import type { FastifyInstance } from "fastify";
import type { UserRole, UserStore } from "../auth/users.js";
import type { SessionStore } from "../auth/sessions.js";
import type { AuditStore } from "../auth/audit.js";
import type { CreditStore } from "../credits/ledger.js";
import type { Config } from "../config.js";
import { saveSettings, type Settings } from "../settings.js";
import {
  campaignDir,
  createBackup,
  deleteBackup,
  deleteCampaign,
  listAllCampaigns,
  listBackups,
  backupPath,
} from "../admin/ops.js";
import { zipDir } from "../vault/zip.js";
import { promises as fs } from "node:fs";

export interface AdminContext {
  users: UserStore;
  sessions: SessionStore;
  audit: AuditStore;
  credits: CreditStore;
  /** Vault root (the persistent volume) for backups + cross-tenant management. */
  vaultPath: string;
  /** Live effective config (operational flags, providers). */
  getConfig: () => Config;
  /** Persist + rebuild config after a server-settings change (#57b). */
  reloadConfig: () => Promise<Config>;
  /** Process boot time (ms) for the uptime readout. */
  startedAtMs: number;
  /** ISO clock, injectable for deterministic backup filenames in tests. */
  now?: () => string;
}

function userRow(u: ReturnType<UserStore["list"]>[number]) {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    emailVerified: u.emailVerified,
    role: u.role,
    createdAt: u.createdAt,
  };
}

export async function registerAdminRoutes(app: FastifyInstance, ctx: AdminContext): Promise<void> {
  app.get("/api/admin/users", async () => ({
    users: ctx.users.list().map((u) => ({ ...userRow(u), credits: ctx.credits.balance(u.id) })),
  }));

  app.get("/api/admin/overview", async () => {
    const all = ctx.users.list();
    return {
      users: all.length,
      admins: all.filter((u) => u.role === "admin").length,
      unverified: all.filter((u) => !u.emailVerified).length,
    };
  });

  app.get("/api/admin/audit", async () => ({ entries: ctx.audit.list() }));

  // Change a user's role. Refuses to demote the last/own admin away.
  app.put<{ Params: { id: string }; Body: { role?: string } }>(
    "/api/admin/users/:id/role",
    async (req, reply) => {
      const role = req.body?.role;
      if (role !== "admin" && role !== "user") {
        return reply.code(400).send({ error: "Neplatná role." });
      }
      const target = ctx.users.findById(req.params.id);
      if (!target) return reply.code(404).send({ error: "Uživatel nenalezen." });
      if (target.id === req.user!.id && role !== "admin") {
        return reply.code(400).send({ error: "Nelze odebrat vlastní admin roli." });
      }
      ctx.users.setRole(target.id, role as UserRole);
      ctx.audit.record(req.user!.id, "user.role", target.id, `${target.role} → ${role}`);
      return reply.send({ user: userRow(ctx.users.findById(target.id)!) });
    },
  );

  // Manually verify / unverify a user's email.
  app.put<{ Params: { id: string }; Body: { verified?: boolean } }>(
    "/api/admin/users/:id/verify",
    async (req, reply) => {
      const verified = Boolean(req.body?.verified);
      const target = ctx.users.findById(req.params.id);
      if (!target) return reply.code(404).send({ error: "Uživatel nenalezen." });
      ctx.users.setEmailVerified(target.id, verified);
      ctx.audit.record(req.user!.id, "user.verify", target.id, String(verified));
      return reply.send({ user: userRow(ctx.users.findById(target.id)!) });
    },
  );

  // Manually adjust a user's credits (#56d). Positive grants, negative deducts.
  app.post<{ Params: { id: string }; Body: { amount?: number; reason?: string } }>(
    "/api/admin/users/:id/credits",
    async (req, reply) => {
      const amount = req.body?.amount;
      if (typeof amount !== "number" || !Number.isInteger(amount) || amount === 0) {
        return reply.code(400).send({ error: "Částka musí být nenulové celé číslo." });
      }
      const target = ctx.users.findById(req.params.id);
      if (!target) return reply.code(404).send({ error: "Uživatel nenalezen." });
      const reason = (req.body?.reason || "admin-adjust").slice(0, 200);
      if (amount > 0) ctx.credits.grant(target.id, amount, reason);
      else ctx.credits.charge(target.id, -amount, reason);
      ctx.audit.record(req.user!.id, "user.credits", target.id, `${amount > 0 ? "+" : ""}${amount} (${reason})`);
      return reply.send({ balance: ctx.credits.balance(target.id) });
    },
  );

  // Delete a user (ban). Drops their sessions first. No self-delete.
  app.delete<{ Params: { id: string } }>("/api/admin/users/:id", async (req, reply) => {
    const target = ctx.users.findById(req.params.id);
    if (!target) return reply.code(404).send({ error: "Uživatel nenalezen." });
    if (target.id === req.user!.id) {
      return reply.code(400).send({ error: "Nelze smazat vlastní účet z admin panelu." });
    }
    ctx.sessions.deleteForUser(target.id);
    ctx.users.delete(target.id);
    ctx.audit.record(req.user!.id, "user.delete", target.id, target.email);
    return reply.send({ ok: true });
  });

  const now = ctx.now ?? (() => new Date().toISOString());

  // --- Global server settings (#57b) ---------------------------------------
  // Operational flags + credit pricing, persisted into the vault settings.json
  // (deploy-persistent) and applied live via reloadConfig. Provider creds stay
  // in the existing /api/settings surface; here we show them read-only.
  function serverSettingsView(c: Config) {
    return {
      allowAnonymous: c.auth.allowAnonymous,
      registrationEnabled: c.auth.registrationEnabled,
      requireVerifiedEmail: c.auth.requireVerifiedEmail,
      creditsEnabled: c.credits.enabled,
      pricing: c.credits.pricing,
      // Models the per-message price table covers: primary + re-roll alternates.
      models: [c.llm.model, ...c.llm.altModels].filter((m, i, a) => m && a.indexOf(m) === i),
      providers: {
        llm: {
          provider: c.llm.provider,
          model: c.llm.model,
          baseUrl: c.llm.baseUrl,
          hasKey: Boolean(c.llm.apiKey),
        },
        image: { enabled: c.image != null, model: c.image?.model ?? null },
        tts: { engine: c.azureTts ? "azure" : c.piperUrl ? "piper" : "off" },
        srdPath: c.srdPath,
      },
    };
  }

  app.get("/api/admin/server-settings", async () => serverSettingsView(ctx.getConfig()));

  app.put<{ Body: Partial<NonNullable<Settings["server"]>> }>(
    "/api/admin/server-settings",
    async (req, reply) => {
      const body = req.body ?? {};
      const srv: NonNullable<Settings["server"]> = {};
      if (body.allowAnonymous !== undefined) srv.allowAnonymous = Boolean(body.allowAnonymous);
      if (body.registrationEnabled !== undefined)
        srv.registrationEnabled = Boolean(body.registrationEnabled);
      if (body.requireVerifiedEmail !== undefined)
        srv.requireVerifiedEmail = Boolean(body.requireVerifiedEmail);
      if (body.creditsEnabled !== undefined) srv.creditsEnabled = Boolean(body.creditsEnabled);
      if (body.pricing) {
        const p: NonNullable<NonNullable<Settings["server"]>["pricing"]> = {};
        const nonNeg = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0;
        for (const k of [
          "perMessage",
          "perCampaign",
          "perImage",
          "perThousandTtsChars",
          "perThousandPromptTokens",
          "perThousandCompletionTokens",
        ] as const) {
          const v = body.pricing[k];
          if (v !== undefined) {
            if (!nonNeg(v)) return reply.code(400).send({ error: "Ceník musí být nezáporné číslo." });
            p[k] = v;
          }
        }
        // Per-model message rates: a clean { modelId: number } map (#56f).
        if (body.pricing.perModelMessage !== undefined) {
          const raw = body.pricing.perModelMessage;
          if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
            return reply.code(400).send({ error: "Neplatný ceník modelů." });
          }
          const map: Record<string, number> = {};
          for (const [model, v] of Object.entries(raw)) {
            if (!nonNeg(v)) return reply.code(400).send({ error: "Ceník modelu musí být nezáporné číslo." });
            map[model] = v as number;
          }
          p.perModelMessage = map;
        }
        if (Object.keys(p).length > 0) srv.pricing = p;
      }
      if (Object.keys(srv).length === 0) {
        return reply.code(400).send({ error: "Žádná změna." });
      }
      await saveSettings(ctx.vaultPath, { server: srv });
      const c = await ctx.reloadConfig();
      ctx.audit.record(req.user!.id, "server.settings", null, JSON.stringify(srv));
      return reply.send(serverSettingsView(c));
    },
  );

  // --- Health / runtime (#57b) ---------------------------------------------
  app.get("/api/admin/health", async () => {
    const c = ctx.getConfig();
    const mem = process.memoryUsage();
    return {
      ok: true,
      startedAt: new Date(ctx.startedAtMs).toISOString(),
      uptimeSec: Math.floor((Date.now() - ctx.startedAtMs) / 1000),
      node: process.version,
      memory: { rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal },
      vaultPath: c.vaultPath,
      users: ctx.users.list().length,
      activeSessions: ctx.sessions.countActive(),
      auth: {
        allowAnonymous: c.auth.allowAnonymous,
        registrationEnabled: c.auth.registrationEnabled,
        requireVerifiedEmail: c.auth.requireVerifiedEmail,
        smtp: c.auth.smtp != null,
        publicUrl: c.auth.publicUrl,
      },
      credits: { enabled: c.credits.enabled, pricing: c.credits.pricing },
      providers: serverSettingsView(c).providers,
    };
  });

  // --- Usage / cost overview (#57b) ----------------------------------------
  app.get("/api/admin/usage", async () => {
    const summary = ctx.credits.usageSummary();
    const byUser = summary.byUser.map((u) => ({
      ...u,
      email: ctx.users.findById(u.userId)?.email ?? null,
    }));
    return { ...summary, byUser, creditsEnabled: ctx.getConfig().credits.enabled };
  });

  // --- Cross-tenant campaign / vault management (#57b) ---------------------
  app.get("/api/admin/vaults", async () => {
    const campaigns = await listAllCampaigns(ctx.vaultPath);
    const enriched = campaigns.map((c) => ({
      ...c,
      ownerEmail: c.scope === "__shared__" ? null : ctx.users.findById(c.scope)?.email ?? null,
    }));
    return { campaigns: enriched };
  });

  app.get<{ Params: { scope: string; folder: string } }>(
    "/api/admin/vaults/:scope/campaigns/:folder/export",
    async (req, reply) => {
      const dir = await campaignDir(ctx.vaultPath, req.params.scope, req.params.folder);
      if (!dir) return reply.code(404).send({ error: "Kampaň nenalezena." });
      const buf = await zipDir(dir);
      return reply
        .header("content-type", "application/zip")
        .header("content-disposition", `attachment; filename="${req.params.folder}.zip"`)
        .send(buf);
    },
  );

  app.delete<{ Params: { scope: string; folder: string } }>(
    "/api/admin/vaults/:scope/campaigns/:folder",
    async (req, reply) => {
      const dir = await campaignDir(ctx.vaultPath, req.params.scope, req.params.folder);
      if (!dir) return reply.code(404).send({ error: "Kampaň nenalezena." });
      await deleteCampaign(dir);
      ctx.audit.record(req.user!.id, "vault.campaign.delete", null, `${req.params.scope}/${req.params.folder}`);
      return reply.send({ ok: true });
    },
  );

  // --- Whole-vault backups (#57b), stored in the vault → redeploy-persistent -
  app.get("/api/admin/backups", async () => ({ backups: await listBackups(ctx.vaultPath) }));

  app.post("/api/admin/backups", async (req, reply) => {
    const info = await createBackup(ctx.vaultPath, now());
    ctx.audit.record(req.user!.id, "backup.create", null, info.name);
    return reply.send(info);
  });

  app.get<{ Params: { name: string } }>("/api/admin/backups/:name", async (req, reply) => {
    const p = backupPath(ctx.vaultPath, req.params.name);
    if (!p) return reply.code(400).send({ error: "Neplatný název zálohy." });
    let buf: Buffer;
    try {
      buf = await fs.readFile(p);
    } catch {
      return reply.code(404).send({ error: "Záloha nenalezena." });
    }
    return reply
      .header("content-type", "application/zip")
      .header("content-disposition", `attachment; filename="${req.params.name}"`)
      .send(buf);
  });

  app.delete<{ Params: { name: string } }>("/api/admin/backups/:name", async (req, reply) => {
    const ok = await deleteBackup(ctx.vaultPath, req.params.name);
    if (!ok) return reply.code(404).send({ error: "Záloha nenalezena." });
    ctx.audit.record(req.user!.id, "backup.delete", null, req.params.name);
    return reply.send({ ok: true });
  });
}
