import "server-only";

import { DEFAULT_APP_SETTINGS } from "@/lib/app-settings";
import { DataServiceError } from "@/services/data-service-error";
import type { IDataService } from "@/services/IDataService";
import type { AuthUser } from "@/types/auth";
import type { CashFlowData, DashboardData, PlayerProfile } from "@/types/dashboard";
import type { ExportData, ExportDataset } from "@/types/export";
import type { FeeCalculatorData } from "@/types/fee-calculator";
import type { PlayerOfMatchData } from "@/types/player-of-match";
import type { PremiumData, PushSubscriptionRecord } from "@/types/premium";
import type { PlayerDirectoryData } from "@/types/players";
import type { AppSettingsData } from "@/types/settings";

export class DatabaseService implements IDataService {
  async getAppSettings(): Promise<AppSettingsData> {
    return {
      settings: DEFAULT_APP_SETTINGS,
      source: {
        provider: "postgresql",
        status: "error",
        message: "DatabaseService todavia no esta implementado.",
        cachedAt: new Date().toISOString(),
        revalidateSeconds: 0,
      },
    };
  }

  async updateAppSettings(): Promise<void> {
    throw new DataServiceError(
      "DatabaseService todavia no esta implementado.",
      "UNSUPPORTED_DATA_SOURCE",
    );
  }

  async getAccountProfile(user: AuthUser) {
    return {
      profile: {
        userId: user.id,
        username: user.username,
        role: user.role,
        name: user.name,
        email: "",
        phone: "",
        profilePhotoDataUrl: "",
        updatedAt: "",
        passwordUpdatedAt: "",
      },
      source: {
        provider: "postgresql" as const,
        status: "error" as const,
        message: "DatabaseService todavia no esta implementado.",
        cachedAt: new Date().toISOString(),
        revalidateSeconds: 0,
      },
    };
  }

  async updateAccountProfile(): Promise<void> {
    throw new DataServiceError(
      "DatabaseService todavia no esta implementado.",
      "UNSUPPORTED_DATA_SOURCE",
    );
  }

  async updateAccountPassword(): Promise<void> {
    throw new DataServiceError(
      "DatabaseService todavia no esta implementado.",
      "UNSUPPORTED_DATA_SOURCE",
    );
  }

  async getAccountAuthOverride() {
    return null;
  }

  async getDashboardData(
    period = new Date().toISOString().slice(0, 7),
  ): Promise<DashboardData> {
    return {
      period,
      metrics: [
        {
          id: "total-players",
          title: "Cantidad de jugadores",
          value: "0",
          detail: "DatabaseService pendiente",
          tone: "neutral",
        },
        {
          id: "delinquency-rate",
          title: "Morosidad",
          value: "0%",
          detail: "DatabaseService pendiente",
          tone: "success",
        },
        {
          id: "monthly-income",
          title: "Ingresos del mes",
          value: "$ 0",
          detail: "DatabaseService pendiente",
          tone: "success",
        },
        {
          id: "annual-income",
          title: "Ingresos del año",
          value: "$ 0",
          detail: "DatabaseService pendiente",
          tone: "success",
        },
        {
          id: "new-players",
          title: "Jugadores nuevos",
          value: "0",
          detail: "DatabaseService pendiente",
          tone: "neutral",
        },
        {
          id: "dropped-players",
          title: "Jugadores dados de baja",
          value: "0",
          detail: "DatabaseService pendiente",
          tone: "neutral",
        },
      ],
      charts: {
        feeStatus: [
          { label: "Cobradas", value: 0 },
          { label: "Pendientes", value: 0 },
          { label: "Vencidas", value: 0 },
        ],
        playerStatus: [
          { label: "Al dia", value: 0 },
          { label: "Con pendientes", value: 0 },
          { label: "Morosos", value: 0 },
        ],
        monthlyCollections: [],
        annualComparison: [],
        playerLifecycle: [],
        delinquencyTrend: [],
      },
      players: [],
      emptyState: {
        title: "Servicio de base de datos pendiente",
        description:
          "El contrato IDataService ya esta listo. Implementa DatabaseService cuando migres la persistencia.",
      },
      source: {
        provider: "postgresql",
        status: "error",
        message: "DatabaseService todavia no esta implementado.",
        cachedAt: new Date().toISOString(),
        revalidateSeconds: 0,
      },
    };
  }

  async getCashFlowData(
    period = new Date().toISOString().slice(0, 7),
  ): Promise<CashFlowData> {
    return {
      period,
      metrics: [
        {
          id: "income",
          title: "Ingresos",
          value: "$ 0",
          detail: "DatabaseService pendiente",
          tone: "success",
        },
        {
          id: "expenses",
          title: "Gastos",
          value: "$ 0",
          detail: "DatabaseService pendiente",
          tone: "warning",
        },
        {
          id: "balance",
          title: "Balance",
          value: "$ 0",
          detail: "DatabaseService pendiente",
          tone: "neutral",
        },
        {
          id: "cash",
          title: "Saldo",
          value: "$ 0",
          detail: "DatabaseService pendiente",
          tone: "neutral",
        },
      ],
      charts: {
        monthly: [],
        annual: [],
        monthlySeries: [],
        conceptBreakdown: [],
        matrixRows: [],
      },
      transactions: [],
      scenario: "real",
      expectedFeeIncome: 0,
      additionalIncome: 0,
      additionalExpenses: 0,
      emptyState: {
        title: "Cash Flow pendiente",
        description:
          "El contrato IDataService ya esta listo. Implementa DatabaseService cuando migres la persistencia.",
      },
      draft: {
        scenario: "draft",
        metrics: [],
        charts: {
          monthly: [],
          annual: [],
          monthlySeries: [],
          conceptBreakdown: [],
          matrixRows: [],
        },
        transactions: [],
        expectedFeeIncome: 0,
        additionalIncome: 0,
        additionalExpenses: 0,
        emptyState: {
          title: "Cash Flow borrador pendiente",
          description:
            "El contrato IDataService ya esta listo para escenarios borrador en PostgreSQL.",
        },
      },
      source: {
        provider: "postgresql",
        status: "error",
        message: "DatabaseService todavia no esta implementado.",
        cachedAt: new Date().toISOString(),
        revalidateSeconds: 0,
      },
    };
  }

  async upsertCashFlowTransaction(): Promise<void> {
    throw new DataServiceError(
      "DatabaseService todavia no esta implementado.",
      "UNSUPPORTED_DATA_SOURCE",
    );
  }

  async deleteCashFlowTransaction(): Promise<void> {
    throw new DataServiceError(
      "DatabaseService todavia no esta implementado.",
      "UNSUPPORTED_DATA_SOURCE",
    );
  }

  async getPlayersData(): Promise<PlayerDirectoryData> {
    return {
      players: [],
      emptyState: {
        title: "Jugadores pendiente",
        description:
          "El contrato IDataService ya esta listo para administrar jugadores en PostgreSQL.",
      },
      source: {
        provider: "postgresql",
        status: "error",
        message: "DatabaseService todavia no esta implementado.",
        cachedAt: new Date().toISOString(),
        revalidateSeconds: 0,
      },
    };
  }

  async upsertPlayer(): Promise<void> {
    throw new DataServiceError(
      "DatabaseService todavia no esta implementado.",
      "UNSUPPORTED_DATA_SOURCE",
    );
  }

  async replacePlayers(): Promise<void> {
    throw new DataServiceError(
      "DatabaseService todavia no esta implementado.",
      "UNSUPPORTED_DATA_SOURCE",
    );
  }

  async deletePlayer(): Promise<void> {
    throw new DataServiceError(
      "DatabaseService todavia no esta implementado.",
      "UNSUPPORTED_DATA_SOURCE",
    );
  }

  async getFeeCalculatorData(
    period = new Date().toISOString().slice(0, 7),
  ): Promise<FeeCalculatorData> {
    const previousPeriod = getPreviousPeriod(period);

    return {
      period,
      previousPeriod,
      costs: [],
      actuals: [],
      adjustments: [],
      players: [],
      refundPolicy: [],
      playerCalculations: [],
      matchSummaries: [],
      summary: {
        period,
        previousPeriod,
        quotaStatus: "undefined",
        quotaStatusReasons: ["DatabaseService todavía no calcula la cuota."],
        plannedCurrentQuota: 0,
        previousBaseQuota: 0,
        previousCostVariance: 0,
        baseQuota: 0,
        activeCosts: 0,
        players: 0,
        totalMatchesPreviousPeriod: 0,
        totalLocalMatchesPreviousPeriod: 0,
        coachHoursPreviousPeriod: 0,
      },
      emptyState: {
        title: "Calculador pendiente",
        description:
          "El contrato IDataService ya esta listo para implementar el calculador en PostgreSQL.",
      },
      source: {
        provider: "postgresql",
        status: "error",
        message: "DatabaseService todavia no esta implementado.",
        cachedAt: new Date().toISOString(),
        revalidateSeconds: 0,
      },
    };
  }

  async upsertFeeCalculatorCost(): Promise<void> {
    throw new DataServiceError(
      "DatabaseService todavia no esta implementado.",
      "UNSUPPORTED_DATA_SOURCE",
    );
  }

  async deleteFeeCalculatorCost(): Promise<void> {
    throw new DataServiceError(
      "DatabaseService todavia no esta implementado.",
      "UNSUPPORTED_DATA_SOURCE",
    );
  }

  async resetFeeCalculatorCosts(): Promise<void> {
    throw new DataServiceError(
      "DatabaseService todavia no esta implementado.",
      "UNSUPPORTED_DATA_SOURCE",
    );
  }

  async updateFeeCalculatorActual(): Promise<void> {
    throw new DataServiceError(
      "DatabaseService todavia no esta implementado.",
      "UNSUPPORTED_DATA_SOURCE",
    );
  }

  async updateFeeCalculatorPlayerStatus(): Promise<void> {
    throw new DataServiceError(
      "DatabaseService todavia no esta implementado.",
      "UNSUPPORTED_DATA_SOURCE",
    );
  }

  async updateFeeRefundPolicy(): Promise<void> {
    throw new DataServiceError(
      "DatabaseService todavia no esta implementado.",
      "UNSUPPORTED_DATA_SOURCE",
    );
  }

  async getExportData(dataset: ExportDataset): Promise<ExportData> {
    const titles: Record<ExportDataset, string> = {
      "cash-flow": "Cash Flow",
      fees: "Cuotas",
      income: "Ingresos",
      players: "Jugadores",
    };

    return {
      dataset,
      title: titles[dataset],
      fileName: dataset,
      generatedAt: new Date().toISOString(),
      columns: [],
      rows: [],
    };
  }

  async getPlayerProfile(): Promise<PlayerProfile | null> {
    return null;
  }

  async updatePlayerFeeStatus(): Promise<void> {
    throw new DataServiceError(
      "DatabaseService todavia no esta implementado.",
      "UNSUPPORTED_DATA_SOURCE",
    );
  }

  async getFixtureMatchScheduleOverrides() {
    return [];
  }

  async updateFixtureMatchSchedule(): Promise<void> {
    throw new DataServiceError(
      "DatabaseService todavia no esta implementado.",
      "UNSUPPORTED_DATA_SOURCE",
    );
  }

  async getPlayerOfMatchData(): Promise<PlayerOfMatchData> {
    return {
      matches: [],
      rankings: {
        attendance: [],
        mvp: [],
        streaks: [],
      },
      emptyState: {
        title: "MVP pendiente",
        description:
          "El contrato IDataService ya esta listo para implementar votaciones en PostgreSQL.",
      },
      source: {
        provider: "postgresql",
        status: "error",
        message: "DatabaseService todavia no esta implementado.",
        cachedAt: new Date().toISOString(),
        revalidateSeconds: 0,
      },
    };
  }

  async submitPlayerOfMatchVote(): Promise<void> {
    throw new DataServiceError(
      "DatabaseService todavia no esta implementado.",
      "UNSUPPORTED_DATA_SOURCE",
    );
  }

  async updatePlayerOfMatchMatch(): Promise<void> {
    throw new DataServiceError(
      "DatabaseService todavia no esta implementado.",
      "UNSUPPORTED_DATA_SOURCE",
    );
  }

  async getPremiumData(): Promise<PremiumData> {
    return {
      summary: {
        unreadNotifications: 0,
        queuedReminders: 0,
        failedReminders: 0,
        pendingPayments: 0,
        approvedPayments: 0,
        auditEvents: 0,
        errorLogs: 0,
      },
      audit: [],
      logs: [
        {
          id: "database-service-placeholder",
          timestamp: new Date().toISOString(),
          level: "warning",
          source: "DatabaseService",
          message: "DatabaseService todavia no esta implementado.",
          context: {
            module: "premium",
          },
        },
      ],
      notifications: [],
      reminders: [],
      payments: [],
      source: {
        provider: "postgresql",
        status: "error",
        message: "DatabaseService todavia no esta implementado.",
        cachedAt: new Date().toISOString(),
        revalidateSeconds: 0,
      },
    };
  }

  async getNotifications() {
    return [];
  }

  async recordAuditEvent(): Promise<void> {
    throw new DataServiceError(
      "DatabaseService todavia no esta implementado.",
      "UNSUPPORTED_DATA_SOURCE",
    );
  }

  async createNotification(): Promise<void> {
    throw new DataServiceError(
      "DatabaseService todavia no esta implementado.",
      "UNSUPPORTED_DATA_SOURCE",
    );
  }

  async markNotificationRead(): Promise<void> {
    throw new DataServiceError(
      "DatabaseService todavia no esta implementado.",
      "UNSUPPORTED_DATA_SOURCE",
    );
  }

  async createReminderJob(): Promise<void> {
    throw new DataServiceError(
      "DatabaseService todavia no esta implementado.",
      "UNSUPPORTED_DATA_SOURCE",
    );
  }

  async upsertPaymentRecord(): Promise<void> {
    throw new DataServiceError(
      "DatabaseService todavia no esta implementado.",
      "UNSUPPORTED_DATA_SOURCE",
    );
  }

  async upsertPushSubscription(): Promise<void> {
    throw new DataServiceError(
      "DatabaseService todavia no esta implementado.",
      "UNSUPPORTED_DATA_SOURCE",
    );
  }

  async deletePushSubscription(): Promise<void> {
    throw new DataServiceError(
      "DatabaseService todavia no esta implementado.",
      "UNSUPPORTED_DATA_SOURCE",
    );
  }

  async getPushSubscriptions(): Promise<PushSubscriptionRecord[]> {
    return [];
  }

  async getPushSubscriptionsForUser(): Promise<PushSubscriptionRecord[]> {
    return [];
  }

  async getPushSubscriptionsForPlayer(): Promise<PushSubscriptionRecord[]> {
    return [];
  }
}

function getPreviousPeriod(period: string) {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(year, month - 2, 1);

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
