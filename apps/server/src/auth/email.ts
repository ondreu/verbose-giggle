/**
 * Outbound email (#55b). The app has no mail infra today, so the default
 * transport just logs the message (and any action link) to the server log —
 * enough for self-hosted/dev where the operator can read it off the console.
 * When SMTP is configured, messages go out via nodemailer (lazily imported so
 * the dependency is only touched when actually used).
 *
 * Verification (#55b) and reset (#55d) both build their message bodies here so
 * the wording lives in one place.
 */
import type { FastifyBaseLogger } from "fastify";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string | null;
  pass: string | null;
  from: string;
}

/** Logs the email instead of sending it. Default for self-hosted/dev. */
export class LogEmailSender implements EmailSender {
  constructor(private readonly log: Pick<FastifyBaseLogger, "info">) {}

  async send(message: EmailMessage): Promise<void> {
    this.log.info(
      { to: message.to, subject: message.subject },
      `[email:log] ${message.subject} → ${message.to}\n${message.text}`,
    );
  }
}

/** Sends through an SMTP server via nodemailer (imported on first use). */
export class SmtpEmailSender implements EmailSender {
  private transport: import("nodemailer").Transporter | null = null;

  constructor(private readonly cfg: SmtpConfig) {}

  private async getTransport(): Promise<import("nodemailer").Transporter> {
    if (!this.transport) {
      const nodemailer = await import("nodemailer");
      this.transport = nodemailer.createTransport({
        host: this.cfg.host,
        port: this.cfg.port,
        secure: this.cfg.secure,
        auth: this.cfg.user ? { user: this.cfg.user, pass: this.cfg.pass ?? "" } : undefined,
      });
    }
    return this.transport;
  }

  async send(message: EmailMessage): Promise<void> {
    const transport = await this.getTransport();
    await transport.sendMail({
      from: this.cfg.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
  }
}

/** Build the email-verification message. */
export function verificationEmail(to: string, link: string): EmailMessage {
  return {
    to,
    subject: "Ověření e-mailu — AI Dungeon Master",
    text:
      `Vítej v AI Dungeon Master!\n\n` +
      `Pro dokončení registrace ověř svůj e-mail otevřením tohoto odkazu:\n\n${link}\n\n` +
      `Odkaz brzy vyprší. Pokud jsi účet nezakládal(a), zprávu ignoruj.`,
  };
}

/** Build the password-reset message (#55d). */
export function passwordResetEmail(to: string, link: string): EmailMessage {
  return {
    to,
    subject: "Obnovení hesla — AI Dungeon Master",
    text:
      `Někdo požádal o obnovení hesla k tomuto účtu.\n\n` +
      `Nové heslo nastavíš otevřením tohoto odkazu:\n\n${link}\n\n` +
      `Odkaz brzy vyprší. Pokud jsi o obnovení nežádal(a), zprávu ignoruj.`,
  };
}
