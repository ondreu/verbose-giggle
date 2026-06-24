import { useState } from "react";
import { csClass, csLineage } from "@adm/schemas";
import { useGame } from "../store/store";
import { Icon } from "../components/Icon";
import { CharacterCreate } from "../components/CharacterCreate";

/**
 * Party roster (#party-mgmt + #party-view): see the whole party out of combat,
 * switch the active (hotseat) character, send members to camp / recall them, and
 * add new characters mid-campaign. Switching and camping are out-of-combat only
 * — in combat the active actor follows the initiative order.
 */
export function PartyPanel() {
  const session = useGame((s) => s.session);
  const actors = useGame((s) => s.actors);
  const sendCommand = useGame((s) => s.sendCommand);
  const busy = useGame((s) => s.busy);
  const [showCreate, setShowCreate] = useState(false);

  const party = Object.values(actors).filter((a) => a.faction === "party");
  if (party.length === 0 && !showCreate) {
    return (
      <section className="parchment p-3 font-body">
        <PartyHeader onAdd={() => setShowCreate(true)} disabled={busy} />
        <p className="mt-2 text-sm italic text-ink/60">Žádné postavy v družině.</p>
      </section>
    );
  }

  const activeId = session?.active_player ?? null;
  const camp = new Set(session?.camp ?? []);
  const inCombat = Boolean(session?.combat);

  // Awake members (sorted before camped ones for a tidy roster).
  const awake = party.filter((a) => !camp.has(a.id));
  const resting = party.filter((a) => camp.has(a.id));
  const ordered = [...awake, ...resting];

  const switchTo = (id: string) => {
    if (busy || inCombat || id === activeId || camp.has(id)) return;
    void sendCommand("set_active_player", { actor: id });
  };
  const toCamp = (id: string) => {
    if (busy || inCombat) return;
    void sendCommand("send_to_camp", { actor: id });
  };
  const recall = (id: string) => {
    if (busy) return;
    void sendCommand("recall_from_camp", { actor: id });
  };

  return (
    <section className="parchment p-3 font-body">
      {showCreate && <CharacterCreate onClose={() => setShowCreate(false)} />}
      <PartyHeader onAdd={() => setShowCreate(true)} disabled={busy} />

      {inCombat && (
        <p className="mt-1 font-log text-[10px] text-ink/50">
          V boji řídí pořadí iniciativa — přepínání a tábor jsou mimo boj.
        </p>
      )}

      <ul className="mt-2 flex flex-col gap-1.5">
        {ordered.map((a) => {
          const camped = camp.has(a.id);
          const isActive = a.id === activeId;
          const overlay = session?.actors[a.id];
          const cur = overlay?.hp?.current ?? a.hp.current;
          const pct = Math.max(0, Math.min(100, (cur / a.hp.max) * 100));
          const downed = cur <= 0;
          return (
            <li
              key={a.id}
              className={`rounded-sm border px-2 py-1.5 transition-colors ${
                isActive
                  ? "border-gold/70 bg-gold/10"
                  : camped
                    ? "border-ink/15 bg-ink/5 opacity-60"
                    : "border-ink/20 bg-ink/5 hover:border-ink/40"
              } ${!camped && !isActive && !inCombat ? "cursor-pointer" : ""}`}
              onClick={() => switchTo(a.id)}
              title={camped ? "V táboře" : isActive ? "Aktivní postava" : inCombat ? "" : "Klikni pro přepnutí"}
            >
              <div className="flex items-center gap-1.5">
                {isActive && <Icon name="d20" size={12} className="shrink-0 text-gold" />}
                <span className="truncate font-display text-sm">{a.name}</span>
                <span className="ml-auto shrink-0 font-log text-[10px] uppercase tracking-wider text-ink/55">
                  {csLineage(a.race)} {csClass(a.class ?? "", a.class)} · ú. {a.level}
                </span>
              </div>

              {!camped && (
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-sm bg-ink/15">
                    <div
                      className="h-full transition-[width] duration-500"
                      style={{
                        width: `${pct}%`,
                        background: downed
                          ? "var(--blood)"
                          : pct > 50
                            ? "var(--verdigris)"
                            : pct > 20
                              ? "var(--ember)"
                              : "var(--blood)",
                      }}
                    />
                  </div>
                  <span className="shrink-0 font-log text-[10px] text-ink/60">
                    {cur}/{a.hp.max}
                  </span>
                </div>
              )}

              <div className="mt-1 flex items-center gap-2">
                {camped ? (
                  <button
                    className="font-log text-[10px] text-verdigris/80 hover:text-verdigris disabled:opacity-40"
                    onClick={(e) => {
                      e.stopPropagation();
                      recall(a.id);
                    }}
                    disabled={busy}
                    title="Přivolat zpět do hry"
                  >
                    <Icon name="footprints" size={10} className="mr-0.5 inline" />
                    přivolat
                  </button>
                ) : (
                  <button
                    className="font-log text-[10px] text-ink/50 hover:text-ink disabled:opacity-30"
                    onClick={(e) => {
                      e.stopPropagation();
                      toCamp(a.id);
                    }}
                    disabled={busy || inCombat}
                    title={inCombat ? "Nelze poslat do tábora během boje" : "Poslat do tábora (mimo hru)"}
                  >
                    <Icon name="hourglass" size={10} className="mr-0.5 inline" />
                    do tábora
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function PartyHeader({ onAdd, disabled }: { onAdd: () => void; disabled: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-ink/20 pb-1">
      <h2 className="font-display text-base">Družina</h2>
      <button
        className="flex items-center gap-0.5 font-log text-[10px] text-gold/80 hover:text-gold disabled:opacity-40"
        onClick={onAdd}
        disabled={disabled}
        title="Vytvořit a přidat novou postavu"
      >
        <Icon name="d20" size={11} />
        přidat
      </button>
    </div>
  );
}
