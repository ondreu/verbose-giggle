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

Recommended order (decisions in #55–58 are already made):
**#55 auth + per-user data isolation → #58 account settings → #57 admin panel →
#56 credits/metering → payments.** #48 (i18n) and the #45 partials are
independent and can land alongside.

## P0 — Účty, kredity a provoz (nový směr, 2026-06-24)

> **Status: design / brainstorm — nic z toho se zatím neimplementuje.** Posouvá
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

- **#55a — Datová vrstva uživatelů.** Lehká DB (SQLite ve vaultu — žádná nová
  infra, drží „file-first") s tabulkou `users` (id, email, `password_hash`
  argon2/bcrypt, `email_verified`, `created_at`, role).
- **#55b — Registrace + ověření emailu.** `POST /api/auth/register` (validace
  síly hesla, hash), ověřovací odkaz podepsaným tokenem s expirací. Vyžaduje
  **odesílání emailů** (SMTP — nová závislost).
- **#55c — Login + session.** `POST /api/auth/login` → **httpOnly cookie**
  (bezpečnější default proti XSS než JWT). `config.basicAuth` zůstane jako
  „op-only" zámek pro self-hosted.
- **#55d — Reset hesla.** `POST /api/auth/forgot` + `/reset` přes emailový token
  (sdílí infra s #55b).
- **#55e — Napojit `LoginScreen`.** Vyměnit `onContinue()` stub za reálná volání
  + error stavy; „pokračovat bez přihlášení" jen v self-hosted režimu.
- **#55f — Autorizace na endpointech.** Největší skrytá práce: protáhnout
  `userId` ze session do `SessionManager`/vaultu a izolovat kampaně per uživatel.
  Bez toho je registrace kosmetika.

### #56 — Uživatelské kredity / metering

- **#56a — Kreditní účet + transakce.** `credit_ledger` (user_id, delta, důvod,
  ref, timestamp) jako **append-only ledger**; zůstatek = součet.
- **#56b — Měření spotřeby.** Strhávat **per reálná spotřeba tokenů** (LLM/
  obrázek/TTS) = cost + markup; usage brát z odpovědi poskytovatele, ne odhad.
  **Pozor na determinismus (#12):** strhávání je vedlejší efekt mimo engine.
  Ošetřit selhání (nestrhávat za chybu) a streaming (#32 — účtovat po dokončení
  tahu). **BYO-key (self-hosted):** metering se přeskakuje; hosted BYO nepovolí.
- **#56c — Vynucení limitu.** Před drahou operací zkontrolovat zůstatek; při 0
  vrátit čistý 402 do UI (ne pád). Rozhodnout: tvrdý stop vs. mock narrator.
- **#56d — Dobíjení.** Začít **admin grantem** (#57); platební brána (Stripe)
  až později (vlastní compliance).
- **#56e — UI.** Naplnit záložku *Kredity* (zůstatek, historie, koupit) +
  ukazatel v hlavičce.

### #57 — Dev / admin panel

- **#57a — Role + ochrana.** `role: admin`; admin endpointy za zvláštní
  autorizací — bezpečnostně nejcitlivější část.
- **#57b — Rozsah.** Seznam uživatelů (verifikace/ban/reset), **ruční úprava
  kreditů**, přehled spotřeby/nákladů, globální server settings, správa
  kampaní/vaultů, logy, health.
- **#57c — Audit log.** Každá admin akce (grant, ban, změna settings) append-only.
- **#57d — UI.** Samostatná `/admin` routa (gated rolí) — čistší než rozšiřovat
  `SettingsModal`.

### #58 — Nastavení účtu pro uživatele

- **#58a — Záložka *Účet*.** Změna emailu (re-verifikace), hesla, jména, smazání
  účtu (GDPR), odhlášení.
- **#58b — Per-uživatel preference.** Voice/jazyk (#48) vázané na účet.
  Provider-klíče: v hosted edici jen globální (op-only); v self-hosted BYO. Účet
  v hosted edici **nesmí** nabízet pole pro vlastní API klíč.
- **#58c — Oddělit globální vs. uživatelská nastavení.** Refaktor `settings.ts`:
  server-config (admin #57) vs. per-user-config (#58); single-user self-hosted =
  obojí splývá.

### Co snadno zapomeneme

- **Bezpečnost:** rate-limit registrace/loginu (brute-force), CAPTCHA, CSRF
  u cookie session, ochrana cizích kreditů, secret management.
- **Email infra:** dnes nulová — SMTP nebo služba (Resend/SES) + setup docs.
- **GDPR:** mazání účtu smaže i vault data; export; souhlas (české UI → EU).
- **Migrace dat:** dnešní vault nemá majitele — přiřadit „adminovi" nebo nechat
  self-hosted bez vlastnictví.
- **Souběh:** `SessionManager` dnes předpokládá jeden aktivní vault/kampaň —
  multi-tenant chce session/kampaň per uživatel (#55f).
- **Ceník:** reálné kredity = skutečný cost tokenů + přirážka, jinak prodělek.

## P1 — Vícejazyčná podpora / i18n (#48)

Přidat angličtinu vedle češtiny + infrastrukturu pro další jazyky. Tři nezávislé
přepínače:

- **#48a — Infrastruktura.** Lokalizace v `packages/schemas/src/i18n/` —
  oddělené soubory per jazyk/kategorie, runtime přepínání bez reloadu. Stávající
  Czech mapy v `labels.ts` se stanou `cs`; přidat `en`.
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

---

## Deliverables the user can provide

- **Showcase vault** — see `docs/SHOWCASE.md` for what to author, the folder/
  frontmatter structure, and where to get art/map assets.
- **D&D asset database (SRD)** — see `docs/SHOWCASE.md` → "SRD asset database"
  for the source repo, what to download, and where to mount it.
