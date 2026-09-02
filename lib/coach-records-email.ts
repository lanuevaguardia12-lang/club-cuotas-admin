import "server-only";

import { sendPlainEmail } from "@/lib/email";
import { getDataService } from "@/services/data-service";
import type { AuditActor } from "@/types/premium";

export interface SendCoachRecordsEmailReportResult {
  emailCc: string;
  emailSubject: string;
  emailTo: string;
  matches: number;
  paymentPeriod: string;
  period: string;
  totalCost: number;
  totalHours: number;
}

export async function sendCoachRecordsEmailReport({
  actor,
  period,
  trigger,
}: {
  actor: AuditActor;
  period: string;
  trigger: "admin" | "cron" | "manual";
}): Promise<SendCoachRecordsEmailReportResult> {
  const dataService = getDataService();
  const data = await dataService.getCoachRecordsData(period);

  if (data.source.status === "error") {
    throw new Error(data.source.message);
  }

  await sendPlainEmail({
    cc: data.emailCc,
    subject: data.emailSubject,
    text: data.emailBody,
    to: data.emailTo,
  });

  await dataService
    .recordAuditEvent({
      actor,
      action: "api.request",
      entityType: "settings",
      entityId: `coach-records-${data.period}`,
      summary: `Desglose DT enviado para ${data.period}.`,
      metadata: {
        emailCc: data.emailCc.join(", "),
        emailTo: data.emailTo,
        matches: data.matches.length,
        paymentPeriod: data.paymentPeriod,
        period: data.period,
        totalCost: data.totalCost,
        totalHours: data.totalHours,
        trigger,
      },
    })
    .catch(() => undefined);

  return {
    emailCc: data.emailCc.join(", "),
    emailSubject: data.emailSubject,
    emailTo: data.emailTo,
    matches: data.matches.length,
    paymentPeriod: data.paymentPeriod,
    period: data.period,
    totalCost: data.totalCost,
    totalHours: data.totalHours,
  };
}
