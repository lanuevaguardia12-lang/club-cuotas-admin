import "server-only";

import { DEFAULT_APP_SETTINGS } from "@/lib/app-settings";
import { DataServiceError } from "@/services/data-service-error";
import type { IDataService } from "@/services/IDataService";
import type { CashFlowData, DashboardData, PlayerProfile } from "@/types/dashboard";
import type { ExportData, ExportDataset } from "@/types/export";
import type { FeeCalculatorData } from "@/types/fee-calculator";
import type { PremiumData } from "@/types/premium";
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

  async getCashFlowData(): Promise<CashFlowData> {
    return {
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
      },
      emptyState: {
        title: "Cash Flow pendiente",
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
      refundPolicy: [],
      playerCalculations: [],
      matchSummaries: [],
      summary: {
        period,
        previousPeriod,
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

  async updateFeeCalculatorActual(): Promise<void> {
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
}

function getPreviousPeriod(period: string) {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(year, month - 2, 1);

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
