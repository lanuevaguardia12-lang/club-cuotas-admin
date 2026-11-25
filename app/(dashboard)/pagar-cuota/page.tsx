import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getDataService } from "@/services/data-service";
import { PaymentReceiptsStore } from "@/services/database/payment-receipts-store";
import { PlayerPaymentForm } from "@/components/player-payment/player-payment-form";
import { formatPaymentAmount, paymentPeriodLabel } from "@/lib/player-payment";
export const dynamic = "force-dynamic";
export default async function PlayerPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?redirectTo=/pagar-cuota");
  if (user.role !== "player") return <p>Esta pantalla es exclusiva para jugadores.</p>;
  const params = await searchParams;
  let data;
  try {
    data = await getDataService().getPlayerPaymentData(user);
  } catch {
    return (
      <section className="mx-auto grid max-w-xl gap-3">
        <h1 className="text-2xl font-semibold">Pagar cuotas</h1>
        <p>No pudimos obtener tu deuda en este momento. Intentá nuevamente.</p>
        <Link href="/mi-cuota" className="text-primary">
          Volver a mi cuota
        </Link>
      </section>
    );
  }
  const receipts = await new PaymentReceiptsStore().forPlayer(data.playerId);
  const settings = await getDataService()
    .getAppSettings()
    .catch(() => null);
  return (
    <main className="mx-auto grid w-full max-w-2xl min-w-0 gap-6">
      <Link href="/mi-cuota" className="text-muted-foreground w-fit text-sm">
        ← Volver a mi cuota
      </Link>
      <PlayerPaymentForm
        data={data}
        initialPeriod={params.period}
        paymentAlias={settings?.settings.paymentAlias ?? ""}
      />
      {receipts.length ? (
        <section className="border-border bg-card min-w-0 rounded-2xl border p-4 sm:p-6">
          <h2 className="font-semibold">Tus últimos pagos</h2>
          <ul className="mt-3 divide-y">
            {receipts
              .filter((r) => r.userId === user.id)
              .map((receipt) => (
                <li
                  key={receipt.id}
                  className="flex min-w-0 flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium tabular-nums">
                      {formatPaymentAmount(receipt.totalCents)}
                    </p>
                    <p className="text-muted-foreground text-xs break-words">
                      {receipt.quotas
                        .map((q) => paymentPeriodLabel(q.period))
                        .join(" · ")}
                    </p>
                  </div>
                  <a
                    href={`/api/payment-receipts/${receipt.id}`}
                    className="text-primary inline-flex min-h-11 items-center text-sm font-medium"
                  >
                    Ver comprobante
                  </a>
                </li>
              ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
