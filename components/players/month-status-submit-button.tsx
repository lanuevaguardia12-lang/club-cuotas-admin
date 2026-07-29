"use client";

import { CheckCircle2, CircleOff } from "lucide-react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { LoadingModal } from "@/components/ui/loading-modal";
import type { PlayerMonthPaymentStatus } from "@/types/dashboard";

export function MonthStatusSubmitButton({
  status,
}: {
  status: PlayerMonthPaymentStatus;
}) {
  const { pending } = useFormStatus();
  const isPaid = status === "paid";

  return (
    <>
      <LoadingModal
        open={pending}
        description={
          isPaid ? "Marcando cuota como impaga..." : "Marcando cuota como pagada..."
        }
      />
      <Button
        type="submit"
        variant={isPaid ? "outline" : "default"}
        size="sm"
        className="w-full"
        disabled={pending}
      >
        {isPaid ? <CircleOff /> : <CheckCircle2 />}
        {isPaid ? "Marcar impago" : "Marcar pagado"}
      </Button>
    </>
  );
}
