"use client";

import { CheckCircle2 } from "lucide-react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { LoadingModal } from "@/components/ui/loading-modal";

export function EquipmentAssignmentSubmitButton({
  label,
  pendingLabel = "Guardando...",
  size = "sm",
}: {
  label: string;
  pendingLabel?: string;
  size?: "default" | "sm";
}) {
  const { pending } = useFormStatus();

  return (
    <>
      <LoadingModal open={pending} description={pendingLabel} />
      <Button type="submit" size={size} disabled={pending}>
        <CheckCircle2 />
        {pending ? pendingLabel : label}
      </Button>
    </>
  );
}
