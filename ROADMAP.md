# Roadmap — AI Dungeon Master

Self-hosted, AI-driven Dungeon Master for D&D 5e (SRD 5.1). This file tracks
what's **next** at the top and keeps a condensed **changelog** of shipped work
below. Source of the original backlog: live playtest feedback (2026-06-22 /
2026-06-24). File pointers are starting points, not the whole change.

> **What already works well (keep):** the deterministic engine, the visible
> dice log, and the AI DM loop.

---

## ⚠️ Operational note — deployment may run a stale image

Some "missing feature" reports (no Settings panel, no voice config, image-gen
button missing) describe features that **already exist in the latest image**
(PR #5 / #6). If the NAS runs an older `ghcr.io/ondreu/ai-dungeon-master`,
none appear. **Before triaging any UI item, confirm the running image is
current** (`docs/SHOWCASE.md` → "Deploying & updating"). Verify in-container:
`apps/server/dist/index.js` should contain `Vault has no campaigns`; if not, the
box is on old code and items like #15/#17/#18 are likely already fixed by
updating.

---

# Open work — what's next

**Stav (2026-06-25):** Účty/kredity/admin jsou z velké části hotové a nasazené —
**#55a–#55e** (registrace, ověření e-mailu, login + httpOnly session, reset hesla,
napojený `LoginScreen`), **#55f část 1** (autentizace + gating endpointů),
**#56** (kreditní ledger, metering LLM/obrázků/TTS, vynucení limitu 402, admin
granty, záložka *Kredity*, ukazatel v hlavičce — chybí jen platby/Stripe),
**#57** (admin role + bootstrap, správa uživatelů, audit log, `/admin` panel) a
**#58a** (nastavení účtu). Vše s testy (`apps/server/test/`).

**Zbývá — jeden velký track + drobnosti:**
1. **#48 — i18n** (P1): infrastruktura lokalizace v `@adm/schemas` (`cs`/`en`,
   runtime přepínání) **hotová (#48a)**; zbývá zapojit tři přepínače do UI/promptu
   (#48b/#48c/#48d) a Settings (#48e). Aditivní a nezávislé, nízké riziko.
2. Drobnosti: **#58b/#58c** (per-user preference + rozdělení global vs user
   settings), zbytek **#57b** (už jen prohlížeč serverových logů — globální
   settings, správa kampaní/vaultů, health i zálohy hotové), platby (#56d),
   **#45** partials (obsah — dělá autor).

> **#55f část 2 — izolace dat per uživatel: HOTOVO** (`session/registry.ts`,
> `vault/migrate-user.ts`, `test/isolation.test.ts`). Single-tenant
> self-hosted běží beze změny; hosted dává každému uživateli vlastní
> `<vault>/users/<id>/`. Možné navázat: eviction scopů bez živých SSE
> (`EventBus.listenerCount` už existuje), GDPR úklid vault dat při mazání účtu.

## P0 — Účty, kredity a provoz (nový směr, 2026-06-24)

> **Status: z velké části IMPLEMENTOVÁNO** (viz „Stav" výše a `[x]` níže);
> izolace dat (#55f-2) hotová, zbývají už jen platby (#56d). Posouvá
> appku z dnešního **single-tenant self-hosted** modelu (jeden vault, jeden
> Basic-Auth zámek, klíče vlastní provozovatel) k provozu, kde má **více
> uživatelů vlastní účet, data a kredity**. `LoginScreen` a záložky
> *Účet*/*Kredity* v `SettingsModal` už existují jako UI stuby — chybí backend.

### ✅ Rozhodnutí (2026-06-24)

1. **Plný multi-tenant jako placená služba.** Každý uživatel má **vlastní
   izolovaná data** (kampaně, postavy, sezení). Kredity jsou **reálná měna**:
   cena = náklad na tokeny (LLM/obrázky/TTS) + **přirážka**.
2. **Dvě edice ze stejného kódu:**
   - **Hosted (provozuje autor):** uživatel **nezadává vlastní API klíč** — jen
     kupuje kredity. Klíče vlastní provozovatel, účtuje cost + markup.
   - **Self-hosted:** uživatel si **přinese vlastní klíče (BYO)**. Volitelně může
     zapnout kredity + přirážku na pokrytí serveru (stejný billing modul) —
     proto musí být metering/billing (#56) **modulární**, ne hardcoded jen pro
     hosted.
3. **Self-hosted single-user/BYO režim zůstává plně podporovaný**, gated flagem
   (`AUTH_MODE`/edice). Stávající NAS nasazení (#50) musí jet beze změny
   s vypnutými účty.

Důsledek: izolace dat (#55f) a metering (#56) jsou **povinné MVP** hosted edice,
ne „nice to have".

### #55 — Email registrace + autentizace

- **[x] #55a — Datová vrstva uživatelů.** SQLite ve vaultu (`<vault>/db/app.db`)
  přes vestavěný `node:sqlite` (Node 22+, žádná nativní závislost); idempotentní
  migrace dle `user_version`. Tabulka `users` (id, email, `password_hash`,
  `display_name`, `email_verified`, role, `created_at`) + `UserStore`
  (create/find/update/list/delete) a hashování hesla přes `crypto.scrypt`
  (self-describing formát, snadná migrace na argon2). `apps/server/src/db/`,
  `apps/server/src/auth/{users,password}.ts`, test `test/users.test.ts`. Pozn.:
  baseline Node zvednut 20→22.
- **[x] #55b — Registrace + ověření emailu.** `POST /api/auth/register`
  (validace e-mailu + síly hesla, scrypt hash), `POST
  /api/auth/resend-verification` (neutrální odpověď proti enumeraci) a `GET
  /api/auth/verify?token=` (HTML potvrzení). Ověřovací odkaz = HMAC podepsaný
  token s expirací (`auth/tokens.ts`, sdílí #55d), tajemství z `AUTH_SECRET`
  nebo persistované v `<vault>/db/auth-secret`. Odesílání e-mailů přes
  `EmailSender` — default loguje odkaz, SMTP přes `nodemailer` (lazy) když je
  `SMTP_HOST` nastaven. `apps/server/src/auth/{service,tokens,validation,email}.ts`,
  `routes/auth.ts`, test `test/auth.test.ts`.
- **[x] #55c — Login + session.** `POST /api/auth/login` ověří heslo
  (timing-uniform proti enumeraci), vyžaduje ověřený e-mail (vypínatelné
  `requireVerifiedEmail`) a otevře **server-side session** (tabulka `sessions`,
  v2 migrace) → opaque id v **httpOnly** cookie (`adm_session`, SameSite=Lax,
  Secure dle HTTPS). `POST /api/auth/logout` (invaliduje session), `GET
  /api/auth/me`. Server-side úložiště = reálný logout/revokace (vs. JWT).
  `auth/sessions.ts`, `@fastify/cookie`. `config.basicAuth` zůstává op-only
  zámek. Testy v `test/auth.test.ts`.
- **[x] #55d — Reset hesla.** `POST /api/auth/forgot` (neutrální odpověď) pošle
  e-mail s reset tokenem (purpose `reset-password`, krátká expirace);
  `POST /api/auth/reset {token,password}` ověří token + sílu hesla, přehashuje,
  invaliduje VŠECHNY session uživatele a zároveň označí e-mail jako ověřený.
  Emailový odkaz cílí na `GET /api/auth/reset?token=` — self-contained HTML
  formulář, takže reset funguje i bez front-endu (#55e). Sdílí token/email
  infra s #55b. Testy v `test/auth.test.ts`.
- **[x] #55e — Napojit `LoginScreen`.** Stub `onContinue()` nahrazen reálnými
  voláními přes klienta `apps/web/src/auth.ts` (login/register/forgot/resend,
  `credentials: same-origin`). `LoginScreen` má režimy login/registrace/
  zapomenuté heslo, chybové i potvrzovací stavy a nabídku znovu poslat ověření
  při 403. `App.tsx` při startu ověří session (`GET /api/auth/me`) a načte
  `GET /api/auth/config` → „pokračovat bez přihlášení" a odkaz na registraci se
  zobrazí jen podle serverových flagů (`allowAnonymous`/`registrationEnabled`,
  env `AUTH_ALLOW_ANONYMOUS`/`AUTH_REGISTRATION`).
- **[x] #55f — Autorizace na endpointech.** **Část 1 — autentizace:**
  `auth/middleware.ts` resolvuje session usera na `req.user` na každém requestu
  a — když je `allowAnonymous=false` (hosted) — blokuje chráněné `/api` routy
  bez session (401). Veřejné: `/api/auth/*`, `/api/health`, statika.
  Integrační testy (`test/auth-guard.test.ts`).
  **Část 2 — izolace dat (hotovo):** `session/registry.ts` (`SessionRegistry`/
  `UserSession`) resolvuje *scope* per request — sdílený vault když je
  `allowAnonymous=true` (self-hosted, beze změny), jinak vlastní podstrom
  `<vault>/users/<id>/` (kampaně, světy, sezení, vlastní `EventBus`). Manager
  se otevírá líně a memoizovaně (race-safe; concurrent first-touch sdílí jednu
  inicializaci), nový uživatel dostane seed kampaň. `routes/game.ts` čte
  `sess.manager`/`sess.bus`; cesty ke kampaním/světům jdou přes
  `sess.scopedPath` (confinement = hranice tenanta). Výběr kampaně je per-user
  (`<vault>/users/<id>/settings.json`), provider/SRD creds zůstávají globální.
  Migrace stávajícího vaultu na bootstrap admina (`ADMIN_EMAIL`) je
  marker-latchovaná a idempotentní (`vault/migrate-user.ts`). Testy
  `test/isolation.test.ts` (hranice izolace, parita sdíleného režimu, race,
  seed, migrace, přežití SSE busu přes reopen).

### #56 — Uživatelské kredity / metering

- **[x] #56a — Kreditní účet + transakce.** Append-only `credit_ledger`
  (user_id, delta, reason, ref, timestamp; v4 migrace, FK cascade) + `CreditStore`
  (`grant`/`charge`/`balance`/`history`). Zůstatek = `SUM(delta)`; delty jsou
  celá čísla v nejmenší jednotce (bez floatů). `credits/ledger.ts`, test
  `test/credits.test.ts`.
- **[x] #56b — Měření spotřeby.** LLM: `MeteredLlm` obalí vypravěče a sečte
  `usage` z odpovědí poskytovatele přes všechna kola tool-loopu (stream i
  ne-stream; u streamu `stream_options.include_usage`); cena = tokeny/1000 ×
  sazba (input/output). Obrázky: paušál `CREDITS_PER_IMAGE` po úspěšném
  vygenerování (`/api/image`). TTS: `CREDITS_PER_1K_TTS_CHARS` × délka textu
  (`/api/tts`; preview zdarma). Strhává se **až po úspěchu** (chyba = nestrhne)
  → mimo engine, determinismus (#12) nedotčen. Gated `CREDITS_ENABLED` (default
  off). `credits/metering.ts`, `llm/client.ts`.
- **[x] #56c — Vynucení limitu.** Před tahem (`/api/action`, `/api/regenerate`,
  intro, recap) se kontroluje zůstatek; při ≤0 čistý **402** do UI. Následné
  LLM (arrival/AI tahy po engine příkazu) se metrují bez tvrdého stopu —
  enforcement je na hranici hráčova tahu. Tvrdý stop (ne mock).
- **[x] #56d — Dobíjení.** Admin grant: `POST /api/admin/users/:id/credits`
  (kladně přidá, záporně odečte; audit). Zůstatek je vidět v admin seznamu
  uživatelů. Platební brána (Stripe) až později.
- **[x] #56e — UI.** Záložka *Kredity* (`CreditsPanel`: zůstatek + historie
  pohybů; anonym vidí vysvětlení) přes `GET /api/credits`. Ukazatel zůstatku
  v hlavičce (`CreditBadge`, jen hosted + přihlášený, polluje). Admin má
  per-uživatele tlačítko „kredity". Zbývá jen „koupit" (čeká na platby/Stripe).
- **[x] #56f — AI management & ceník per model / per akce.** Účtování přepnuto
  z tokenového na **per akci**: plochá cena **za zprávu** (jeden LLM tah), klíčovaná
  modelem (`pricing.perModelMessage[model]` s fallbackem `perMessage`), plus plochá
  cena **za obrázek** a **za generování kampaně** (`perCampaign`). Generování kampaně
  (`forgeCampaign`) je nově metrované a gated (dřív zdarma). Tokenové sazby zůstaly
  jako **cost-basis** (loguje se na tah), neúčtují se. Účtuje se jen hráčův tah
  (`llm-turn`/`llm-regenerate`); systémové beaty (intro/recap/arrival/AI tahy) běží
  bez per-message poplatku. Vše perzistované ve `Settings.server.pricing` a živé přes
  config holder. Dev panel: sekce *AI & ceník (per akce)* — výchozí cena/zpráva,
  cena/kampaň, cena/obrázek, **tabulka per-model** (primární + `altModels` z
  `GET /api/admin/server-settings`.models), TTS + token cost-basis pod „details".
  Testy: `credits.test.ts` (`creditsPerMessage`), `admin.test.ts` (perzistence
  per-model ceníku + validace). Zbývá (volitelně): per-model i pro obrázky/TTS,
  reálný $ přepočet cost vs markup v přehledu spotřeby.
- **[x] #56g — Model pool.** Provozovatelský seznam vybíratelných modelů
  (`Settings.server.modelPool`, `Config.modelPool`): jméno, OpenRouter slug,
  kredit cena/zpráva a ukazatele **inteligence** + **cena** stylem hvězd (★ 1–5).
  Vše přes jednu OpenRouter chat-completions URL — liší se jen slug. Pool je
  autoritativní zdroj per-model cen: `applySettings` jeho `perMessage` promítá do
  `pricing.perModelMessage`, takže účtování (`creditsPerMessage`) zůstává beze
  změny. Admin: sekce *Model pool* (řádkový editor s klikacími hvězdami),
  `GET/PUT /api/admin/server-settings`.modelPool. Hráč: přepínač „Jiným modelem"
  ukazuje jména + ★ z `/api/state`.models.pool. Testy: `admin.test.ts`
  (perzistence + clamp hvězd + validace slugu). Doporučený ceník (mix 70/30
  průzkum/boj, ~3× marže): flash 20, pro 65, qwen 70, gemini 300, sonnet 450 kr.
  **Nově — hráčův výběr modelu:** každý uživatel si v *Nastavení → AI Dungeon
  Master* zvolí, kterým modelem z poolu hraje (per-user `Settings.selectedModel`,
  uložené ve vlastním `settings.json`; UI ukazuje jen jméno + kredity + ★, ne
  slug). Volba pohání `/api/action` i default `/api/regenerate` a klíčuje účtování
  (`perModelMessage`). Validováno proti aktuálnímu poolu (stará/odebraná volba →
  fallback na default). Test `settings-gate.test.ts`. Admin spravuje jen pool.
- **[x] #56h — Uvítací kredity.** Nový účet dostane jednorázový bonus
  (`config.credits.signupBonus`, env `CREDITS_SIGNUP_BONUS`, default **500**) při
  *prvním* ověření e-mailu — idempotentně přes ledger reason `signup-bonus`
  (`AuthService.onEmailVerified` → `CreditStore.hasReason`/`grant`), jen když jsou
  kredity zapnuté (hosted). Upozornění v záložce *Kredity* (`/api/credits`
  vrací `signupBonus`). Test `auth.test.ts`.

### #57 — Dev / admin panel

- **[x] #57a — Role + ochrana.** Role `admin` na uživateli; prefix `/api/admin`
  hlídá auth guard (401 bez session, 403 bez admin role) nezávisle na
  `allowAnonymous`. Admin se bootstrapuje z `ADMIN_EMAIL` — registrace s tímto
  e-mailem rovnou dostane roli admin a `ensureAdmin()` při startu povýší už
  existující účet. `routes/admin.ts`, `auth/middleware.ts`. Testy v
  `auth-guard.test.ts` + `auth.test.ts`.
- **[~] #57b — Rozsah.** Hotovo: seznam uživatelů + overview počty; mutace
  `PUT /api/admin/users/:id/role`, `…/verify`, `DELETE …/:id` (ban — smaže i
  session), s pojistkami proti self-demote/self-delete; `GET /api/admin/audit`;
  ruční úprava kreditů (#56d). **Nově (dev panel):** globální server settings
  (`GET/PUT /api/admin/server-settings` — auth flagy + zapnutí kreditů + ceník,
  perzistované do vault `settings.json` přes `Settings.server` a aplikované živě
  sdíleným config holderem v `index.ts`); přehled spotřeby/nákladů
  (`GET /api/admin/usage` ← `CreditStore.usageSummary`); správa kampaní/vaultů
  napříč tenanty (`GET /api/admin/vaults`, export-zip, delete; confinement); běh
  serveru (`GET /api/admin/health` — uptime, paměť, sezení, poskytovatelé);
  zálohy celého vaultu (`POST/GET/DELETE /api/admin/backups`, ZIP uložený do
  `<vault>/backups/` → přežije nasazení). UI: `AdminPage` rozdělená do záložek.
  Zbývá: prohlížeč serverových logů (nad rámec audit logu).
- **[x] #57c — Audit log.** Append-only tabulka `audit_log` (v3 migrace) +
  `AuditStore`; každá admin mutace (role/verify/delete) zapíše záznam s actorem,
  cílem a detailem. `auth/audit.ts`. Testy v `admin.test.ts`.
- **[x] #57d — UI.** Samostatná stránka `AdminPage` na `/admin` (App ji vykreslí
  podle `location.pathname`; bez client routeru). Gated server-side — `/api/admin/*`
  vrací 403 ne-adminům, takže ne-admin vidí „přístup odepřen". Tabulka uživatelů
  (změna role / ověření / smazání), overview počty a audit log. Admin má odkaz
  na panel v záložce *Účet*.

### #58 — Nastavení účtu pro uživatele

- **[x] #58a — Záložka *Účet*.** Backend: `PUT /api/account/{profile,email,
  password}` + `DELETE /api/account` (vše vyžaduje session). Změna e-mailu resetuje
  ověření a pošle nový ověřovací odkaz; změna hesla ověří současné a invaliduje
  všechny session (současné zařízení dostane nové cookie); smazání = sessions +
  user řádek (úklid vault dat čeká na izolaci #55f-2). Front-end: `AccountPanel`
  v `SettingsModal` (jméno/e-mail/heslo/odhlášení/smazání), anonymní režim ukáže
  „nepřihlášen". Testy v `test/auth.test.ts`.
- **[~] #58b — Per-uživatel preference.** Voice/jazyk (#48) vázané na účet —
  zbývá. **Hotovo (provider-klíče op-only):** globální provider/SRD creds
  (LLM/obrázky/Azure TTS) se v hosted edici (`allowAnonymous=false`) dají měnit
  jen rolí admin — `PUT /api/settings` vrací 403 ne-adminům, GET vystavuje
  `canEditProviders`. Editace přesunuta do `/admin` → *Server* → Poskytovatelé
  (`ProviderSettings`); ozubené kolo provider-pole ne-adminům skryje a odkáže na
  admin panel. Self-hosted (anonymní) zůstává otevřený. `.env` provider proměnné
  jsou už jen volitelný bootstrap (konfigurace v aplikaci, persistence ve vaultu).
  Testy `test/settings-gate.test.ts`.
- **#58c — Oddělit globální vs. uživatelská nastavení.** Refaktor `settings.ts`:
  server-config (admin #57) vs. per-user-config (#58); single-user self-hosted =
  obojí splývá.

### #59 — Bezpečnost & hardening (dev panel / multi-tenant)

Vyvstalo při stavbě dev panelu (#57b). Privilegovaná, mutující plocha + reálné
kredity = bezpečnost přestává být „nice to have". **Stav:** všechny položky
(#59a–#59h) jsou hotové; zbývá už jen souhlas/consent u GDPR (#59e) a
volitelný self-hosted CAPTCHA fallback bez třetí strany (Altcha PoW, #59b).

- **[x] #59a — CSRF.** Hotovo: `registerCsrfGuard`
  (`apps/server/src/auth/middleware.ts`) vyžaduje vlastní hlavičku
  (`X-Requested-With`) na každém mutujícím `/api` požadavku — forged cross-site
  `POST` ji bez CORS preflightu nenastaví. Klient ji přidává centrálně přes patch
  `window.fetch` (`apps/web/src/csrf.ts`); server-rendered reset formulář ji
  posílá taky.
- **[x] #59b — Rate-limit & brute-force.** Hotovo: per-IP fixed-window limiter
  (`apps/server/src/auth/rate-limit.ts`) na `/api/auth/login` a
  `/api/auth/register`, konfigurovatelný přes `AUTH_*_RATE_*`; úspěšné přihlášení
  vynuluje okno dané IP. **CAPTCHA hotová:** Cloudflare Turnstile na login +
  registraci (`auth/turnstile.ts`, `makeTurnstileVerifier`), aktivní jen když je
  nastaven keypair `TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET_KEY` (jinak beze změny
  — self-hosted/BYO bez widgetu). Server ověřuje token přes Cloudflare siteverify
  s IP klienta (fail-closed), site key se vystavuje v `/api/auth/config`; klient
  renderuje widget explicitně (`TurnstileWidget.tsx`) a posílá `turnstileToken`.
  Testy `test/turnstile.test.ts`. Zvážit self-hosted PoW fallback (Altcha) —
  viz pozn. níže.
- **[x] #59c — Hardening záloh (#57b).** Hotovo: (1) Konzistence — před zipem
  `PRAGMA wal_checkpoint(TRUNCATE)` (`checkpointDatabase`). (2) Paměť — `zipDirToFile`
  streamuje archiv po jednom souboru na disk místo plnění `Buffer`u. (3) Retence —
  `BACKUP_RETENTION` (default 10), starší se po každé záloze prořežou
  (`pruneBackups`). (4) Hlídaný restore — `stageRestore` validuje archiv a uloží
  ho jako marker; `applyPendingRestore` ho při příštím startu (před otevřením DB)
  atomicky prohodí (`POST /api/admin/backups/:name/restore` i upload
  `POST /api/admin/restore`). (5) Zálohy se píší s právy `0o600` (obsahují hashe
  hesel).
- **[x] #59d — Mazání otevřené kampaně.** Hotovo: po `DELETE /api/admin/vaults/...`
  se volá `SessionRegistry.invalidateScope` (emit `reload` připojeným klientům +
  zahození cachovaného scope), takže další tah scope znovu otevře místo běhu nad
  smazanou složkou.
- **[~] #59e — GDPR mazání dat.** Hotovo: `DELETE /api/account` teď kromě řádku
  uživatele a session maže i jeho izolovaný podstrom `<vault>/users/<id>/`
  (`deleteUserVault`, `admin/ops.ts`) a evikuje cachovaný scope
  (`SessionRegistry.evict`). **Totéž napojeno i na admin smazání uživatele**
  (`DELETE /api/admin/users/:id` → `onUserDeleted` → stejná `purgeUserScope`),
  takže ban smaže i data, ne jen řádek. **Export dat hotový:**
  `GET /api/account/export` stáhne ZIP s `account.json` (účet + kredity vč.
  historie) a celým izolovaným podstromem `<vault>/users/<id>/` pod `vault/`
  (`exportUserData`, `admin/ops.ts`; sdílený ZIP writer `zipFiles`). UI: sekce
  *Moje data* v záložce *Účet* (`AccountPanel`). Zbývá: souhlas (consent).
- **[x] #59f — Živý přepínač `allowAnonymous`.** Hotovo obojí: `SessionRegistry`
  latchuje routing izolace dat z boot configu (přepne se až po restartu, ne
  uprostřed sezení); admin panel varuje (`allowAnonymousPendingRestart`), když se
  živá hodnota odchýlí od boot snapshotu. Auth gate (vyžadovat přihlášení) se mění
  živě dál.
- **[x] #59g — Prohlížeč serverových logů.** Hotovo: `LogBuffer` teeuje pino
  výstup do ohraničeného ring bufferu (stdout zůstává), `GET /api/admin/logs`
  vrací tail a panel má záložku „Logy".
- **[x] #59h — Stránkování.** Hotovo serverově: `users`/`audit`/`usage`/`vaults`
  berou `?limit&offset` (cap 500, default 200) a vrací `total`; `UserStore.list`
  i `AuditStore.list` mají SQL LIMIT/OFFSET. **UI dokončeno:** sdílená komponenta
  `Pager` (další/předchozí + „X–Y z N") na záložkách Uživatelé, Audit, Kampaně i
  Spotřeba (klient posílá `?limit&offset`, `PAGE_SIZE` 50). `AdminPage.tsx`.

### Co snadno zapomeneme

- **Bezpečnost:** viz **#59** — rate-limit + CAPTCHA (Turnstile), CSRF, ochrana
  cizích kreditů, secret management. Zvážit Altcha (PoW) jako self-hosted CAPTCHA
  fallback bez závislosti na Cloudflare.
- **Email infra:** dnes nulová — SMTP nebo služba (Resend/SES) + setup docs.
- **GDPR:** mazání účtu i admin ban smažou vault data; export hotový
  (`/api/account/export`); zbývá souhlas (české UI → EU).
- **Migrace dat:** dnešní vault nemá majitele — přiřadit „adminovi" nebo nechat
  self-hosted bez vlastnictví.
- **Souběh:** `SessionManager` dnes předpokládá jeden aktivní vault/kampaň —
  multi-tenant chce session/kampaň per uživatel (#55f).
- **Ceník:** reálné kredity = skutečný cost tokenů + přirážka, jinak prodělek.

## P1 — Vícejazyčná podpora / i18n (#48)

Přidat angličtinu vedle češtiny + infrastrukturu pro další jazyky. Tři nezávislé
přepínače:

- **[x] #48a — Infrastruktura.** Lokalizace v `packages/schemas/src/i18n/`:
  `types.ts` (`Locale` `cs`/`en`, tři přepínače `LocaleSettings` ui/terms/stats,
  `LabelBundle`), `cs.ts` (reusuje stávající `*_CS` mapy z `labels.ts` jako
  source-of-truth), `en.ts` (anglické labely + popisy; dlouhý ocas jmen kouzel/
  předmětů se prettify-uje z id). `index.ts` má **čisté** resolvery
  (`localizeX(id, locale)`) + `makeLocalizer(settings)`, který routuje kategorie
  na správný přepínač (terminologie→`terms`, vlastnosti→`stats`, UI+popisy→`ui`).
  Bez globálního stavu → bezpečné pro multi-tenant server (#55f); živý stav drží
  web a předává ho dovnitř (#48e). Stávající `csXxx`/`*_CS` zůstávají beze změny.
  Testy `test/i18n.test.ts` (parita cs s legacy mapami, pokrytí enumů v obou
  jazycích, fallbacky, routování přepínačů).
- **#48b — Přepínač #1: obecné UI.** DM narace (systémový prompt), UI labely,
  tooltipy. TTS se řídí tímto přepínačem (DM mluví zvoleným jazykem).
- **#48c — Přepínač #2: herní terminologie.** Názvy kouzel/feats/skills/podmínek
  odděleně — hráč může mít UI česky, kouzla anglicky.
- **#48d — Přepínač #3: staty.** Vlastnosti a zkratky (Síla / Strength / STR /
  SIL) odděleně.
- **#48e — Nastavení.** Tři přepínače v Settings; uložené do localStorage +
  session; DM prompt se přizpůsobí přepínači #1.

## P2 — Partials (rozdělané, ke zbytkům)

Z #45 (kopie SRD databází + český překlad). Infrastruktura hotová, zbývá obsah:

- **[~] #45a — Bundled SRD kopie.** Drátování hotové; chybí **commitnout JSON
  soubory** (dělá autor) do `packages/srd/data/` (`5e-SRD-<Category>.json`).
  Server ji bere jako default cestu (`bundledSrdDir`) bez `SRD_PATH`; Docker
  image nasází do `/data/srd`.
- **[~] #45b — Český překlad názvů.** Hotovo: `SPELL_NAME_CS` (všechny triky +
  kouzla 1. úrovně, 73) a `ITEM_NAME_CS` (zbraně 37 + zbroje 13 + výbava) v
  `labels.ts`; server přidává `nameCs`, web preferuje. **Zbývá dlouhý ocas:**
  kouzla 2.+ úrovně, magické předměty.
- **[~] #45c — Build-time extrakce popisů.** Hotovo: `SPELL_SCHOOL_DESC_CS`,
  `SKILL_DESC_CS` + dřívější popisy z #21. Případné doplňky podle potřeby.

---

# Shipped — changelog

Condensed; each line keeps the issue #, a one-line summary, and the key file(s).
Full historical write-ups are in git history.

## Core playability & determinism (P0)

- **[x] #6** — Maps render: Leaflet overworld + tactical grid. `OverworldMap.tsx`,
  `TacticalGrid.tsx`.
- **[x] #8** — Wizard spells visible/castable as buttons under slots.
  `SheetPanel.tsx` (validated by #29).
- **[x] #12** — Narration matches the mechanic that ran; hard DM-prompt rules; no
  silent substitution; friendly-fire blocked in-engine (`allow_friendly`).
  `combat.ts`, `tools.ts`, `llm/prompt.ts`.
- **[x] #16** — Combat shows every combatant's HP bar in initiative order.
  `TurnTracker.tsx`.
- **[x] #17** — Voice/TTS path works (Azure→Piper); needs key + current image, not
  code. `/api/tts`.
- **[x] #22** — Settings persist: server settings → `settings.json`, voice toggles
  → localStorage. `store.ts`.
- **[x] #23** — Characters can die: 3rd failed death save → `dead`, removed from
  initiative; solo-death game over + `GameOverModal`. `combat.ts`, `turns.ts`,
  `checkCampaignEnd`.
- **[x] #29** — Abilities validated against the sheet (cast refuses spells not
  known); HP only changes via heal/cast tools. `spells.ts`, `prompt.ts`.

## Correctness & UX (P1)

- **[x] #1** — Markdown rendered in chat via safe `<Markdown>`. `ChatPanel.tsx`.
- **[x] #2** — Start/home menu (`StartMenu`): settings, switch/create/forge,
  manage, rollback, play. `routes/game.ts`.
- **[x] #4** — English/2-letter shorthand removed; full Czech names + STR/DEX
  abbrev via `labels.ts` (`ABILITY_CS`, `csAbilityAbbr`).
- **[x] #9** — Acting character's name shown instead of "Hráč". `store.ts`.
- **[x] #10** — Action economy enforced (action/bonus/reaction/movement).
  `tools.ts`, `turns.ts`, `economy.test.ts`.
- **[x] #13** — Engine-driven leveling + level-up GUI (HP/ASI-or-feat/subclass/
  spells). `engine/leveling.ts`, `LevelUpModal`.
- **[x] #14** — Guided character creation (race→class→scores→skills→spells),
  SRD-enriched. `vault/creation.ts`.
- **[x] #15** — Image-gen made discoverable (camera toolbar buttons).
  `ChatPanel.tsx`, `SheetPanel.tsx`.
- **[x] #24** — Time passes on travel/rest/downtime via `advanceTime` +
  `time_advance` tool. `engine/time.ts`.
- **[x] #25** — Distinct icons for Vrátit tah (undo) vs Shrnutí (document).
  `Icon.tsx`.
- **[x] #26** — Journal renders Markdown via shared `<Markdown>`. `DiaryModal.tsx`.
- **[x] #27** — TTS strips Markdown before speaking (`stripMarkdown`). `store.ts`.
- **[N/A] #28** — Visualization context-menu z-index: no such menu exists (plain
  toolbar button → full-screen modal). Revisit if a `ContextMenu` is added.
- **[x] #30** — Extended voice controls: mid-sentence stop + auto/Azure/Piper
  toggle. `store.ts`, `ChatPanel.tsx`.
- **[x] #38** — Target picker (list + free-text + click-to-target on the map).
  `TargetPicker.tsx`, `TacticalGrid.tsx`.

## Polish & feel (P2)

- **[x] #3** — Dark-fantasy micro-interactions, gated behind
  `prefers-reduced-motion`. `theme/tokens.css`.
- **[N/A] #5** — Bigger showcase vault — dropped (out of focus); build guide stays
  in `docs/SHOWCASE.md`.
- **[x] #6b** — Hex grid for the tactical map (opt-in via `grid.shape`).
  `engine/grid.ts`, `TacticalGrid`.
- **[N/A] #7** — Font legibility — dropped (out of focus).
- **[x] #11** — Resizable play-surface panels with persisted widths.
  `PlaySurface.tsx`.
- **[x] #31** — DM campaign intro / "how to begin" beat. `prompt.ts`
  (`CAMPAIGN_START`), `loop.ts` (`runIntro`).
- **[x] #32** — Streaming narration over SSE (`narration_delta`); tool-call rounds
  retract preamble. `LlmClient.chat` (`onDelta`), `executeToolLoop`, `store.ts`.
- **[x] #33** — Bigger ability-check chips with dice animation. `RollLine` in
  `ChatPanel.tsx`.
- **[x] #34** — Tappable condition chips with Czech rules text.
  `CONDITION_DESC_CS`, `SheetPanel.tsx`.
- **[x] #35** — Campaign management modal (list/export-zip/delete).
  `CampaignManager`, `vault/zip.ts`.
- **[x] #36** — Thematic gold-d20 favicon. `apps/web/public/favicon.svg`.
- **[x] #37** — AI-generated overworld map (manual trigger).
  `POST /api/campaigns/map`, `buildMapPrompt`.
- **[x] #39** — Roomier tactical board with zoom/pan + multi-cell creatures.
  `TacticalGrid`, `start_combat`.
- **[x] #47** — UI layout reworked to user sketches: left-nav home, docked combat,
  party tab strip, message-action menus. `StartMenu.tsx`, `PlaySurface.tsx`,
  `PartyPanel.tsx`, `ChatPanel.tsx`, `SettingsModal.tsx` (#47a/#47b).
- **[x] #51 (dice log)** — Removed the disruptive standalone "Deník kostek" side
  panel; inline roll cards (#33) stay. `DiceLog.tsx` removed.

## Travel & arrivals (#41)

- **[x] #41a** — Travel advances authored edge duration into `advanceTime`.
  `/api/command`.
- **[x] #41b** — Atmospheric arrival narration. `runArrival`, `ARRIVAL_BEAT`.
- **[x] #41c** — Encounter launcher restyled as "Hrozby v okolí". `MapPanel.tsx`.

## SRD tooltips / hover cards (#42)

- **[x] #42a** — Lazy spell hover card. `SpellCard` in `InfoCard.tsx`.
- **[x] #42b** — Carry missing spell fields (higher_level, casting_time, …).
  `mapSpell`, `SrdSpell`.
- **[x] #42c** — Cards for feats/skills/features/conditions/items via shared
  portal `Tip`. `InfoCard.tsx`.
- **[N/A] #42d** — Spell/feature *names* stay English; only chrome is Czech.

## Sheet as the single action hub (#43)

- **[x] #43a** — Removed standalone "Akce" panel; folded into `SheetPanel.tsx`.
- **[x] #43b** — De-duplicated spells (shown once in consolidated Akce).
- **[x] #43c** — "Útoky" no longer lists armor (`ARMOR_RE`, `isWeaponId`).
- **[x] #43d** — Passive abilities no longer offered as castable.
- **[N/A] #43e** — Determinism unchanged (UI reorganization only).

## SRD subraces/subclasses + level-up (#44)

- **[x] #44a** — Subraces from the SRD in creation (bonuses + traits).
- **[x] #44b** — Subclasses (level-up + creation for cleric/sorcerer/warlock).
- **[x] #44c** — BG3-style level-up menu. `LevelUpModal.tsx`.

## SRD data & content

- **[x] #19** — Automatic quest tracking: `quest` entity, engine tools
  (`quest_start`/`_advance`/`_complete`/`_fail`), DM auto-detect, quest-log UI.
  `schemas/quest.ts`, `engine/quests.ts`, `QuestLogModal`.
- **[x] #20** — Consume the rest of the SRD dataset (races/classes/features/feats/
  magic-items/proficiencies), matching tightened to exact filenames; consumed by
  creation/leveling. `srd/load.ts`, `@adm/srd`.
- **[x] #21** — Mine descriptive SRD data into static Czech label maps + in-app
  rules reference. `labels.ts`, `ReferenceModal`.

## Living world (#49)

- **[x] #49a** — `worlds/<name>/` shared layer merged under campaigns.
  `vault/world.ts` (`loadWorld`).
- **[x] #49b** — `Faction`/`WorldEvent`/`Npc` schemas + session overlay.
  `schemas/faction.ts`.
- **[x] #49c** — Engine world tools (`faction_advance`/`faction_relation`/
  `world_event_trigger`/`location_danger`). `engine/world.ts`.
- **[x] #49d** — World-aware `/campaign` forge (`seedFromWorld`, `--world`).
  `vault/forge.ts`.
- Plus authored world **"Havraní marka"** (12 locations, 9 factions, 20 NPCs,
  4 world events) + campaigns `konvoj-do-vresoviste` and `stiny-vraniho-hradu`.

## Campaign generation (#46)

- **[x] #46a** — `/campaign` slash-command, 6-phase guided flow.
  `.claude/commands/campaign.md`.
- **[x] #46b** — In-app SSE forge. `POST /api/campaigns/forge/stream`,
  `ForgeCampaign`.
- **[x] #46c** — Standalone use (ADM project vs `./`).
- **[x] #46d** — Narrative consistency via phase-by-phase `WorldBible`.

## Deployment & playtest fixes

- **[x] #50** — Vault survives redeploy: named Docker volume `vault_data` +
  migration logic. `docker-compose.nas.yml`, `entrypoint.sh`.
- **[x] #51 (party)** — Party camp management: `session.camp`, `send_to_camp`/
  `recall_from_camp`, `PartyPanel`.
- **[x] #52** — Level only via XP: `levelUp` refuses without cumulative XP;
  `award_xp` auto-levels.
- **[x] #53** — Sandbox campaign toggle (`campaign.sandbox`) skips the main quest
  arc; open-ended DM mode.
- **[x] #54** — Per-message Regenerovat / Jiným modelem. `POST /api/regenerate`,
  `llm.altModels`.

## Combat feedback (2026-06-26 playtest)

Batch of combat-UX fixes from a live playtest of the solo encounter flow.

- **[x] #c1** — DM "thinking" persists per message (incl. across reload): the raw
  token stream is attached to the assistant chat message (`ChatMessage.thinking`)
  and shown in a collapsible *přemýšlení PJ* section. `loop.ts`, `session.ts`,
  `store.ts`, `ChatPanel.tsx`.
- **[x] #c2** — Cantrips split from slotted spells (distinct *Triky* group + tone).
  `ActionsPanel.tsx`.
- **[x] #c3** — Turn changes + fight start/end surfaced in chat as dividers;
  `next_turn` log states the turn end + who's next. `turns.ts`, `store.ts`,
  `ChatPanel.tsx`.
- **[x] #c4** — Spell targeting highlights in-range cells on the map (square+hex).
  `TacticalGrid.tsx`, `store.ts`.
- **[x] #c5** — Combat battlefield is DM-authored to match the encounter: the DM
  draws the map via `start_combat` — `grid` (size w×h, scale, square/hex shape)
  and `terrain` (walls/difficult/hazard/cover) — and places every token. Exposed
  `grid`/`terrain` in the tool's parameter schema (they validated but weren't
  advertised to the model) and made positioning mandatory in the prompt; engine
  auto-place is only a degenerate fallback. `tools.ts`, `llm/prompt.ts`.
- **[x] #c6** — Slain enemies leave the board (die at 0 HP); PCs/companions stay
  downed for death saves. `combat.ts`.
- **[x] #c7** — Player can't move a creature whose turn it isn't (map-move gated to
  the human-controlled active actor). `TacticalGrid.tsx`.
- **[x] #c8** — Engine rules on action validity, not the DM in prose; opening
  attack resolves before initiative; no out-of-range coord hints leak to chat; no
  turn-end "leftover budget" nagging. `combat.ts`, `llm/prompt.ts`.
- **[ ] #c9 — DM prompt refactor / control (follow-up).** The #c8 behaviours are
  prompt-driven, so they rely on the model obeying instructions. Track a refactor
  to make DM combat behaviour more *controlled* and ideally engine-enforced rather
  than prompt-enforced: e.g. drive turn flow from explicit UI/engine state instead
  of the model deciding, structurally prevent prose action-economy gatekeeping,
  and add regression coverage for the prompt rules (prompt is large — audit + slim
  + test). Prereq for trusting combat narration without manual oversight.

---

## Deliverables the user can provide

- **Showcase vault** — see `docs/SHOWCASE.md` for what to author, the folder/
  frontmatter structure, and where to get art/map assets.
- **D&D asset database (SRD)** — see `docs/SHOWCASE.md` → "SRD asset database"
  for the source repo, what to download, and where to mount it.
