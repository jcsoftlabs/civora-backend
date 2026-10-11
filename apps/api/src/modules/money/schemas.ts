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
});
