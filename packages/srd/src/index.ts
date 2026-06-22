import { EQUIPMENT, MONSTERS, SPELLS } from "./data.js";
import type { SrdEquipment, SrdMonster, SrdSpell } from "./types.js";

export * from "./types.js";
export { MONSTERS, SPELLS, EQUIPMENT } from "./data.js";

/**
 * Read-only typed accessors over the bundled SRD subset. A production loader
 * can merge a mounted /data/srd dataset on top of these defaults; the
 * accessors stay pure (no IO) so the engine can depend on them safely.
 */
export interface SrdIndex {
  monster(id: string): SrdMonster | undefined;
  spell(id: string): SrdSpell | undefined;
  equipment(id: string): SrdEquipment | undefined;
}

export function createSrdIndex(overrides?: {
  monsters?: Record<string, SrdMonster>;
  spells?: Record<string, SrdSpell>;
  equipment?: Record<string, SrdEquipment>;
}): SrdIndex {
  const monsters = { ...MONSTERS, ...(overrides?.monsters ?? {}) };
  const spells = { ...SPELLS, ...(overrides?.spells ?? {}) };
  const equipment = { ...EQUIPMENT, ...(overrides?.equipment ?? {}) };
  return {
    monster: (id) => monsters[id],
    spell: (id) => spells[id],
    equipment: (id) => equipment[id],
  };
}

export const srd: SrdIndex = createSrdIndex();
