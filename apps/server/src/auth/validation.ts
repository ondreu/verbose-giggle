/**
 * Credential validation (#55b). Player-facing messages are Czech, like the
 * rest of the UI. Kept deliberately small and dependency-light so it can be
 * shared by register (#55b), reset (#55d) and account settings (#58).
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 200;

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

/** A syntactically valid email of reasonable length. */
export function validateEmail(email: string): ValidationResult {
  const trimmed = email.trim();
  if (!trimmed) return { ok: false, error: "Zadejte e-mail." };
  if (trimmed.length > 254) return { ok: false, error: "E-mail je příliš dlouhý." };
  if (!EMAIL_RE.test(trimmed)) return { ok: false, error: "Neplatný formát e-mailu." };
  return { ok: true };
}

/**
 * Password strength: length floor + at least two character classes. Not a
 * full policy engine — enough to refuse the obviously weak without nagging.
 */
export function validatePassword(password: string): ValidationResult {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, error: `Heslo musí mít alespoň ${PASSWORD_MIN_LENGTH} znaků.` };
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return { ok: false, error: "Heslo je příliš dlouhé." };
  }
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) => re.test(password)).length;
  if (classes < 2) {
    return {
      ok: false,
      error: "Heslo musí kombinovat alespoň dva druhy znaků (písmena, číslice, symboly).",
    };
  }
  return { ok: true };
}
