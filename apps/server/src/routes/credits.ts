/**
 * User-facing credits endpoint (#56e). Returns the signed-in user's balance
 * and recent ledger history for the Credits settings tab. Requires a session.
 */
import type { FastifyInstance } from "fastify";
import type { CreditStore } from "../credits/ledger.js";

export interface CreditContext {
  credits: CreditStore;
  /**
   * The one-time signup welcome bonus (#56), surfaced so the Credits tab can
   * advertise it. 0 when credits are disabled or the bonus is off. A getter so
   * a live admin config change is reflected without a restart.
   */
  signupBonus: () => number;
}

export async function registerCreditRoutes(app: FastifyInstance, ctx: CreditContext): Promise<void> {
  app.get("/api/credits", async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: "Nepřihlášen." });
    return reply.send({
      balance: ctx.credits.balance(req.user.id),
      history: ctx.credits.history(req.user.id, 50),
      signupBonus: ctx.signupBonus(),
    });
  });
}
