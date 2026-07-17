"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { userToAuditActor } from "@/lib/audit";
import { assertPermission } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { getDataService } from "@/services/data-service";

const periodSchema = z.string().regex(/^\d{4}-\d{2}$/);

const costSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2).max(120),
  type: z.enum(["fixed", "court", "coach", "custom"]),
  startPeriod: periodSchema,
  endPeriod: periodSchema,
  amount: z.coerce.number().min(0),
  repeatsMonthly: z.boolean(),
  splitBetween: z.coerce.number().int().min(1),
  forecastUnits: z.coerce.number().min(0),
  notes: z.string().trim().max(500).optional(),
});

const actualSchema = z.object({
  costId: z.string().trim().min(1),
  period: periodSchema,
  actualUnits: z.coerce.number().min(0),
  notes: z.string().trim().max(500).optional(),
});

export async function saveFeeCalculatorCost(input: unknown) {
  const user = await getCurrentUser();
  assertPermission(user, "fee-calculator:manage");

  const parsed = costSchema.parse(input);
  const dataService = getDataService();

  await dataService.upsertFeeCalculatorCost(parsed);
  if (user) {
    await dataService
      .recordAuditEvent({
        actor: userToAuditActor(user),
        action: "api.request",
        entityType: "fee",
        entityId: parsed.id || parsed.name,
        summary: "Costo del calculador actualizado.",
        metadata: {
          name: parsed.name,
          type: parsed.type,
          startPeriod: parsed.startPeriod,
          endPeriod: parsed.endPeriod,
        },
      })
      .catch(() => undefined);
  }

  revalidatePath("/fee-calculator");

  return { ok: true };
}

export async function deleteFeeCalculatorCost(costId: string) {
  const user = await getCurrentUser();
  assertPermission(user, "fee-calculator:manage");

  const dataService = getDataService();

  await dataService.deleteFeeCalculatorCost(costId);
  if (user) {
    await dataService
      .recordAuditEvent({
        actor: userToAuditActor(user),
        action: "api.request",
        entityType: "fee",
        entityId: costId,
        summary: "Costo del calculador desactivado.",
        metadata: {
          costId,
        },
      })
      .catch(() => undefined);
  }

  revalidatePath("/fee-calculator");

  return { ok: true };
}

export async function saveFeeCalculatorActual(input: unknown) {
  const user = await getCurrentUser();
  assertPermission(user, "fee-calculator:manage");

  const parsed = actualSchema.parse(input);
  const dataService = getDataService();

  await dataService.updateFeeCalculatorActual(parsed);
  if (user) {
    await dataService
      .recordAuditEvent({
        actor: userToAuditActor(user),
        action: "api.request",
        entityType: "fee",
        entityId: `${parsed.costId}:${parsed.period}`,
        summary: "Cantidad real del calculador actualizada.",
        metadata: {
          costId: parsed.costId,
          period: parsed.period,
          actualUnits: parsed.actualUnits,
        },
      })
      .catch(() => undefined);
  }

  revalidatePath("/fee-calculator");

  return { ok: true };
}
