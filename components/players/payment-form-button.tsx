import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";

const PAYMENT_FORM_BASE_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLScNPtChGadjifgrXFRZjDYsMVaIniB-EIRRvKfT4SAGKhqfuA/viewform";

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
        href={buildPaymentFormUrl(playerName, period)}
        rel="noreferrer"
        target="_blank"
        aria-label={label}
      >
        <ExternalLink className="size-4" />
        <span className={compact ? "sr-only" : undefined}>{label}</span>
      </a>
    </Button>
  );
}

function buildPaymentFormUrl(playerName: string, period: string) {
  const [year] = period.split("-");
  const params = new URLSearchParams({
    usp: "pp_url",
    "entry.1447717655": playerName,
    "entry.2143604901": year,
    "entry.639910438": formatFormMonth(period),
  });

  return `${PAYMENT_FORM_BASE_URL}?${params.toString()}`;
}

function formatFormMonth(period: string) {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(year, month - 1, 1);
  const label = new Intl.DateTimeFormat("es-AR", {
    month: "long",
  }).format(date);

  return label.charAt(0).toUpperCase() + label.slice(1);
}
