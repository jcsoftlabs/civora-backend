import { z } from "zod";
import { isValidAmount } from "@civora/shared";

export const cashPayment = z.object({
  memberId: z.string().uuid(),
  /** Échéances réglées : le montant doit en être exactement la somme. */
  obligationIds: z.array(z.string().uuid()).min(1).max(24),
  amount: z.string().refine(isValidAmount, "montant invalide"),
  currency: z.enum(["HTG", "USD", "EUR", "CAD"]),
  /** Identifiant généré par le téléphone : une saisie envoyée deux fois n'est enregistrée qu'une fois. */
  clientRef: z.string().uuid(),
});

export const idParam = z.object({ id: z.string().uuid() });
export const paymentsQuery = z.object({
  memberId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  status: z.enum(["pending", "succeeded", "failed", "refunded"]).optional(),
  provider: z.enum(["cash", "moncash", "natcash", "kashpaw", "stripe", "fake", "history"]).optional(),
  /** Page suivante : paiements créés avant cette date. */
  before: z.coerce.date().optional(),
});

export const checkoutBody = z.object({
  provider: z.enum(["moncash", "natcash", "kashpaw", "fake"]),
  obligationIds: z.array(z.string().uuid()).min(1).max(24),
  clientRef: z.string().uuid(),
});
export const webhookParams = z.object({
  provider: z.enum(["moncash", "natcash", "kashpaw", "fake"]),
  partyId: z.string().uuid(),
});
export const returnParams = z.object({ partyId: z.string().uuid(), id: z.string().uuid() });
export const returnQuery = z.object({ transactionId: z.string().max(100).optional() });
