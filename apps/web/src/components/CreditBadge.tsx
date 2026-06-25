import { useEffect, useState } from "react";
import { fetchCredits } from "../auth";
import { Icon } from "./Icon";

/**
 * Header credit balance indicator (#56e). Shown only in the hosted edition
 * (credits enabled) for a signed-in user. Polls periodically so the balance
 * reflects metered turns without manual refresh.
 */
export function CreditBadge() {
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const res = await fetchCredits();
      if (!cancelled) setBalance(res.ok ? res.data.balance : null);
    };
    void load();
    const t = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  if (balance === null) return null;

  return (
    <span
      className={`flex items-center gap-1 font-log text-xs ${balance <= 0 ? "text-blood" : "text-subtext0"}`}
      title="Zůstatek kreditů"
    >
      <Icon name="coins" size={12} />
      {balance}
    </span>
  );
}
