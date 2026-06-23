import { csQuestStatus, type QuestRuntime } from "@adm/schemas";
import { useGame } from "../store/store";
import { Icon } from "../components/Icon";

/**
 * Quest log (#19): live view of the player's quests, read from session state
 * (mutated only through the engine quest tools, so this never lies). Active
 * quests show an objective checklist; completed/failed are listed below.
 */
export function QuestLogModal({ onClose }: { onClose: () => void }) {
  const quests = useGame((s) => s.session?.quests) ?? {};
  const all = Object.values(quests);
  const active = all.filter((q) => q.status === "active");
  const resolved = all.filter((q) => q.status !== "active");

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-bg-crust/70 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="parchment flex max-h-[80vh] w-full max-w-2xl flex-col p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-2 border-b border-ink/20 pb-2">
          <Icon name="quest" size={18} className="text-ink" />
          <h2 className="font-display text-lg">Úkoly</h2>
          <button className="ml-auto font-log text-sm text-ink/60 hover:text-ink" onClick={onClose}>
            zavřít ✕
          </button>
        </div>

        <div className="overflow-y-auto">
          {all.length === 0 && (
            <p className="font-body italic text-ink/60">
              Zatím žádné úkoly. Přijmi nějaký od postav ve světě a objeví se zde.
            </p>
          )}

          {active.length > 0 && (
            <section className="mb-4">
              <h3 className="mb-2 font-log text-[11px] uppercase tracking-wider text-ink/55">Aktivní</h3>
              <div className="flex flex-col gap-3">
                {active.map((q) => (
                  <QuestCard key={q.id} quest={q} />
                ))}
              </div>
            </section>
          )}

          {resolved.length > 0 && (
            <section>
              <h3 className="mb-2 font-log text-[11px] uppercase tracking-wider text-ink/55">Uzavřené</h3>
              <div className="flex flex-col gap-2">
                {resolved.map((q) => (
                  <QuestCard key={q.id} quest={q} muted />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function QuestCard({ quest, muted }: { quest: QuestRuntime; muted?: boolean }) {
  const done = quest.objectives.filter((o) => o.done).length;
  const total = quest.objectives.length;
  const statusColor =
    quest.status === "completed" ? "text-verdigris" : quest.status === "failed" ? "text-blood" : "text-gold";
  return (
    <div className={`rounded-sm border border-ink/20 bg-ink/5 px-3 py-2 ${muted ? "opacity-70" : ""}`}>
      <div className="flex items-baseline gap-2">
        <span className={`font-display text-base ${muted ? "line-through" : ""}`}>{quest.title}</span>
        <span className={`ml-auto font-log text-[10px] uppercase tracking-wider ${statusColor}`}>
          {csQuestStatus(quest.status)}
        </span>
      </div>
      {quest.giver && <div className="font-log text-[10px] text-ink/55">zadal: {quest.giver}</div>}
      {total > 0 && (
        <ul className="mt-1.5 flex flex-col gap-0.5">
          {quest.objectives.map((o) => (
            <li key={o.id} className="flex items-start gap-1.5 font-body text-[13px] leading-snug">
              <span className={`mt-0.5 ${o.done ? "text-verdigris" : "text-ink/40"}`}>
                {o.done ? "✓" : "○"}
              </span>
              <span className={o.done ? "text-ink/55 line-through" : "text-ink/85"}>{o.text}</span>
            </li>
          ))}
        </ul>
      )}
      {total > 0 && quest.status === "active" && (
        <div className="mt-1 font-log text-[10px] text-ink/50">
          splněno {done}/{total}
        </div>
      )}
    </div>
  );
}
