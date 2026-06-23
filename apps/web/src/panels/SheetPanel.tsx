import { useState } from "react";
import { csCondition, csConditionDesc, csAbility, csAbilityAbbr, csClass, csFeat, csLineage, csSkill, type AbilityKey } from "@adm/schemas";
import { useGame } from "../store/store";
import { Icon } from "../components/Icon";
import { LevelUpModal } from "../components/LevelUpModal";
import { FeatCard, FeatureCard, SpellCard, ConditionCard, Tip, ABILITY_TIP, SKILL_TIP } from "../components/InfoCard";
import type { PickedTarget } from "../store/store";

/** Turn a picked target into a Czech "na <cíl>" clause for the action sentence. */
export function targetClause(t: PickedTarget): string {
  if (!t) return "";
  return t.id ? ` na ${t.label} (${t.id})` : ` na ${t.label}`;
}


const mod = (score: number) => Math.floor((score - 10) / 2);
const fmt = (m: number) => (m >= 0 ? `+${m}` : `${m}`);
const pretty = (id: string) => id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
/** Prettify an SRD spell id ("fire-bolt") into a readable label. */
const prettySpell = pretty;

/** Armor/shields are not attacks (#43c). */
const ARMOR_RE = /(armor|shield|mail|plate|breastplate)/i;
const isWeaponId = (id: string) => !ARMOR_RE.test(id);


/** Standard D&D combat actions available to any creature. */
const STANDARD_ACTIONS: { label: string; icon: string; text: string; tip: string }[] = [
  { label: "Sprint", icon: "footprints", text: "Použiju akci Sprint (Dash) a zdvojnásobím svůj pohyb.", tip: "Dash — zdvojnásobí pohyb na tento tah. Nemůžeš útočit ani sesílat kouzla." },
  { label: "Úhyb", icon: "shield", text: "Použiju akci Úhyb (Dodge) — útoky proti mně mají nevýhodu.", tip: "Dodge — všechny útoky proti tobě mají nevýhodu; záchranné hody na Obratnost s výhodou. Funguje, dokud se pohybuješ." },
  { label: "Odpoutání", icon: "footprints", text: "Použiju akci Odpoutání (Disengage), abych se vyhnul příležitostným útokům.", tip: "Disengage — tvůj pohyb na tento tah nevyprovokuje příležitostné útoky." },
  { label: "Pomoc", icon: "heart", text: "Použiju akci Pomoc (Help) a podpořím spojence.", tip: "Help — dáš spojenci výhodu na jeho příští hod na útok nebo dovednostní zkoušku." },
  { label: "Úkryt", icon: "compass", text: "Pokusím se ukrýt (akce Úkryt) — hod na Nenápadnost.", tip: "Hide — hod na Nenápadnost vs. pasivní Vnímání nepřátel. Při úspěchu jsi skrytý." },
  { label: "Pátrání", icon: "compass", text: "Použiju akci Pátrání (Search) a pozorně se rozhlédnu.", tip: "Search — věnuješ se aktivnímu hledání; DM rozhodne, zda odhalíš skryté věci nebo tvory." },
];


/** Cumulative XP to REACH each level (index 0 = level 1). SRD. */
const XP_THRESHOLDS = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000,
  165000, 195000, 225000, 265000, 305000, 355000,
];

const ABILITY_ORDER: AbilityKey[] = ["str", "dex", "con", "int", "wis", "cha"];

export function SheetPanel() {
  const session = useGame((s) => s.session);
  const actors = useGame((s) => s.actors);
  const sendCommand = useGame((s) => s.sendCommand);
  const sendAction = useGame((s) => s.sendAction);
  const requestTarget = useGame((s) => s.requestTarget);
  const busy = useGame((s) => s.busy);
  const generateImage = useGame((s) => s.generateImage);
  const imageLoading = useGame((s) => s.imageLoading);
  const [levelUpOpen, setLevelUpOpen] = useState(false);
  const [openCond, setOpenCond] = useState<string | null>(null);

  // Cast a spell after the player picks a target (#8 + #38).
  const castSpellAt = async (spell: string) => {
    const t = await requestTarget(`Cíl pro ${prettySpell(spell)}`);
    if (t === "cancelled") return;
    void sendAction(`Sešlu kouzlo ${prettySpell(spell)} (${spell})${targetClause(t)}.`);
  };
  const activeId = session?.active_player ?? null;
  const actor = activeId ? actors[activeId] : null;

  if (!actor) {
    return (
      <section className="panel p-3">
        <header className="panel-title mb-2 pb-1">Postava</header>
        <p className="font-body text-sm italic text-subtext0">Žádná aktivní postava.</p>
      </section>
    );
  }

  const overlayHp = session?.actors[actor.id]?.hp?.current ?? actor.hp.current;
  const conditions = session?.actors[actor.id]?.conditions ?? actor.conditions;
  const hpPct = Math.max(0, Math.min(100, (overlayHp / actor.hp.max) * 100));
  const downed = overlayHp <= 0;
  const ds = actor.death_saves ?? { success: 0, fail: 0 };

  const canLevel = actor.type === "character" && actor.faction === "party" && actor.level < 20;
  const isPc = actor.type === "character" && actor.faction === "party";
  const curFloor = XP_THRESHOLDS[actor.level - 1] ?? 0;
  const nextFloor = XP_THRESHOLDS[actor.level] ?? null;
  const xpPct =
    nextFloor != null
      ? Math.max(0, Math.min(100, ((actor.xp - curFloor) / (nextFloor - curFloor)) * 100))
      : 100;
  const readyToLevel = nextFloor != null && actor.xp >= nextFloor;
  const disabled = busy || downed;

  // Action helpers for the consolidated action hub (#43).
  const act = (text: string) => { if (!disabled) void sendAction(text); };
  const aim = async (title: string, build: (clause: string) => string, allowNone = true) => {
    if (disabled) return;
    const t = await requestTarget(title, allowNone);
    if (t === "cancelled") return;
    void sendAction(build(targetClause(t)));
  };

  const equipped = actor.inventory.filter((i) => i.equipped && isWeaponId(i.id));

  return (
    <section className="parchment flex flex-col p-4 font-body">
      {levelUpOpen && <LevelUpModal actor={actor} onClose={() => setLevelUpOpen(false)} />}
      <div className="flex items-baseline justify-between border-b border-ink/20 pb-1">
        <h2 className="font-display text-xl">{actor.name}</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-ink/70">
            {csLineage(actor.race)} {csClass(actor.class ?? "", actor.class)} · úr. {actor.level}
          </span>
          {canLevel && (
            <button
              className="flex items-center gap-0.5 font-log text-[10px] text-gold/80 hover:text-gold disabled:opacity-40"
              onClick={() => setLevelUpOpen(true)}
              disabled={busy}
              title="Postup na vyšší úroveň"
            >
              <Icon name="d20" size={12} />
              úroveň
            </button>
          )}
          <button
            className="flex items-center gap-0.5 font-log text-[10px] text-ink/50 hover:text-ink disabled:opacity-40"
            onClick={() => void generateImage("character", actor.id, `Portrét — ${actor.name}`)}
            disabled={imageLoading}
            title="Vygenerovat portrét postavy"
          >
            <Icon name="camera" size={12} />
            portrét
          </button>
        </div>
      </div>

      {/* HP / AC / Speed */}
      <div className="mt-3 flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Icon name="heart" size={16} className="text-blood" />
          <span className="font-log text-sm">
            {overlayHp}/{actor.hp.max}
            {actor.hp.temp ? ` (+${actor.hp.temp})` : ""}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Icon name="shield" size={16} className="text-ink/80" />
          <span className="font-log text-sm">{actor.ac}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Icon name="footprints" size={16} className="text-ink/80" />
          <span className="font-log text-sm">{actor.speed} ft</span>
        </div>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-sm bg-ink/15">
        <div
          className="h-full transition-[width] duration-500"
          style={{
            width: `${hpPct}%`,
            background: hpPct > 50 ? "var(--verdigris)" : hpPct > 20 ? "var(--ember)" : "var(--blood)",
          }}
        />
      </div>

      {/* XP toward next level (party PCs) */}
      {isPc && (
        <div className="mt-2">
          <div className="mb-0.5 flex items-baseline justify-between font-log text-[10px] text-ink/60">
            <span className="uppercase tracking-wider">Zkušenosti</span>
            <span>
              {actor.xp.toLocaleString("cs-CZ")}
              {nextFloor != null ? ` / ${nextFloor.toLocaleString("cs-CZ")} XP` : " XP (max)"}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-sm bg-ink/15">
            <div
              className="h-full transition-[width] duration-500"
              style={{ width: `${xpPct}%`, background: readyToLevel ? "var(--gold)" : "var(--steel)" }}
            />
          </div>
          {readyToLevel && (
            <div className="mt-0.5 font-log text-[10px] text-gold">Dost XP na postup — klikni „úroveň“.</div>
          )}
        </div>
      )}

      {/* Abilities */}
      <div className="mt-3 grid grid-cols-6 gap-1.5">
        {ABILITY_ORDER.map((key) => (
          <Tip key={key} content={<p className="font-body text-sm leading-snug text-text">{ABILITY_TIP[key]}</p>}>
            <div className="rounded-sm border border-ink/20 bg-ink/5 px-1 py-1 text-center">
              <div className="text-[10px] uppercase tracking-wider text-ink/60">{csAbilityAbbr(key)}</div>
              <div className="font-display text-base leading-none">{fmt(mod(actor.abilities[key]))}</div>
              <div className="font-log text-[10px] text-ink/55">{actor.abilities[key]}</div>
            </div>
          </Tip>
        ))}
      </div>

      {/* Spell slots (casters) */}
      {Object.keys(actor.spell_slots).length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[11px] uppercase tracking-wider text-ink/60">Kouzelné sloty</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(actor.spell_slots).map(([lvl, slot]) => (
              <div key={lvl} className="flex items-center gap-1">
                <span className="font-log text-xs text-ink/70">{lvl}.</span>
                {Array.from({ length: slot.max }).map((_, i) => (
                  <span
                    key={i}
                    className="h-2.5 w-2.5 rounded-full border"
                    style={{
                      borderColor: "var(--arcane)",
                      background: i < slot.max - slot.used ? "var(--arcane)" : "transparent",
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Death saves — shown when the actor is down at 0 HP */}
      {downed && (
        <div className="mt-3 rounded-sm border border-blood/40 bg-blood/10 p-2">
          <div className="mb-1 flex items-center gap-2">
            <Icon name="skull" size={14} className="text-blood" />
            <span className="text-[11px] uppercase tracking-wider text-blood">Záchrana před smrtí</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1" title="úspěchy">
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-3 w-3 rounded-full border border-verdigris" style={{ background: i < ds.success ? "var(--verdigris)" : "transparent" }} />
              ))}
            </div>
            <div className="flex items-center gap-1" title="neúspěchy">
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-3 w-3 rounded-full border border-blood" style={{ background: i < ds.fail ? "var(--blood)" : "transparent" }} />
              ))}
            </div>
            <button
              className="btn-gold ml-auto px-2 py-0.5 text-[11px]"
              onClick={() => void sendCommand("death_save", { actor: actor.id })}
            >
              Hodit
            </button>
          </div>
        </div>
      )}

      {/* Conditions (#34): chips you can tap to read the rules effect. */}
      {conditions.length > 0 && (
        <div className="mt-3">
          <div className="flex flex-wrap gap-1.5">
            {conditions.map((c) => {
              const open = openCond === c.name;
              return (
                <ConditionCard key={c.name} name={csCondition(c.name)} description={csConditionDesc(c.name)}>
                  <button
                    onClick={() => setOpenCond(open ? null : c.name)}
                    className={`rounded-sm border px-1.5 py-0.5 font-log text-[11px] transition-colors ${
                      open
                        ? "border-blood bg-blood/20 text-blood"
                        : "border-blood/50 bg-blood/10 text-blood hover:bg-blood/20"
                    }`}
                  >
                    {csCondition(c.name)}
                  </button>
                </ConditionCard>
              );
            })}
          </div>
          {openCond && (
            <p className="mt-1.5 rounded-sm border border-ink/20 bg-ink/5 px-2 py-1 font-body text-sm leading-snug text-ink/80">
              <span className="font-semibold">{csCondition(openCond)}:</span>{" "}
              {csConditionDesc(openCond) || "Popis není k dispozici."}
            </p>
          )}
        </div>
      )}

      {/* Features, feats & languages from the SRD (#20 + #42c).
          Features are shown as static info (passive — not action buttons, #43d). */}
      {(actor.features?.length ?? 0) > 0 && (
        <FeatureTagRow label="Schopnosti" ids={actor.features ?? []} />
      )}
      {(actor.feats?.length ?? 0) > 0 && (
        <FeatTagRow label="Vlastnosti (feats)" ids={actor.feats ?? []} />
      )}
      {(actor.languages?.length ?? 0) > 0 && (
        <TagRow label="Jazyky" items={(actor.languages ?? []).map(humanizeId)} />
      )}

      {/* ── Consolidated action hub (#43a) ── */}
      <div className="mt-4 border-t border-ink/15 pt-3">
        <div className="mb-2 font-display text-[11px] uppercase tracking-widest text-ink/50">
          Akce
        </div>

        {/* Attacks (#43c: armor filtered out by isWeaponId) */}
        <ActionGroup label="Útoky" icon="sword">
          <Tip content={<p className="font-body text-sm leading-snug text-text">Útok libovolnou vybavenou zbraní. DM určí hod na útok a poškození.</p>}>
            <ActionChip
              label="Útok zbraní"
              disabled={disabled}
              onClick={() => void aim("Cíl útoku", (c) => `Zaútočím vybranou zbraní${c}.`, false)}
            />
          </Tip>
          {equipped.map((i) => (
            <Tip key={i.id} content={<p className="font-body text-sm leading-snug text-text">Útok zbraní {pretty(i.id)}.</p>}>
              <ActionChip
                label={pretty(i.id)}
                disabled={disabled}
                onClick={() => void aim(`Cíl pro ${pretty(i.id)}`, (c) => `Zaútočím zbraní ${pretty(i.id)} (${i.id})${c}.`, false)}
              />
            </Tip>
          ))}
          <Tip content={<p className="font-body text-sm leading-snug text-text">Úder pěstí nebo kolenem. Zásah: 1 + mod. Síly drtivého poškození.</p>}>
            <ActionChip label="Beze zbraně" disabled={disabled}
              onClick={() => void aim("Cíl útoku beze zbraně", (c) => `Zaútočím beze zbraně (unarmed strike)${c}.`, false)} />
          </Tip>
          <Tip content={<p className="font-body text-sm leading-snug text-text">Shove — sraž nebo odtlač protivníka na 5 stop. Protichůdný hod: Atletika vs. Atletika / Akrobacie.</p>}>
            <ActionChip label="Strčení" disabled={disabled}
              onClick={() => void aim("Cíl strčení", (c) => `Použiju speciální útok Strčení (Shove)${c} — pokus o sražení nebo odtlačení.`, false)} />
          </Tip>
          <Tip content={<p className="font-body text-sm leading-snug text-text">Grapple — zachyť protivníka; jeho rychlost klesne na 0. Protichůdný hod: Atletika vs. Atletika / Akrobacie.</p>}>
            <ActionChip label="Chvat" disabled={disabled}
              onClick={() => void aim("Cíl chvatu", (c) => `Pokusím se o Chvat (Grapple)${c}.`, false)} />
          </Tip>
        </ActionGroup>

        {/* Standard actions */}
        <ActionGroup label="Obecné akce" icon="d20">
          {STANDARD_ACTIONS.map((a) => (
            <Tip key={a.label} content={<p className="font-body text-sm leading-snug text-text">{a.tip}</p>}>
              <ActionChip label={a.label} disabled={disabled} onClick={() => act(a.text)} />
            </Tip>
          ))}
        </ActionGroup>

        {/* Spells — shown once here; "Známá kouzla" above removed (#43b + #42a). */}
        {actor.spells_known.length > 0 && (
          <ActionGroup label="Kouzla" icon="flame">
            {actor.spells_known.map((spell) => (
              <SpellCard key={spell} id={spell}>
                <ActionChip
                  label={prettySpell(spell)}
                  accent
                  disabled={disabled}
                  onClick={() => void aim(`Cíl pro ${prettySpell(spell)}`, (c) => `Sešlu kouzlo ${prettySpell(spell)} (${spell})${c}.`)}
                />
              </SpellCard>
            ))}
          </ActionGroup>
        )}

        {/* Skill checks */}
        <ActionGroup label="Zkoušky" icon="compass">
          {(["perception", "insight", "persuasion"] as const).map((sk) => (
            <Tip key={sk} content={<p className="font-body text-sm leading-snug text-text">{SKILL_TIP[sk]}</p>}>
              <ActionChip label={csSkill(sk)} disabled={disabled}
                onClick={() => act(`Udělám zkoušku dovednosti ${csSkill(sk)}.`)} />
            </Tip>
          ))}
        </ActionGroup>
      </div>
    </section>
  );
}

/** Turn an SRD id like "elf-weapon-training" into "Elf weapon training". */
function humanizeId(id: string): string {
  const s = id.replace(/[-_]/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function TagRow({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="mt-3">
      <div className="mb-1 text-[11px] uppercase tracking-wider text-ink/60">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((t, i) => (
          <span key={`${t}-${i}`} className="rounded-sm border border-ink/20 bg-ink/5 px-1.5 py-0.5 font-log text-[11px] text-ink/80">
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Group header + chip row for the consolidated action hub (#43a). */
function ActionGroup({ label, icon, children }: { label: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="mb-2.5">
      <div className="mb-1 flex items-center gap-1 font-log text-[10px] uppercase tracking-wider text-ink/50">
        <Icon name={icon} size={10} />
        {label}
      </div>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

/** Clickable action chip for the consolidated action hub (#43a). */
function ActionChip({ label, onClick, disabled, accent, title }: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  accent?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-sm border px-2 py-0.5 font-body text-sm transition-colors disabled:opacity-40 ${
        accent
          ? "border-arcane/50 bg-arcane/10 text-arcane hover:bg-arcane/20"
          : "border-ink/25 bg-ink/5 text-ink/75 hover:border-ink/50 hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}

/** Feats row with SRD hover cards (#42c). */
function FeatTagRow({ label, ids }: { label: string; ids: string[] }) {
  return (
    <div className="mt-3">
      <div className="mb-1 text-[11px] uppercase tracking-wider text-ink/60">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {ids.map((id) => (
          <FeatCard key={id} id={id}>
            <span className="cursor-default rounded-sm border border-ink/20 bg-ink/5 px-1.5 py-0.5 font-log text-[11px] text-ink/80 hover:border-gold/40 hover:text-ink/100">
              {csFeat(id, humanizeId(id))}
            </span>
          </FeatCard>
        ))}
      </div>
    </div>
  );
}

/** Class/racial features row with SRD hover cards (#42c). */
function FeatureTagRow({ label, ids }: { label: string; ids: string[] }) {
  return (
    <div className="mt-3">
      <div className="mb-1 text-[11px] uppercase tracking-wider text-ink/60">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {ids.map((id) => (
          <FeatureCard key={id} id={id}>
            <span className="cursor-default rounded-sm border border-ink/20 bg-ink/5 px-1.5 py-0.5 font-log text-[11px] text-ink/80 hover:border-gold/40 hover:text-ink/100">
              {humanizeId(id)}
            </span>
          </FeatureCard>
        ))}
      </div>
    </div>
  );
}
