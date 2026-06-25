import { useEffect, useState } from "react";
import { fetchCredits, type CreditMovement } from "../auth";

/**
 * Credits settings tab (#56e): shows the signed-in user's balance and recent
 * ledger movements. Anonymous / self-hosted-without-accounts gets a short
 * explanation instead. Top-ups arrive via admin grant (#56d) for now; a
 * payment flow comes later.
 */
export function CreditsPanel() {
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "anon" } | { kind: "ready"; balance: number; history: CreditMovement[] }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void fetchCredits().then((res) => {
      if (cancelled) return;
      if (res.ok) setState({ kind: "ready", balance: res.data.balance, history: res.data.history });
      else setState({ kind: "anon" });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === "loading") return <p className="font-body italic text-ink/60">Načítám…</p>;

  if (state.kind === "anon") {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="font-display text-base text-ink/70">Kredity</p>
        <p className="max-w-xs font-body text-sm text-ink/55">
          Kredity se zobrazí po přihlášení. Self-hosted instance s vlastním API klíčem je nevyžaduje.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-baseline gap-2">
        <span className="font-display text-3xl text-ink">{state.balance}</span>
        <span className="font-log text-sm text-ink/60">kreditů</span>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="font-display text-xs uppercase tracking-wider text-ink/70">Historie</h2>
        {state.history.length === 0 ? (
          <p className="font-body text-sm italic text-ink/55">Zatím žádné pohyby.</p>
        ) : (
          <ul className="flex flex-col gap-1 font-log text-xs">
            {state.history.map((m) => (
              <li key={m.id} className="flex items-center gap-2">
                <span className="text-ink/40">{new Date(m.createdAt).toLocaleString("cs-CZ")}</span>
                <span className="text-ink/70">{m.reason}</span>
                <span className={`ml-auto ${m.delta >= 0 ? "text-verdigris" : "text-blood"}`}>
                  {m.delta >= 0 ? "+" : ""}
                  {m.delta}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
