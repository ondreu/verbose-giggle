import { useEffect, useState } from "react";
import {
  changeEmail,
  changePassword,
  changeProfile,
  deleteAccount,
  fetchCurrentUser,
  logout,
  type AuthUser,
} from "../auth";

/**
 * Account settings tab (#58a): change display name / email / password, log
 * out, and delete the account. Loads the current user on mount; when nobody is
 * signed in (anonymous / self-hosted), it explains that and offers nothing to
 * change. A successful logout or deletion reloads the app back to the gate.
 */
export function AccountPanel() {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void fetchCurrentUser().then((u) => {
      if (!cancelled) setUser(u);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (user === undefined) return <p className="font-body italic text-ink/60">Načítám…</p>;

  if (user === null) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="font-display text-base text-ink/70">Nepřihlášen</p>
        <p className="max-w-xs font-body text-sm text-ink/55">
          Hraješ bez účtu. Účet a jeho nastavení se zobrazí po přihlášení.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-display text-base">{user.displayName || user.email}</p>
          <p className="font-log text-xs text-ink/55">
            {user.email}
            {!user.emailVerified && " · neověřený e-mail"}
            {user.role === "admin" && " · admin"}
          </p>
        </div>
        <button
          className="rounded-sm border border-ink/30 px-3 py-1.5 font-display text-sm hover:bg-ink/10"
          onClick={async () => {
            await logout();
            window.location.reload();
          }}
        >
          Odhlásit se
        </button>
      </div>

      {user.role === "admin" && (
        <a
          href="/admin"
          className="self-start rounded-sm border border-ink/30 px-3 py-1.5 font-display text-sm hover:bg-ink/10"
        >
          Otevřít admin panel
        </a>
      )}

      <DisplayNameForm user={user} onUpdated={setUser} />
      <EmailForm user={user} onUpdated={setUser} />
      <PasswordForm />
      <DangerZone />
    </div>
  );
}

/** Small status line shown under each sub-form. */
function Status({ msg }: { msg: { kind: "ok" | "err"; text: string } | null }) {
  if (!msg) return null;
  return (
    <p className={`font-log text-xs ${msg.kind === "ok" ? "text-verdigris" : "text-blood"}`}>
      {msg.text}
    </p>
  );
}

type Msg = { kind: "ok" | "err"; text: string } | null;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2 border-t border-ink/15 pt-4">
      <legend className="px-1 font-display text-xs uppercase tracking-wider text-ink/70">{title}</legend>
      {children}
    </fieldset>
  );
}

const inputClass =
  "w-full rounded-sm border border-ink/25 bg-parchment px-2 py-1.5 text-sm text-ink focus:border-ink/50 focus:outline-none";

function DisplayNameForm({ user, onUpdated }: { user: AuthUser; onUpdated: (u: AuthUser) => void }) {
  const [name, setName] = useState(user.displayName ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  return (
    <Section title="Jméno">
      <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Zobrazované jméno" />
      <div className="flex items-center gap-3">
        <button
          className="rounded-sm border border-ink/30 bg-ink/10 px-3 py-1.5 font-display text-sm hover:bg-ink/20 disabled:opacity-50"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setMsg(null);
            const res = await changeProfile(name.trim() || null);
            setBusy(false);
            if (res.ok) {
              onUpdated(res.data.user);
              setMsg({ kind: "ok", text: "Uloženo." });
            } else setMsg({ kind: "err", text: res.error });
          }}
        >
          Uložit jméno
        </button>
        <Status msg={msg} />
      </div>
    </Section>
  );
}

function EmailForm({ user, onUpdated }: { user: AuthUser; onUpdated: (u: AuthUser) => void }) {
  const [email, setEmail] = useState(user.email);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  return (
    <Section title="E-mail">
      <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <div className="flex items-center gap-3">
        <button
          className="rounded-sm border border-ink/30 bg-ink/10 px-3 py-1.5 font-display text-sm hover:bg-ink/20 disabled:opacity-50"
          disabled={busy || email.trim() === user.email}
          onClick={async () => {
            setBusy(true);
            setMsg(null);
            const res = await changeEmail(email.trim());
            setBusy(false);
            if (res.ok) {
              onUpdated(res.data.user);
              setMsg({ kind: "ok", text: "E-mail změněn. Ověř ho odkazem v nové schránce." });
            } else setMsg({ kind: "err", text: res.error });
          }}
        >
          Změnit e-mail
        </button>
        <Status msg={msg} />
      </div>
    </Section>
  );
}

function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  return (
    <Section title="Heslo">
      <input
        className={inputClass}
        type="password"
        autoComplete="current-password"
        placeholder="Současné heslo"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
      />
      <input
        className={inputClass}
        type="password"
        autoComplete="new-password"
        placeholder="Nové heslo"
        value={next}
        onChange={(e) => setNext(e.target.value)}
      />
      <div className="flex items-center gap-3">
        <button
          className="rounded-sm border border-ink/30 bg-ink/10 px-3 py-1.5 font-display text-sm hover:bg-ink/20 disabled:opacity-50"
          disabled={busy || !current || !next}
          onClick={async () => {
            setBusy(true);
            setMsg(null);
            const res = await changePassword(current, next);
            setBusy(false);
            if (res.ok) {
              setCurrent("");
              setNext("");
              setMsg({ kind: "ok", text: "Heslo změněno." });
            } else setMsg({ kind: "err", text: res.error });
          }}
        >
          Změnit heslo
        </button>
        <Status msg={msg} />
      </div>
    </Section>
  );
}

function DangerZone() {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <Section title="Smazání účtu">
      <p className="font-body text-sm text-ink/60">
        Smazání účtu je nevratné a odstraní tvá data.
      </p>
      {!confirming ? (
        <button
          className="self-start rounded-sm border border-blood/50 px-3 py-1.5 font-display text-sm text-blood hover:bg-blood/10"
          onClick={() => setConfirming(true)}
        >
          Smazat účet
        </button>
      ) : (
        <div className="flex items-center gap-3">
          <button
            className="rounded-sm border border-blood/60 bg-blood/15 px-3 py-1.5 font-display text-sm text-blood hover:bg-blood/25 disabled:opacity-50"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await deleteAccount();
              window.location.reload();
            }}
          >
            Opravdu smazat
          </button>
          <button className="font-log text-sm text-ink/60 hover:text-ink" onClick={() => setConfirming(false)}>
            Zrušit
          </button>
        </div>
      )}
    </Section>
  );
}
