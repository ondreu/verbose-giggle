import { useGame } from "../store/store";
import { Icon } from "../components/Icon";

export function InventoryPanel() {
  const session = useGame((s) => s.session);
  const actors = useGame((s) => s.actors);
  const sendCommand = useGame((s) => s.sendCommand);
  const actor = session?.active_player ? actors[session.active_player] : null;
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
      <ul className="px-3 py-2">
        {actor.inventory.length === 0 && (
          <li className="font-body text-sm italic text-subtext0">Prázdný batoh.</li>
        )}
        {actor.inventory.map((item) => (
          <li key={item.id} className="flex items-center gap-2 py-1">
            <span
              className={`h-2 w-2 rounded-full ${item.equipped ? "bg-gold" : "bg-surface2"}`}
              title={item.equipped ? "vybaveno" : "v batohu"}
            />
            <span className="font-body text-text">{item.id}</span>
            {item.qty > 1 && <span className="font-log text-xs text-subtext0">×{item.qty}</span>}
            <button
              className="ml-auto font-log text-[11px] text-subtext0 hover:text-gold"
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
          </li>
        ))}
      </ul>
    </section>
  );
}
