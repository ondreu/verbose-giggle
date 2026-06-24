import { useMemo, useState } from "react";
import {
  ABILITY_CS,
  ABILITY_DESC_CS,
  CONDITION_CS,
  CONDITION_DESC_CS,
  DAMAGE_CS,
  DAMAGE_DESC_CS,
  SKILL_CS,
  SPELL_SCHOOL_CS,
  SPELL_SCHOOL_DESC_CS,
  WEAPON_PROPERTY_CS,
  WEAPON_PROPERTY_DESC_CS,
  csAbility,
} from "@adm/schemas";
import { Icon } from "../components/Icon";
import { SKILL_TIP } from "../components/InfoCard";

/**
 * In-app rules reference (#21). A read-only, searchable glossary built entirely
 * from the static Czech label maps mined from the SRD descriptive data — so it
 * works without a mounted dataset and never invents rules. Grouped by category;
 * the search box filters by Czech term, id, or description text.
 */

interface RefEntry {
  id: string;
  term: string;
  desc?: string;
}

interface RefSection {
  title: string;
  icon: string;
  entries: RefEntry[];
}

function buildSections(): RefSection[] {
  const fromMap = (
    labels: Record<string, string>,
    descs?: Record<string, string>,
  ): RefEntry[] =>
    Object.entries(labels)
      .map(([id, term]) => ({ id, term, desc: descs?.[id] }))
      .sort((a, b) => a.term.localeCompare(b.term, "cs"));

  return [
    { title: "Stavy", icon: "skull", entries: fromMap(CONDITION_CS, CONDITION_DESC_CS) },
    { title: "Typy zranění", icon: "flame", entries: fromMap(DAMAGE_CS, DAMAGE_DESC_CS) },
    {
      title: "Vlastnosti zbraní",
      icon: "sword",
      entries: fromMap(WEAPON_PROPERTY_CS, WEAPON_PROPERTY_DESC_CS),
    },
    {
      title: "Vlastnosti",
      icon: "d20",
      entries: Object.keys(ABILITY_CS).map((k) => ({
        id: k,
        term: csAbility(k),
        desc: ABILITY_DESC_CS[k as keyof typeof ABILITY_DESC_CS],
      })),
    },
    {
      title: "Dovednosti",
      icon: "compass",
      entries: fromMap(SKILL_CS, SKILL_TIP),
    },
    { title: "Školy magie", icon: "flask", entries: fromMap(SPELL_SCHOOL_CS, SPELL_SCHOOL_DESC_CS) },
  ];
}

export function ReferenceModal({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const sections = useMemo(buildSections, []);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? sections
        .map((s) => ({
          ...s,
          entries: s.entries.filter(
            (e) =>
              e.term.toLowerCase().includes(q) ||
              e.id.toLowerCase().includes(q) ||
              (e.desc?.toLowerCase().includes(q) ?? false),
          ),
        }))
        .filter((s) => s.entries.length > 0)
    : sections;

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-bg-crust/70 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="parchment flex max-h-[82vh] w-full max-w-2xl flex-col p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-2 border-b border-ink/20 pb-2">
          <Icon name="document" size={18} className="text-ink" />
          <h2 className="font-display text-lg">Pravidla — rejstřík</h2>
          <button className="ml-auto font-log text-sm text-ink/60 hover:text-ink" onClick={onClose}>
            zavřít ✕
          </button>
        </div>

        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Hledat stav, zranění, dovednost…"
          className="settings-input mb-3 bg-bg-crust/40 text-ink placeholder:text-ink/40"
        />

        <div className="flex flex-col gap-4 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="font-body italic text-ink/60">Nic nenalezeno.</p>
          )}
          {filtered.map((section) => (
            <section key={section.title}>
              <h3 className="mb-1.5 flex items-center gap-1.5 font-log text-[11px] uppercase tracking-wider text-ink/55">
                <Icon name={section.icon} size={12} />
                {section.title}
              </h3>
              <dl className="flex flex-col gap-1.5">
                {section.entries.map((e) => (
                  <div key={e.id} className="rounded-sm border border-ink/15 bg-ink/5 px-2.5 py-1.5">
                    <dt className="font-display text-[15px] capitalize text-ink">{e.term}</dt>
                    {e.desc && (
                      <dd className="font-body text-[13px] leading-snug text-ink/75">{e.desc}</dd>
                    )}
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
