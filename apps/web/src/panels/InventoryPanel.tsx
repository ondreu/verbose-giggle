import { useEffect, useState } from "react";
import { csWeaponProperty, csWeaponPropertyDesc } from "@adm/schemas";
import { useGame } from "../store/store";
import { Icon } from "../components/Icon";
import { ItemCard, primeItemCache, Tip } from "../components/InfoCard";

interface ResolvedItem {
  name: string;
  /** Player-facing Czech name where translated, else English (#45b). */
  nameCs?: string;
  category?: string;
  rarity?: string;
  magic: boolean;
  description?: string;
  properties?: string[];
}

/** Humanize an unresolved id as a last resort (e.g. "potion-of-healing"). */
function humanize(id: string): string {
  const s = id.replace(/[-_]/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function InventoryPanel() {
  const session = useGame((s) => s.session);
  const actors = useGame((s) => s.actors);
  const sendCommand = useGame((s) => s.sendCommand);
  // Follow the party tab strip selection (#47): viewed member, else active player.
  const viewedPlayer = useGame((s) => s.viewedPlayer);
  const actorId = viewedPlayer ?? session?.active_player ?? null;
  const base = actorId ? actors[actorId] : null;
  // Live inventory (equip/loot) lives in the session overlay and arrives via the
  // `state` SSE event; fall back to the base sheet before the first change (#9).
  const overlayInv = actorId ? session?.actors[actorId]?.inventory : undefined;
  const actor = base ? { ...base, inventory: overlayInv ?? base.inventory } : null;

  const [resolved, setResolved] = useState<Record<string, ResolvedItem>>({});
  const ids = (actor?.inventory ?? []).map((i) => i.id).join(",");

  // Resolve item ids to SRD names/rarity/descriptions (equipment + magic items).
  useEffect(() => {
    if (!ids) return;
    void (async () => {
      try {
        const res = await fetch(`/api/srd/items?ids=${encodeURIComponent(ids)}`);
        if (res.ok) {
          const data = await res.json();
          setResolved(data);
          primeItemCache(data); // share with ItemCard hover cards (#42c)
        }
      } catch {
        /* fall back to humanized ids */
      }
    })();
  }, [ids]);

  if (!actor) return null;

  return (
    <section className="panel flex flex-col">
      <header className="panel-title flex items-center gap-2 px-3 py-2">
        <Icon name="flask" size={14} />
        Výbava
        <span className="ml-auto font-log text-[10px] normal-case text-subtext0">
          připoutáno {actor.attunement.length}/3
        </span>
      </header>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5 px-3 py-2">
        {actor.inventory.length === 0 && (
          <li className="col-span-2 font-body text-sm italic text-subtext0">Prázdný batoh.</li>
        )}
        {actor.inventory.map((item) => {
          const info = resolved[item.id];
          const name = info?.nameCs ?? info?.name ?? humanize(item.id);
          const props = info?.properties ?? [];
          return (
            <li key={item.id} className="min-w-0 py-1">
              <div className="flex items-center gap-1.5">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${item.equipped ? "bg-gold" : "bg-surface2"}`}
                  title={item.equipped ? "vybaveno" : "v batohu"}
                />
                <ItemCard id={item.id}>
                  <span className={`cursor-default truncate font-body text-sm ${info?.magic ? "text-arcane" : "text-text"}`}>
                    {name}
                  </span>
                </ItemCard>
                {info?.magic && (
                  <span className="shrink-0 font-log text-[9px] uppercase tracking-wider text-arcane/70" title={info.rarity}>
                    ✦
                  </span>
                )}
                {item.qty > 1 && <span className="shrink-0 font-log text-[11px] text-subtext0">×{item.qty}</span>}
                <button
                  className="ml-auto shrink-0 font-log text-[10px] text-subtext0 hover:text-gold"
                  onClick={() =>
                    void sendCommand("equip_item", {
                      actor: actor.id,
                      item: item.id,
                      equipped: !item.equipped,
                    })
                  }
                >
                  {item.equipped ? "odložit" : "vybavit"}
                </button>
              </div>
              {/* Weapon-property chips with Czech rules tooltips (#21). */}
              {props.length > 0 && (
                <div className="ml-3 mt-0.5 flex flex-wrap gap-1">
                  {props.map((p) => (
                    <Tip key={p} content={<p className="font-body text-sm leading-snug text-text">{csWeaponPropertyDesc(p) || csWeaponProperty(p)}</p>}>
                      <span className="cursor-default rounded-sm border border-surface2 px-1 py-px font-log text-[9px] uppercase tracking-wider text-subtext0 hover:border-gold/40">
                        {csWeaponProperty(p)}
                      </span>
                    </Tip>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
