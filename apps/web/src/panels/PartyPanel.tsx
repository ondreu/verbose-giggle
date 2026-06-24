import { useState } from "react";
import { createPortal } from "react-dom";
import { csClass, csLineage } from "@adm/schemas";
import { useGame } from "../store/store";
import { Icon } from "../components/Icon";
import { CharacterCreate } from "../components/CharacterCreate";

/**
 * Party roster as a sticky tab strip (#47): one tab per member pinned at the top
 * of the right rail, driving which character the sheet + inventory below show.
 * Out of combat, picking a tab switches the active (hotseat) character; in combat
 * it's a view-only peek (the active actor follows initiative). Each tab carries a
 * small kebab menu (camp / recall, room to grow) and a trailing "+" adds a member.
 */
export function PartyPanel() {
  const session = useGame((s) => s.session);
  const actors = useGame((s) => s.actors);
  const sendCommand = useGame((s) => s.sendCommand);
  const setViewedPlayer = useGame((s) => s.setViewedPlayer);
  const viewedPlayer = useGame((s) => s.viewedPlayer);
  const busy = useGame((s) => s.busy);
  const [showCreate, setShowCreate] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  // Anchor rect for the kebab menu. The party tabs live in an `overflow-x-auto`
  // strip, which clips any absolutely-positioned dropdown (overflow-y resolves
  // to auto), so the menu is rendered in a portal at fixed coordinates (#4).
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; right: number } | null>(null);

  const openMenu = (id: string, e: React.MouseEvent<HTMLButtonElement>) => {
    if (menuFor === id) {
      setMenuFor(null);
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    setMenuAnchor({ top: r.bottom + 2, right: window.innerWidth - r.right });
    setMenuFor(id);
  };

  const party = Object.values(actors).filter((a) => a.faction === "party");

  const activePlayer = session?.active_player ?? null;
  const inCombat = Boolean(session?.combat);
  const actingId = inCombat
    ? session?.combat?.order[session.combat.turn_index]?.actor ?? null
    : activePlayer;
  const selectedId = viewedPlayer ?? activePlayer;
  const camp = new Set(session?.camp ?? []);

  // Awake members first, camped ones trailing — a tidy, stable order.
  const awake = party.filter((a) => !camp.has(a.id));
  const resting = party.filter((a) => camp.has(a.id));
  const ordered = [...awake, ...resting];

  const select = (id: string) => {
    if (busy || camp.has(id)) return;
    if (inCombat) {
      setViewedPlayer(id); // view-only: don't disturb the initiative order
    } else if (id !== activePlayer) {
      void sendCommand("set_active_player", { actor: id });
      setViewedPlayer(null); // out of combat the rail follows the active player
    }
  };
  const toCamp = (id: string) => {
    setMenuFor(null);
    if (busy || inCombat) return;
    void sendCommand("send_to_camp", { actor: id });
  };
  const recall = (id: string) => {
    setMenuFor(null);
    if (busy) return;
    void sendCommand("recall_from_camp", { actor: id });
  };

  return (
    <section className="panel px-1.5 pt-1.5">
      {showCreate && <CharacterCreate onClose={() => setShowCreate(false)} />}

      <nav className="flex items-end gap-1 overflow-x-auto">
        {ordered.map((a) => {
          const camped = camp.has(a.id);
          const selected = a.id === selectedId && !camped;
          const overlay = session?.actors[a.id];
          const cur = overlay?.hp?.current ?? a.hp.current;
          const dead = overlay?.dead ?? a.dead;
          const pct = Math.max(0, Math.min(100, (cur / a.hp.max) * 100));
          return (
            <div key={a.id} className="relative shrink-0">
              <div
                className={`flex items-center gap-1.5 rounded-t-sm border border-b-0 pl-2 pr-1 py-1 transition-colors ${
                  selected
                    ? "border-gold/40 bg-parchment text-ink"
                    : camped
                      ? "border-surface1 bg-mantle/60 text-subtext0"
                      : "border-surface1 bg-mantle text-subtext1 hover:bg-surface0 hover:text-text"
                }`}
              >
                <button
                  className="flex min-w-0 items-center gap-1.5"
                  onClick={() => select(a.id)}
                  disabled={camped}
                  title={
                    camped
                      ? `${a.name} — v táboře`
                      : `${csLineage(a.race)} ${csClass(a.class ?? "", a.class)} · úr. ${a.level}`
                  }
                >
                  <StatusDot pct={pct} dead={dead} downed={cur <= 0 && !dead} camped={camped} />
                  <span className="max-w-[8rem] truncate font-display text-sm leading-none">{a.name}</span>
                  {a.id === actingId && inCombat && (
                    <Icon name="d20" size={11} className="shrink-0 text-arcane" />
                  )}
                </button>
                <button
                  className={`grid h-5 w-5 shrink-0 place-items-center rounded-sm transition-colors ${
                    menuFor === a.id
                      ? selected
                        ? "bg-ink/10 text-ink"
                        : "bg-surface1 text-text"
                      : "opacity-60 hover:opacity-100"
                  }`}
                  onClick={(e) => openMenu(a.id, e)}
                  aria-haspopup="menu"
                  aria-expanded={menuFor === a.id}
                  title="Možnosti postavy"
                >
                  <Icon name="dots" size={13} />
                </button>
              </div>

              {menuFor === a.id && menuAnchor &&
                createPortal(
                  <>
                    <div className="fixed inset-0 z-[1900]" onClick={() => setMenuFor(null)} />
                    <div
                      role="menu"
                      className="panel fixed z-[1901] flex w-44 flex-col py-1"
                      style={{ top: menuAnchor.top, right: menuAnchor.right }}
                    >
                      {camped ? (
                        <PartyMenuItem
                          icon="footprints"
                          label="Přivolat z tábora"
                          onClick={() => recall(a.id)}
                          disabled={busy}
                        />
                      ) : (
                        <PartyMenuItem
                          icon="hourglass"
                          label="Poslat do tábora"
                          onClick={() => toCamp(a.id)}
                          disabled={busy || inCombat}
                          title={inCombat ? "Nelze během boje" : undefined}
                        />
                      )}
                    </div>
                  </>,
                  document.body,
                )}
            </div>
          );
        })}

        {/* Trailing "+" tab adds a new character mid-campaign. */}
        <button
          className="mb-px grid h-7 w-7 shrink-0 place-items-center rounded-t-sm border border-b-0 border-surface1 bg-mantle text-subtext0 transition-colors hover:bg-surface0 hover:text-gold disabled:opacity-40"
          onClick={() => setShowCreate(true)}
          disabled={busy}
          title="Vytvořit a přidat novou postavu"
        >
          <Icon name="plus" size={14} />
        </button>
      </nav>

      {party.length === 0 && (
        <p className="px-1 pb-1.5 pt-1 font-body text-sm italic text-subtext0">Žádné postavy v družině.</p>
      )}
    </section>
  );
}

/** HP-coloured status pip: green/amber/red by health, dark when downed, skull when dead. */
function StatusDot({
  pct,
  dead,
  downed,
  camped,
}: {
  pct: number;
  dead: boolean;
  downed: boolean;
  camped: boolean;
}) {
  if (dead) return <Icon name="skull" size={12} className="shrink-0 text-blood" />;
  if (camped) return <span className="h-2 w-2 shrink-0 rounded-full bg-surface2" title="v táboře" />;
  const bg = downed
    ? "var(--bg-crust)"
    : pct > 50
      ? "var(--verdigris)"
      : pct > 20
        ? "var(--ember)"
        : "var(--blood)";
  return (
    <span
      className="h-2 w-2 shrink-0 rounded-full ring-1 ring-black/40"
      style={{ background: bg }}
      title={downed ? "v bezvědomí (0 HP)" : `${Math.round(pct)} % HP`}
    />
  );
}

/** One row in a party tab's kebab menu (camp / recall, more to come, #47). */
function PartyMenuItem({
  icon,
  label,
  onClick,
  disabled,
  title,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      role="menuitem"
      className="flex items-center gap-2.5 px-3 py-1.5 text-left font-body text-sm text-subtext1 transition-colors hover:bg-gold/10 hover:text-gold disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-subtext1"
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      <Icon name={icon} size={14} />
      {label}
    </button>
  );
}
