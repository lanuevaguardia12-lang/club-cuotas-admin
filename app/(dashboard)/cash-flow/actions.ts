"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { userToAuditActor } from "@/lib/audit";
import { assertPermission } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { getDataService } from "@/services/data-service";

const periodSchema = z.string().regex(/^\d{4}-\d{2}$/);

const transactionSchema = z
  .object({
    id: z.string().trim().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    period: periodSchema,
    type: z.enum(["income", "expense"]),
    concept: z.string().trim().min(2).max(140),
    amount: z.coerce.number().positive(),
    repeatsMonthly: z.boolean(),
    startPeriod: periodSchema,
    endPeriod: periodSchema,
    notes: z.string().trim().max(500).optional(),
    scenario: z.enum(["real", "draft"]).default("real"),
  })
  .refine((value) => value.endPeriod >= value.startPeriod, {
    message: "El mes final no puede ser anterior al inicial.",
    path: ["endPeriod"],
  });

export async function saveCashFlowTransaction(input: unknown) {
  const user = await getCurrentUser();
  assertPermission(user, "cash-flow:write");

  const parsed = transactionSchema.parse(input);
  const dataService = getDataService();

  await dataService.upsertCashFlowTransaction(parsed);

  if (user) {
    await dataService
      .recordAuditEvent({
        actor: userToAuditActor(user),
        action: "api.request",
        entityType: "cash-flow",
        entityId: parsed.id || parsed.concept,
        summary: parsed.id
          ? "Movimiento de cash flow actualizado."
          : "Movimiento de cash flow creado.",
        metadata: {
          concept: parsed.concept,
          type: parsed.type,
          amount: parsed.amount,
          period: parsed.period,
          scenario: parsed.scenario,
          repeatsMonthly: parsed.repeatsMonthly,
        },
      })
      .catch(() => undefined);
  }

  revalidatePath("/cash-flow");

  return { ok: true };
}

export async function deleteCashFlowTransaction(transactionId: string) {
  const user = await getCurrentUser();
  assertPermission(user, "cash-flow:write");

  const dataService = getDataService();

  await dataService.deleteCashFlowTransaction(transactionId);

  if (user) {
    await dataService
      .recordAuditEvent({
        actor: userToAuditActor(user),
        action: "api.request",
        entityType: "cash-flow",
        entityId: transactionId,
        summary: "Movimiento de cash flow desactivado.",
        metadata: {
          transactionId,
        },
      })
      .catch(() => undefined);
  }

  revalidatePath("/cash-flow");

  return { ok: true };
}
