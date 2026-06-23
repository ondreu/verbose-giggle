import { useEffect, useRef } from "react";
import { useGame } from "../store/store";
import { Icon } from "../components/Icon";

const KIND_ICON: Record<string, string> = {
  attack: "sword",
  damage: "skull",
  heal: "heart",
  rest: "hourglass",
  check: "d20",
  save: "shield",
  initiative: "hourglass",
  move: "footprints",
  spell: "flame",
  aoe: "flame",
  travel: "compass",
  combat: "skull",
  quest: "quest",
};

const KIND_COLOR: Record<string, string> = {
  attack: "text-gold",
  damage: "text-blood",
  heal: "text-verdigris",
  spell: "text-arcane",
  aoe: "text-ember",
  save: "text-steel",
  quest: "text-gold",
};

export function DiceLog() {
  const log = useGame((s) => s.session?.log ?? []);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log.length]);

  return (
    <section className="panel flex h-full flex-col">
      <header className="panel-title flex items-center gap-2 px-3 py-2">
        <Icon name="d20" size={14} />
        Deník kostek
      </header>
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {log.length === 0 && (
          <p className="font-body text-sm italic text-subtext0">
            Zatím se nehrálo. Každý hod se zde objeví — viditelně a ověřitelně.
          </p>
        )}
        <ul className="space-y-1.5">
          {log.map((entry, i) => (
            <li
              key={`${entry.t}-${i}`}
              className={`log-enter flex gap-2 border-l-2 border-surface2 pl-2 ${
                KIND_COLOR[entry.kind] ?? "text-subtext1"
              }`}
            >
              <Icon
                name={KIND_ICON[entry.kind] ?? "d20"}
                size={13}
                className="mt-1 shrink-0 opacity-80"
              />
              <span className="font-log text-[12.5px] leading-snug text-subtext1">
                {entry.detail}
              </span>
            </li>
          ))}
        </ul>
        <div ref={endRef} />
      </div>
    </section>
  );
}
