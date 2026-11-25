// Only deliberate input/business-rule failures may be shown to the user.
// Database and provider exceptions must never cross the action boundary verbatim.
export class CashFlowInputError extends Error {}

export type CashFlowMutationResult =
  { ok: true; warning?: string } | { ok: false; message: string };

export const CASH_FLOW_SAVE_UNCONFIRMED =
  "No pudimos confirmar el guardado. Actualizá la lista y verificá si el movimiento aparece antes de volver a guardarlo.";
export const CASH_FLOW_DELETE_UNCONFIRMED =
  "No pudimos confirmar la eliminación. Actualizá la lista de movimientos antes de volver a intentarlo.";
