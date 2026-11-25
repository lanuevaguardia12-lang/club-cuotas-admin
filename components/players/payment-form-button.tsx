import { Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";

export function PaymentFormButton({
  className,
  compact = false,
  period,
  playerName,
}: {
  className?: string;
  compact?: boolean;
  period: string;
  playerName: string;
}) {
  const label = "Registrar pago";

  return (
    <Button
      asChild
      className={className}
      size={compact ? "icon" : "sm"}
      variant={compact ? "outline" : "default"}
      title={label}
    >
      <a
        href={`/pagar-cuota?period=${encodeURIComponent(period)}`}
        aria-label={`${label} de ${playerName}`}
      >
        <Wallet className="size-4" />
        <span className={compact ? "sr-only" : undefined}>{label}</span>
      </a>
    </Button>
  );
}
