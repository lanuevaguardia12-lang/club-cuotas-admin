"use client";

import { AlertTriangle, CheckCircle2, Trash2, X } from "lucide-react";
import type { ReactNode } from "react";
import { useId, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  deleteEquipmentAssignment,
  recordEquipmentAssignment,
} from "@/app/(dashboard)/seguimiento-camisetas/actions";
import { Button } from "@/components/ui/button";
import { LoadingModal } from "@/components/ui/loading-modal";
import type { EquipmentType } from "@/types/equipment";

interface AssignmentFields {
  assignedAt: string;
  equipmentType: EquipmentType;
  matchDate?: string;
  matchId?: string;
  matchLabel?: string;
  playerId: string;
  playerName: string;
}

const equipmentLabels: Record<EquipmentType, string> = {
  balls: "Pelotas",
  shirt: "Camiseta",
};

export function EquipmentAssignmentConfirmButton({
  fields,
  label,
  pendingLabel = "Guardando registro...",
}: {
  fields: AssignmentFields;
  label: string;
  pendingLabel?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <CheckCircle2 />
        {label}
      </Button>
      {open ? (
        <ConfirmModal
          title={`Confirmar ${equipmentLabels[fields.equipmentType].toLowerCase()}`}
          description="Revisá el registro antes de guardarlo en el historial."
          onClose={() => setOpen(false)}
        >
          <form action={recordEquipmentAssignment} className="grid gap-4">
            <HiddenAssignmentFields fields={fields} />
            <AssignmentDetails
              rows={[
                ["Jugador", fields.playerName],
                ["Elemento", equipmentLabels[fields.equipmentType]],
                ["Fecha", fields.assignedAt],
                ["Partido", fields.matchLabel || "Carga manual"],
              ]}
            />
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                <X />
                Cancelar
              </Button>
              <ModalSubmitButton
                label="Confirmar y guardar"
                pendingLabel={pendingLabel}
              />
            </div>
          </form>
        </ConfirmModal>
      ) : null}
    </>
  );
}

export function EquipmentAssignmentDeleteButton({
  assignedAt,
  assignmentId,
  equipmentType,
  matchLabel,
  playerName,
}: {
  assignedAt: string;
  assignmentId: string;
  equipmentType: EquipmentType;
  matchLabel?: string;
  playerName: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" size="sm" variant="destructive" onClick={() => setOpen(true)}>
        <Trash2 />
        Eliminar
      </Button>
      {open ? (
        <ConfirmModal
          title="Eliminar registro"
          description="Esto saca esta asignación del historial y vuelve a recalcular la rotación."
          onClose={() => setOpen(false)}
        >
          <form action={deleteEquipmentAssignment} className="grid gap-4">
            <input name="assignmentId" type="hidden" value={assignmentId} />
            <div className="border-destructive/30 bg-destructive/10 rounded-md border p-3 text-sm">
              <div className="text-destructive flex gap-2 font-medium">
                <AlertTriangle className="mt-0.5 size-4" aria-hidden="true" />
                <span>Vas a eliminar este registro.</span>
              </div>
            </div>
            <AssignmentDetails
              rows={[
                ["Jugador", playerName],
                ["Elemento", equipmentLabels[equipmentType]],
                ["Fecha", assignedAt],
                ["Partido", matchLabel || "Carga manual"],
              ]}
            />
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                <X />
                Cancelar
              </Button>
              <ModalSubmitButton
                label="Eliminar registro"
                pendingLabel="Eliminando registro..."
                variant="destructive"
              />
            </div>
          </form>
        </ConfirmModal>
      ) : null}
    </>
  );
}

function HiddenAssignmentFields({ fields }: { fields: AssignmentFields }) {
  return (
    <>
      <input name="equipmentType" type="hidden" value={fields.equipmentType} />
      <input name="playerId" type="hidden" value={fields.playerId} />
      <input name="playerName" type="hidden" value={fields.playerName} />
      <input name="assignedAt" type="hidden" value={fields.assignedAt} />
      <input name="matchDate" type="hidden" value={fields.matchDate ?? ""} />
      <input name="matchId" type="hidden" value={fields.matchId ?? ""} />
      <input name="matchLabel" type="hidden" value={fields.matchLabel ?? ""} />
    </>
  );
}

function ConfirmModal({
  children,
  description,
  onClose,
  title,
}: {
  children: ReactNode;
  description: string;
  onClose: () => void;
  title: string;
}) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <div
      className="bg-background/80 fixed inset-0 z-50 grid place-items-center p-4 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="border-border bg-card text-card-foreground grid w-full max-w-md gap-4 rounded-lg border p-5 shadow-xl">
        <div className="grid gap-1">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <p id={descriptionId} className="text-muted-foreground text-sm">
            {description}
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}

function AssignmentDetails({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="border-border bg-muted/30 grid gap-2 rounded-md border p-3 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="grid gap-1 sm:grid-cols-[96px_1fr]">
          <dt className="text-muted-foreground font-medium">{label}</dt>
          <dd className="font-medium">{value || "-"}</dd>
        </div>
      ))}
    </dl>
  );
}

function ModalSubmitButton({
  label,
  pendingLabel,
  variant = "default",
}: {
  label: string;
  pendingLabel: string;
  variant?: "default" | "destructive";
}) {
  const { pending } = useFormStatus();

  return (
    <>
      <LoadingModal open={pending} description={pendingLabel} />
      <Button type="submit" disabled={pending} variant={variant}>
        <CheckCircle2 />
        {pending ? pendingLabel : label}
      </Button>
    </>
  );
}
