"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { userToAuditActor } from "@/lib/audit";
import { hasPermission } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { getDataService } from "@/services/data-service";
import {
  CashFlowInputError,
  CASH_FLOW_SAVE_UNCONFIRMED,
  CASH_FLOW_DELETE_UNCONFIRMED,
  type CashFlowMutationResult,
} from "@/lib/cash-flow-errors";

const periodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Elegí un mes válido.");

const transactionSchema = z
  .object({
    id: z.string().trim().optional(),
    date: z.iso.date("Elegí una fecha válida."),
    period: periodSchema,
    type: z.enum(["income", "expense"]),
    concept: z
      .string()
      .trim()
      .min(2, "Ingresá un concepto de al menos dos caracteres.")
      .max(140, "El concepto es demasiado largo."),
    amount: z.coerce.number().positive("El monto debe ser mayor a cero."),
    repeatsMonthly: z.boolean(),
    startPeriod: periodSchema,
    endPeriod: periodSchema,
    notes: z.string().trim().max(500).optional(),
    scenario: z.enum(["real", "draft"]).default("real"),
    incomeKind: z.enum(["general", "fundraising"]).default("general"),
    participantPlayerIds: z.array(z.string().trim().min(1)).default([]),
  })
  .refine((value) => value.endPeriod >= value.startPeriod, {
    message: "El mes final no puede ser anterior al inicial.",
    path: ["endPeriod"],
  })
  .superRefine((value, context) => {
    if (value.incomeKind !== "fundraising") return;
    if (value.type !== "income" || value.scenario !== "real" || value.repeatsMonthly) {
      context.addIssue({
        code: "custom",
        message: "La recaudación debe ser un ingreso real sin repetición mensual.",
        path: ["incomeKind"],
      });
    }
    if (
      value.participantPlayerIds.length === 0 ||
      new Set(value.participantPlayerIds).size !== value.participantPlayerIds.length
    ) {
      context.addIssue({
        code: "custom",
        message: "Seleccioná al menos un jugador, sin repetir participantes.",
        path: ["participantPlayerIds"],
      });
    }
  });

function mutationFailure(
  operation: "save" | "delete",
  error: unknown,
): CashFlowMutationResult {
  if (error instanceof CashFlowInputError) return { ok: false, message: error.message };
  const reference = randomUUID().slice(0, 8);
  const code =
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string" &&
    /^[A-Z0-9_]{1,40}$/.test(error.code)
      ? error.code
      : "UNEXPECTED";
  // Do not log credentials, SQL, personal details or the submitted movement.
  console.error("cash-flow.mutation_failed", { operation, reference, code });
  return {
    ok: false,
    message: `${operation === "save" ? CASH_FLOW_SAVE_UNCONFIRMED : CASH_FLOW_DELETE_UNCONFIRMED} Referencia: ${reference}.`,
  };
}

function refreshCashFlow(): CashFlowMutationResult {
  try {
    revalidatePath("/cash-flow");
    revalidatePath("/fee-calculator");
    revalidatePath("/players/[playerId]", "page");
    revalidatePath("/mi-cuota");
    return { ok: true };
  } catch {
    // The mutation is already committed. A refresh failure must not invite
    // the user to repeat a financial operation that has succeeded.
    return {
      ok: true,
      warning:
        "El cambio se guardó, pero no pudimos actualizar la vista. Recargá la página para verlo.",
    };
  }
}

export async function saveCashFlowTransaction(
  input: unknown,
): Promise<CashFlowMutationResult> {
  let user;
  let dataService;
  let parsed;
  try {
    user = await getCurrentUser();
    if (!user)
      return {
        ok: false,
        message: "Tu sesión venció. Iniciá sesión nuevamente para guardar el movimiento.",
      };
    if (!hasPermission(user, "cash-flow:write"))
      return { ok: false, message: "No tenés permisos para guardar movimientos." };
    const validation = transactionSchema.safeParse(input);
    if (!validation.success)
      return {
        ok: false,
        message:
          validation.error.issues[0]?.message ?? "Revisá los datos del movimiento.",
      };
    parsed = validation.data;
    dataService = getDataService();
    await dataService.upsertCashFlowTransaction(parsed);
  } catch (error) {
    return mutationFailure("save", error);
  }
  try {
    await dataService.recordAuditEvent({
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
        incomeKind: parsed.incomeKind,
        participantPlayerIds: parsed.participantPlayerIds.join(","),
      },
    });
  } catch {
    /* Audit delivery does not undo a confirmed financial write. */
  }
  return refreshCashFlow();
}

export async function deleteCashFlowTransaction(
  transactionId: string,
): Promise<CashFlowMutationResult> {
  let user;
  let dataService;
  try {
    user = await getCurrentUser();
    if (!user)
      return {
        ok: false,
        message:
          "Tu sesión venció. Iniciá sesión nuevamente para eliminar el movimiento.",
      };
    if (!hasPermission(user, "cash-flow:write"))
      return { ok: false, message: "No tenés permisos para eliminar movimientos." };
    if (typeof transactionId !== "string" || !transactionId.trim())
      return { ok: false, message: "Seleccioná un movimiento válido." };
    dataService = getDataService();
    await dataService.deleteCashFlowTransaction(transactionId);
  } catch (error) {
    return mutationFailure("delete", error);
  }
  try {
    await dataService.recordAuditEvent({
      actor: userToAuditActor(user),
      action: "api.request",
      entityType: "cash-flow",
      entityId: transactionId,
      summary: "Movimiento de cash flow desactivado.",
      metadata: { transactionId },
    });
  } catch {
    /* Audit delivery does not undo a confirmed financial write. */
  }
  return refreshCashFlow();
}
