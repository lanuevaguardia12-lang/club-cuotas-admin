import "server-only";

import { revalidateTag, unstable_cache } from "next/cache";
import { google, type sheets_v4 } from "googleapis";

import {
  APP_SETTINGS_ROWS,
  DEFAULT_APP_SETTINGS,
  normalizeAppSettings,
  normalizeHexColor,
  parseBooleanValue,
} from "@/lib/app-settings";
import { DataServiceError } from "@/services/data-service-error";
import type { IDataService } from "@/services/IDataService";
import type {
  AnnualComparisonPoint,
  CashFlowAnnualPoint,
  CashFlowConceptBreakdownPoint,
  CashFlowConceptSeries,
  CashFlowData,
  CashFlowMetric,
  CashFlowMonthlyPoint,
  CashFlowTransaction,
  CashFlowTransactionType,
  ChartDatum,
  DashboardData,
  DashboardMetric,
  DelinquencyTrendPoint,
  MonthlyCollectionPoint,
  PlayerFeeHistoryItem,
  PlayerLifecyclePoint,
  PlayerPaymentStatus,
  PlayerProfile,
  PlayerTableRow,
  PlayerYearMonth,
  UpsertCashFlowTransactionInput,
  UpdatePlayerFeeStatusInput,
} from "@/types/dashboard";
import type {
  AppSettings,
  AppSettingsData,
  UpdateAppSettingsInput,
} from "@/types/settings";
import type { ExportColumn, ExportData, ExportDataset, ExportRow } from "@/types/export";
import type {
  FeeCalculatorActual,
  FeeCalculatorAdjustment,
  FeeCalculatorCost,
  FeeCalculatorCostType,
  FeeCalculatorData,
  FeeCalculatorPlayer,
  FeeMatchDetail,
  FeePlayerCalculation,
  FeeRefundPolicyRule,
  UpdateFeeCalculatorActualInput,
  UpdateFeeCalculatorPlayerStatusInput,
  UpdateFeeRefundPolicyInput,
  UpsertFeeCalculatorCostInput,
} from "@/types/fee-calculator";
import type {
  AppLogEntry,
  AppLogLevel,
  AppNotification,
  AuditAction,
  AuditActor,
  AuditEntityType,
  AuditEvent,
  CreateAuditEventInput,
  CreateNotificationInput,
  CreateReminderJobInput,
  NotificationStatus,
  NotificationType,
  PaymentProvider,
  PaymentRecord,
  PaymentStatus,
  PremiumData,
  ReminderJob,
  ReminderStatus,
  UpsertPaymentRecordInput,
} from "@/types/premium";
import type {
  PlayerDirectoryData,
  PlayerDirectoryItem,
  PlayerDirectoryStatus,
  UpsertPlayerInput,
} from "@/types/players";

type RevalidateTagWithProfile = (
  tag: string,
  profile: "max" | { expire?: number },
) => void;

const revalidateTagWithProfile = revalidateTag as unknown as RevalidateTagWithProfile;

function revalidateGoogleSheetsTag(tag: string) {
  try {
    revalidateTagWithProfile(tag, "max");
  } catch {
    // Revalidation is a cache optimization. Data writes must still succeed in
    // scripts, tests, or server contexts where Next has no static generation store.
  }
}

interface GoogleSheetsConfig {
  spreadsheetId?: string;
  clubSpreadsheetId?: string;
  clientEmail?: string;
  privateKey?: string;
  playersRange: string;
  feesRange: string;
  cashFlowRange: string;
  settingsRange: string;
  auditRange: string;
  logsRange: string;
  notificationsRange: string;
  remindersRange: string;
  paymentsRange: string;
  feeCalculatorCostsRange: string;
  feeCalculatorActualsRange: string;
  feeCalculatorPlayerStatusesRange: string;
  matchesSpreadsheetId?: string;
  matchesRange: string;
  formResponsesRange: string;
  expensesRange: string;
  refundPolicyRange: string;
  cacheTtlSeconds: number;
}

interface SheetRecord {
  [key: string]: string;
}

interface PlayerRecord {
  id: string;
  name: string;
  category: string;
  phone: string;
  email: string;
  monthlyFee: number;
  observations: string;
  status: string;
  joinedAt?: string;
  leftAt?: string;
}

type FeeStatus = "paid" | "pending" | "overdue";

interface FeeRecord {
  id: string;
  playerId: string;
  period: string;
  amount: number;
  status: FeeStatus;
  dueDate?: string;
  paidAt?: string;
}

interface CashFlowTransactionRecord extends CashFlowTransaction {
  createdAt?: string;
  updatedAt?: string;
}

interface MatchRecord {
  id: string;
  date: string;
  period: string;
  rival: string;
  players: string[];
  venue: string;
  coachAttended: boolean;
}

interface PlayerExpenseCredit {
  playerName: string;
  period: string;
  amount: number;
}

interface FeeCalculatorPlayerStatusRecord {
  id: string;
  playerId: string;
  playerName: string;
  period: string;
  status: PlayerDirectoryStatus;
  notes: string;
  updatedAt: string;
}

interface DashboardRecords {
  players: PlayerRecord[];
  fees: FeeRecord[];
  message: string;
}

const DEFAULT_PLAYERS_RANGE = "Jugadores!A:Z";
const DEFAULT_FEES_RANGE = "Cuotas!A:Z";
const DEFAULT_CASH_FLOW_RANGE = "CashFlow!A:Z";
const DEFAULT_SETTINGS_RANGE = "Configuracion!A:B";
const DEFAULT_AUDIT_RANGE = "Auditoria!A:Z";
const DEFAULT_LOGS_RANGE = "Logs!A:Z";
const DEFAULT_NOTIFICATIONS_RANGE = "Notificaciones!A:Z";
const DEFAULT_REMINDERS_RANGE = "Recordatorios!A:Z";
const DEFAULT_PAYMENTS_RANGE = "Pagos!A:Z";
const DEFAULT_FEE_CALCULATOR_COSTS_RANGE = "CalculadoraCostos!A:Z";
const DEFAULT_FEE_CALCULATOR_ACTUALS_RANGE = "CalculadoraReales!A:Z";
const DEFAULT_FEE_CALCULATOR_PLAYER_STATUSES_RANGE = "CalculadoraJugadores!A:Z";
const DEFAULT_MATCHES_RANGE = "Partidos jugados formulario!A:Z";
const DEFAULT_FORM_RESPONSES_RANGE = "Respuestas de formulario!A:Z";
const DEFAULT_EXPENSES_RANGE = "Gastos nueva guardia!A:Z";
const DEFAULT_REFUND_POLICY_RANGE = "Politica devoluciones!A:C";
const DEFAULT_CACHE_TTL_SECONDS = 300;

const CLUB_PLAYERS_RANGE = "Listado jugadores!A:Z";
const CLUB_TRACKING_RANGE = "Seguimiento!A:Z";
const CLUB_FINAL_FEE_RANGE = "Cuota final por jugador!A:Z";
const CLUB_FORM_RESPONSES_RANGE = DEFAULT_FORM_RESPONSES_RANGE;
const CLUB_FORM_RESPONSE_RANGE = "Respuesta de formulario!A:Z";

const auditHeaders = [
  "id",
  "timestamp",
  "actor_id",
  "actor_name",
  "actor_role",
  "action",
  "entity_type",
  "entity_id",
  "summary",
  "metadata",
];

const notificationHeaders = [
  "id",
  "created_at",
  "title",
  "message",
  "type",
  "status",
  "target_role",
  "read_at",
];

const reminderHeaders = [
  "id",
  "created_at",
  "scheduled_for",
  "period",
  "player_id",
  "player_name",
  "phone",
  "payment_status",
  "message",
  "status",
  "sent_at",
  "error",
];

const paymentHeaders = [
  "id",
  "provider",
  "external_id",
  "player_id",
  "player_name",
  "period",
  "amount",
  "currency",
  "status",
  "checkout_url",
  "created_at",
  "updated_at",
  "raw_event_type",
];

const cashFlowHeaders = [
  "id",
  "fecha",
  "periodo",
  "tipo",
  "concepto",
  "monto",
  "repite_mensual",
  "vigencia_desde",
  "vigencia_hasta",
  "notas",
  "activo",
  "creado_en",
  "actualizado_en",
];

const playerDirectoryHeaders = [
  "id",
  "nombre",
  "telefono",
  "email",
  "categoria",
  "observaciones",
  "estado",
  "fecha_alta",
  "fecha_baja",
  "creado_en",
  "actualizado_en",
];

const feeCalculatorCostHeaders = [
  "id",
  "nombre",
  "tipo",
  "vigencia_desde",
  "vigencia_hasta",
  "monto",
  "repite_mensual",
  "dividir_entre",
  "cantidad_estimada",
  "notas",
  "activo",
  "creado_en",
  "actualizado_en",
];

const feeCalculatorActualHeaders = [
  "id",
  "costo_id",
  "periodo",
  "cantidad_real",
  "notas",
  "actualizado_en",
];

const feeCalculatorPlayerStatusHeaders = [
  "id",
  "jugador_id",
  "jugador",
  "periodo",
  "estado",
  "notas",
  "actualizado_en",
];

const feeRefundPolicyHeaders = ["desde", "hasta", "devolucion"];

export class GoogleSheetsService implements IDataService {
  private readonly config: GoogleSheetsConfig;

  constructor(config: Partial<GoogleSheetsConfig> = {}) {
    const spreadsheetId =
      config.spreadsheetId ?? process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    const matchesSpreadsheetId =
      config.matchesSpreadsheetId ??
      process.env.GOOGLE_SHEETS_MATCHES_SPREADSHEET_ID ??
      spreadsheetId;
    const clubSpreadsheetId =
      config.clubSpreadsheetId ??
      process.env.GOOGLE_SHEETS_CLUB_SPREADSHEET_ID ??
      process.env.GOOGLE_SHEETS_PAYMENTS_SPREADSHEET_ID ??
      spreadsheetId;

    this.config = {
      spreadsheetId,
      clubSpreadsheetId,
      clientEmail: config.clientEmail ?? process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
      privateKey: config.privateKey ?? process.env.GOOGLE_SHEETS_PRIVATE_KEY,
      playersRange:
        config.playersRange ??
        process.env.GOOGLE_SHEETS_PLAYERS_RANGE ??
        DEFAULT_PLAYERS_RANGE,
      feesRange:
        config.feesRange ?? process.env.GOOGLE_SHEETS_FEES_RANGE ?? DEFAULT_FEES_RANGE,
      cashFlowRange:
        config.cashFlowRange ??
        process.env.GOOGLE_SHEETS_CASH_FLOW_RANGE ??
        DEFAULT_CASH_FLOW_RANGE,
      settingsRange:
        config.settingsRange ??
        process.env.GOOGLE_SHEETS_SETTINGS_RANGE ??
        DEFAULT_SETTINGS_RANGE,
      auditRange:
        config.auditRange ?? process.env.GOOGLE_SHEETS_AUDIT_RANGE ?? DEFAULT_AUDIT_RANGE,
      logsRange:
        config.logsRange ?? process.env.GOOGLE_SHEETS_LOGS_RANGE ?? DEFAULT_LOGS_RANGE,
      notificationsRange:
        config.notificationsRange ??
        process.env.GOOGLE_SHEETS_NOTIFICATIONS_RANGE ??
        DEFAULT_NOTIFICATIONS_RANGE,
      remindersRange:
        config.remindersRange ??
        process.env.GOOGLE_SHEETS_REMINDERS_RANGE ??
        DEFAULT_REMINDERS_RANGE,
      paymentsRange:
        config.paymentsRange ??
        process.env.GOOGLE_SHEETS_PAYMENTS_RANGE ??
        DEFAULT_PAYMENTS_RANGE,
      feeCalculatorCostsRange:
        config.feeCalculatorCostsRange ??
        process.env.GOOGLE_SHEETS_FEE_CALCULATOR_COSTS_RANGE ??
        DEFAULT_FEE_CALCULATOR_COSTS_RANGE,
      feeCalculatorActualsRange:
        config.feeCalculatorActualsRange ??
        process.env.GOOGLE_SHEETS_FEE_CALCULATOR_ACTUALS_RANGE ??
        DEFAULT_FEE_CALCULATOR_ACTUALS_RANGE,
      feeCalculatorPlayerStatusesRange:
        config.feeCalculatorPlayerStatusesRange ??
        process.env.GOOGLE_SHEETS_FEE_CALCULATOR_PLAYER_STATUSES_RANGE ??
        DEFAULT_FEE_CALCULATOR_PLAYER_STATUSES_RANGE,
      matchesSpreadsheetId,
      matchesRange:
        config.matchesRange ??
        process.env.GOOGLE_SHEETS_MATCHES_RANGE ??
        DEFAULT_MATCHES_RANGE,
      formResponsesRange:
        config.formResponsesRange ??
        process.env.GOOGLE_SHEETS_FORM_RESPONSES_RANGE ??
        DEFAULT_FORM_RESPONSES_RANGE,
      expensesRange:
        config.expensesRange ??
        process.env.GOOGLE_SHEETS_EXPENSES_RANGE ??
        process.env.GOOGLE_SHEETS_CLUB_EXPENSES_RANGE ??
        DEFAULT_EXPENSES_RANGE,
      refundPolicyRange:
        config.refundPolicyRange ??
        process.env.GOOGLE_SHEETS_REFUND_POLICY_RANGE ??
        DEFAULT_REFUND_POLICY_RANGE,
      cacheTtlSeconds:
        config.cacheTtlSeconds ??
        parseCacheTtl(process.env.GOOGLE_SHEETS_CACHE_TTL_SECONDS),
    };
  }

  async getAppSettings(): Promise<AppSettingsData> {
    const cachedAt = new Date().toISOString();

    try {
      this.assertConfigured();
      const rows = await this.readCachedSettingsRows();
      const settings = mapRowsToAppSettings(rows);

      return {
        settings,
        source: {
          provider: "google-sheets",
          status: rows.length === 0 ? "empty" : "ready",
          message:
            rows.length === 0
              ? "Google Sheets conectado, sin configuracion cargada."
              : "Configuracion obtenida desde Google Sheets.",
          cachedAt,
          revalidateSeconds: this.config.cacheTtlSeconds,
        },
      };
    } catch (error) {
      const serviceError = normalizeGoogleSheetsError(error);
      const isOptionalSettingsError =
        serviceError.code === "GOOGLE_SHEETS_ERROR" ||
        serviceError.code === "CONFIGURATION_ERROR";

      if (isOptionalSettingsError) {
        return {
          settings: DEFAULT_APP_SETTINGS,
          source: {
            provider: "google-sheets",
            status: "ready",
            message:
              "Google Sheets conectado. Se usa configuracion por defecto porque no existe la hoja Configuracion.",
            cachedAt,
            revalidateSeconds: this.config.cacheTtlSeconds,
          },
        };
      }

      return {
        settings: DEFAULT_APP_SETTINGS,
        source: {
          provider: "google-sheets",
          status: "error",
          message: serviceError.message,
          cachedAt,
          revalidateSeconds: this.config.cacheTtlSeconds,
        },
      };
    }
  }

  async updateAppSettings(input: UpdateAppSettingsInput): Promise<void> {
    this.assertConfigured();

    const settings = normalizeAppSettings(input);
    const sheets = this.createSheetsClient();
    const sheetPrefix = getSheetPrefix(this.config.settingsRange);

    await sheets.spreadsheets.values.update({
      spreadsheetId: this.config.spreadsheetId,
      range: `${sheetPrefix}!A:B`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: buildSettingsRows(settings),
      },
    });

    invalidateSettingsCache();
  }

  async getDashboardData(period = getCurrentPeriod()): Promise<DashboardData> {
    const cachedAt = new Date().toISOString();

    try {
      this.assertConfigured();
      assertValidPeriod(period);
      const { players, fees, message } = await this.readDashboardRecords();
      const feeCalculatorData = await this.getFeeCalculatorData(period);

      return buildDashboardData({
        period,
        players,
        fees,
        feeCalculations:
          feeCalculatorData.source.status === "error"
            ? []
            : feeCalculatorData.playerCalculations,
        status: players.length === 0 && fees.length === 0 ? "empty" : "ready",
        message:
          players.length === 0 && fees.length === 0
            ? "Google Sheets conectado, sin jugadores ni cuotas cargadas."
            : message,
        cachedAt,
        revalidateSeconds: this.config.cacheTtlSeconds,
      });
    } catch (error) {
      const serviceError = normalizeGoogleSheetsError(error);

      return buildFallbackDashboardData({
        period,
        status: "error",
        message: serviceError.message,
        cachedAt,
        revalidateSeconds: this.config.cacheTtlSeconds,
      });
    }
  }

  async getCashFlowData(period = getCurrentPeriod()): Promise<CashFlowData> {
    const cachedAt = new Date().toISOString();

    try {
      this.assertConfigured();
      assertValidPeriod(period);
      const transactions = await this.readCashFlowTransactions();
      const feeIncomeByPeriod = await this.readFeeIncomeByPeriod(
        getCashFlowProjectionPeriods(period),
      );
      const expectedFeeIncome = feeIncomeByPeriod.get(period) ?? 0;

      return buildCashFlowData({
        period,
        transactions,
        feeIncomeByPeriod,
        status: transactions.length === 0 && expectedFeeIncome === 0 ? "empty" : "ready",
        message:
          transactions.length === 0 && expectedFeeIncome === 0
            ? "Google Sheets conectado, sin movimientos ni cuotas calculadas."
            : "Cash Flow obtenido desde Google Sheets y calculador de cuota.",
        cachedAt,
        revalidateSeconds: this.config.cacheTtlSeconds,
      });
    } catch (error) {
      const serviceError = normalizeGoogleSheetsError(error);

      return buildFallbackCashFlowData({
        period,
        status: "error",
        message: serviceError.message,
        cachedAt,
        revalidateSeconds: this.config.cacheTtlSeconds,
      });
    }
  }

  async upsertCashFlowTransaction(input: UpsertCashFlowTransactionInput): Promise<void> {
    this.assertConfigured();

    const spreadsheetId = this.config.spreadsheetId;

    if (!spreadsheetId) {
      throw new DataServiceError(
        "GOOGLE_SHEETS_SPREADSHEET_ID no esta configurado.",
        "CONFIGURATION_ERROR",
      );
    }

    const transaction = normalizeCashFlowTransactionInput(input);
    const rows = await this.readOptionalValuesFromSpreadsheet(
      spreadsheetId,
      this.config.cashFlowRange,
    );
    const sheets = this.createSheetsClient();
    const sheetPrefix = getSheetPrefix(this.config.cashFlowRange);
    const now = new Date().toISOString();

    await this.ensureSheetForRange(this.config.cashFlowRange, spreadsheetId);

    if (rows.length === 0) {
      const id = transaction.id || createId("cash-flow");

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetPrefix}!A:M`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [
            cashFlowHeaders,
            buildCashFlowWritableRow(cashFlowHeaders, {
              ...transaction,
              id,
              active: true,
              source: "manual",
              createdAt: now,
              updatedAt: now,
            }),
          ],
        },
      });
      invalidateCashFlowCache();
      return;
    }

    const [headerRow = [], ...dataRows] = rows;
    let headers = normalizeWritableHeaders(headerRow, cashFlowHeaders);
    headers = await this.ensureWritableHeaders(
      spreadsheetId,
      sheetPrefix,
      headers,
      cashFlowHeaders,
    );
    const idIndex = findHeaderIndex(headers, ["id", "movimiento_id", "transaction_id"]);
    const targetId = transaction.id || createId("cash-flow");
    const targetRowIndex =
      idIndex >= 0
        ? dataRows.findIndex((row) => String(row[idIndex] ?? "").trim() === targetId)
        : -1;

    if (targetRowIndex >= 0) {
      const existing = mapRowsToCashFlowTransactions([
        headers,
        dataRows[targetRowIndex],
      ])[0];
      const spreadsheetRow = targetRowIndex + 2;

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetPrefix}!A${spreadsheetRow}:${toColumnName(headers.length - 1)}${spreadsheetRow}`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [
            buildCashFlowWritableRow(headers, {
              ...transaction,
              id: targetId,
              active: existing?.active ?? true,
              source: "manual",
              createdAt: existing?.createdAt || now,
              updatedAt: now,
            }),
          ],
        },
      });
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: this.config.cashFlowRange,
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: {
          values: [
            buildCashFlowWritableRow(headers, {
              ...transaction,
              id: targetId,
              active: true,
              source: "manual",
              createdAt: now,
              updatedAt: now,
            }),
          ],
        },
      });
    }

    invalidateCashFlowCache();
  }

  async deleteCashFlowTransaction(transactionId: string): Promise<void> {
    this.assertConfigured();

    const spreadsheetId = this.config.spreadsheetId;

    if (!spreadsheetId) {
      throw new DataServiceError(
        "GOOGLE_SHEETS_SPREADSHEET_ID no esta configurado.",
        "CONFIGURATION_ERROR",
      );
    }

    const values = await this.readOptionalValuesFromSpreadsheet(
      spreadsheetId,
      this.config.cashFlowRange,
    );

    if (values.length === 0) {
      return;
    }

    const [headerRow = [], ...dataRows] = values;
    const sheets = this.createSheetsClient();
    const sheetPrefix = getSheetPrefix(this.config.cashFlowRange);
    let headers = normalizeWritableHeaders(headerRow, cashFlowHeaders);
    headers = await this.ensureWritableHeaders(
      spreadsheetId,
      sheetPrefix,
      headers,
      cashFlowHeaders,
    );
    const idIndex = findHeaderIndex(headers, ["id", "movimiento_id", "transaction_id"]);
    const activeIndex = findHeaderIndex(headers, ["activo", "active"]);
    const updatedAtIndex = findHeaderIndex(headers, [
      "actualizado_en",
      "updated_at",
      "updated",
    ]);
    const targetRowIndex =
      idIndex >= 0
        ? dataRows.findIndex((row) => String(row[idIndex] ?? "").trim() === transactionId)
        : -1;

    if (targetRowIndex < 0 || activeIndex < 0) {
      return;
    }

    const spreadsheetRow = targetRowIndex + 2;
    const data = [
      {
        range: `${sheetPrefix}!${toColumnName(activeIndex)}${spreadsheetRow}`,
        values: [["false"]],
      },
    ];

    if (updatedAtIndex >= 0) {
      data.push({
        range: `${sheetPrefix}!${toColumnName(updatedAtIndex)}${spreadsheetRow}`,
        values: [[new Date().toISOString()]],
      });
    }

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data,
      },
    });
    invalidateCashFlowCache();
  }

  async getPlayersData(): Promise<PlayerDirectoryData> {
    const cachedAt = new Date().toISOString();

    try {
      this.assertConfigured();

      const rows = await this.readCachedPlayerDirectoryRows();
      const players = mapRowsToPlayerDirectoryItems(rows);

      return {
        players,
        emptyState: {
          title: players.length === 0 ? "Sin jugadores cargados" : "Base de jugadores",
          description:
            players.length === 0
              ? "Cargá jugadores para que el calculador pueda calcular cuotas aunque todavía no hayan jugado partidos."
              : "Jugadores administrados desde el ABM de la app.",
        },
        source: {
          provider: "google-sheets",
          status: players.length === 0 ? "empty" : "ready",
          message:
            players.length === 0
              ? "Google Sheets conectado, sin jugadores cargados."
              : "Jugadores obtenidos desde Google Sheets.",
          cachedAt,
          revalidateSeconds: this.config.cacheTtlSeconds,
        },
      };
    } catch (error) {
      const serviceError = normalizeGoogleSheetsError(error);

      return {
        players: [],
        emptyState: {
          title: "No se pudieron obtener jugadores",
          description: serviceError.message,
        },
        source: {
          provider: "google-sheets",
          status: "error",
          message: serviceError.message,
          cachedAt,
          revalidateSeconds: this.config.cacheTtlSeconds,
        },
      };
    }
  }

  async upsertPlayer(input: UpsertPlayerInput): Promise<void> {
    this.assertConfigured();

    const spreadsheetId = this.getAppSpreadsheetId();
    const playersRange = this.getWritablePlayersRange();
    const rows = await this.readOptionalValuesFromSpreadsheet(
      spreadsheetId,
      playersRange,
    );
    const sheets = this.createSheetsClient();
    const sheetPrefix = getSheetPrefix(playersRange);
    const now = new Date().toISOString();

    await this.ensureSheetForRange(playersRange, spreadsheetId);

    if (rows.length === 0) {
      const player = normalizePlayerInput(input, new Set(), now);

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetPrefix}!A:K`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [
            playerDirectoryHeaders,
            buildPlayerDirectoryWritableRow(playerDirectoryHeaders, player),
          ],
        },
      });
      invalidatePlayersCache();
      return;
    }

    const [headerRow = [], ...dataRows] = rows;
    const headers = normalizeWritableHeaders(headerRow, playerDirectoryHeaders);
    const existingPlayers = mapRowsToPlayerDirectoryItems([headers, ...dataRows]);
    const existingIds = new Set(existingPlayers.map((player) => player.id));
    const targetId =
      input.id?.trim() ||
      createUniqueClubPlayerId(createClubPlayerId(input.name) || "player", existingIds);
    const targetRowIndex = findPlayerDirectoryRowIndex(
      headers,
      dataRows,
      targetId,
      input.name,
    );
    const existing =
      targetRowIndex >= 0
        ? mapRowsToPlayerDirectoryItems([headers, dataRows[targetRowIndex]])[0]
        : undefined;
    const player = normalizePlayerInput(input, existingIds, now, targetId, existing);

    if (targetRowIndex >= 0) {
      const spreadsheetRow = targetRowIndex + 2;

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetPrefix}!A${spreadsheetRow}:${toColumnName(headers.length - 1)}${spreadsheetRow}`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [buildPlayerDirectoryWritableRow(headers, player)],
        },
      });
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: playersRange,
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: {
          values: [buildPlayerDirectoryWritableRow(headers, player)],
        },
      });
    }

    invalidatePlayersCache();
  }

  async replacePlayers(players: UpsertPlayerInput[]): Promise<void> {
    this.assertConfigured();

    const spreadsheetId = this.getAppSpreadsheetId();
    const playersRange = this.getWritablePlayersRange();
    const sheetPrefix = getSheetPrefix(playersRange);
    const now = new Date().toISOString();
    const usedIds = new Set<string>();
    const normalizedPlayers = players.map((player) => {
      const normalized = normalizePlayerInput(
        {
          ...player,
          status: "active",
        },
        usedIds,
        now,
      );

      usedIds.add(normalized.id);

      return normalized;
    });
    const sheets = this.createSheetsClient();
    const lastColumn = toColumnName(playerDirectoryHeaders.length - 1);

    await this.ensureSheetForRange(playersRange, spreadsheetId);
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `${sheetPrefix}!A:${lastColumn}`,
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetPrefix}!A:${lastColumn}`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [
          playerDirectoryHeaders,
          ...normalizedPlayers.map((player) =>
            buildPlayerDirectoryWritableRow(playerDirectoryHeaders, player),
          ),
        ],
      },
    });

    invalidatePlayersCache();
    invalidateDashboardCache();
    invalidateFeeCalculatorCache();
    invalidateCashFlowCache();
  }

  async deletePlayer(playerId: string): Promise<void> {
    this.assertConfigured();

    const spreadsheetId = this.getAppSpreadsheetId();
    const playersRange = this.getWritablePlayersRange();
    const rows = await this.readOptionalValuesFromSpreadsheet(
      spreadsheetId,
      playersRange,
    );

    if (rows.length === 0) {
      return;
    }

    const [headerRow = [], ...dataRows] = rows;
    const headers = normalizeWritableHeaders(headerRow, playerDirectoryHeaders);
    const targetRowIndex = findPlayerDirectoryRowIndex(headers, dataRows, playerId);

    if (targetRowIndex < 0) {
      return;
    }

    const existing = mapRowsToPlayerDirectoryItems([
      headers,
      dataRows[targetRowIndex],
    ])[0];

    if (!existing) {
      return;
    }

    const sheets = this.createSheetsClient();
    const sheetPrefix = getSheetPrefix(playersRange);
    const spreadsheetRow = targetRowIndex + 2;

    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `${sheetPrefix}!A${spreadsheetRow}:${toColumnName(headers.length - 1)}${spreadsheetRow}`,
    });

    invalidatePlayersCache();
  }

  async getFeeCalculatorData(period = getCurrentPeriod()): Promise<FeeCalculatorData> {
    const cachedAt = new Date().toISOString();

    try {
      this.assertConfigured();
      assertValidPeriod(period);

      const [
        {
          costsRows,
          actualsRows,
          playerStatusRows,
          refundPolicyRows,
          matchRows,
          expenseRows,
        },
        cachedPlayersRows,
      ] = await Promise.all([
        this.readFeeCalculatorRows(),
        this.readCachedPlayerDirectoryRows(),
      ]);
      const playersRows =
        cachedPlayersRows.length > 0
          ? cachedPlayersRows
          : await this.readPlayerDirectoryRows(this.getAppSpreadsheetId()).catch(
              () => cachedPlayersRows,
            );
      const players = mapRowsToPlayers(playersRows);
      const costs = mapRowsToFeeCalculatorCosts(costsRows);
      const actuals = mapRowsToFeeCalculatorActuals(actualsRows);
      const playerStatuses = mapRowsToFeeCalculatorPlayerStatuses(playerStatusRows);
      const refundPolicy = mapRowsToRefundPolicy(refundPolicyRows);
      const matches = mapRowsToMatches(matchRows);
      const expenseCredits = mapClubExpenseRowsToPlayerCredits(expenseRows);

      return buildFeeCalculatorData({
        period,
        players,
        costs,
        actuals,
        playerStatuses,
        refundPolicy,
        matches,
        expenseCredits,
        status: players.length === 0 && costs.length === 0 ? "empty" : "ready",
        message:
          players.length === 0 && costs.length === 0
            ? "Google Sheets conectado, sin costos del calculador cargados."
            : "Calculador de cuota obtenido desde Google Sheets.",
        cachedAt,
        revalidateSeconds: this.config.cacheTtlSeconds,
      });
    } catch (error) {
      const serviceError = normalizeGoogleSheetsError(error);

      return buildFeeCalculatorData({
        period,
        players: [],
        costs: [],
        actuals: [],
        playerStatuses: [],
        refundPolicy: getDefaultRefundPolicy(),
        matches: [],
        expenseCredits: [],
        status: "error",
        message: serviceError.message,
        cachedAt,
        revalidateSeconds: this.config.cacheTtlSeconds,
      });
    }
  }

  async upsertFeeCalculatorCost(input: UpsertFeeCalculatorCostInput): Promise<void> {
    this.assertConfigured();

    const feeCalculatorSpreadsheetId = this.getAppSpreadsheetId();
    const cost = normalizeFeeCalculatorCostInput(input);
    const rows = await this.readOptionalValuesFromSpreadsheet(
      feeCalculatorSpreadsheetId,
      this.config.feeCalculatorCostsRange,
    );
    const now = new Date().toISOString();
    const sheets = this.createSheetsClient();
    const sheetPrefix = getSheetPrefix(this.config.feeCalculatorCostsRange);

    await this.ensureSheetForRange(
      this.config.feeCalculatorCostsRange,
      feeCalculatorSpreadsheetId,
    );

    if (rows.length === 0) {
      const id = cost.id || createId("cost");

      await sheets.spreadsheets.values.update({
        spreadsheetId: feeCalculatorSpreadsheetId,
        range: `${sheetPrefix}!A:M`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [
            feeCalculatorCostHeaders,
            buildFeeCalculatorCostWritableRow(feeCalculatorCostHeaders, {
              ...cost,
              id,
              active: true,
              createdAt: now,
              updatedAt: now,
            }),
          ],
        },
      });
      invalidateFeeCalculatorCache();
      return;
    }

    const [headerRow = [], ...dataRows] = rows;
    const headers = normalizeWritableHeaders(headerRow, feeCalculatorCostHeaders);
    const idIndex = findHeaderIndex(headers, ["id", "costo_id"]);
    const targetId = cost.id || createId("cost");
    const targetRowIndex =
      idIndex >= 0
        ? dataRows.findIndex((row) => String(row[idIndex] ?? "").trim() === targetId)
        : -1;

    if (targetRowIndex >= 0) {
      const existing = mapRowsToFeeCalculatorCostRecords([
        headers,
        dataRows[targetRowIndex],
      ])[0];
      const spreadsheetRow = targetRowIndex + 2;

      await sheets.spreadsheets.values.update({
        spreadsheetId: feeCalculatorSpreadsheetId,
        range: `${sheetPrefix}!A${spreadsheetRow}:${toColumnName(headers.length - 1)}${spreadsheetRow}`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [
            buildFeeCalculatorCostWritableRow(headers, {
              ...cost,
              id: existing?.id || targetId,
              active: existing?.active ?? true,
              createdAt: existing?.createdAt || now,
              updatedAt: now,
            }),
          ],
        },
      });
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId: feeCalculatorSpreadsheetId,
        range: `${sheetPrefix}!A:${toColumnName(headers.length - 1)}`,
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: {
          values: [
            buildFeeCalculatorCostWritableRow(headers, {
              ...cost,
              id: targetId,
              active: true,
              createdAt: now,
              updatedAt: now,
            }),
          ],
        },
      });
    }

    invalidateFeeCalculatorCache();
  }

  async deleteFeeCalculatorCost(costId: string): Promise<void> {
    this.assertConfigured();

    const feeCalculatorSpreadsheetId = this.getAppSpreadsheetId();
    const values = await this.readOptionalValuesFromSpreadsheet(
      feeCalculatorSpreadsheetId,
      this.config.feeCalculatorCostsRange,
    );

    if (values.length === 0) {
      return;
    }

    const [headerRow = [], ...dataRows] = values;
    const headers = headerRow.map((header) => normalizeHeader(String(header)));
    const idIndex = findHeaderIndex(headers, ["id", "costo_id"]);
    const activeIndex = findHeaderIndex(headers, ["activo", "active"]);
    const updatedAtIndex = findHeaderIndex(headers, [
      "actualizado_en",
      "updated_at",
      "updated",
    ]);
    const targetRowIndex =
      idIndex >= 0
        ? dataRows.findIndex((row) => String(row[idIndex] ?? "").trim() === costId)
        : -1;

    if (targetRowIndex < 0 || activeIndex < 0) {
      return;
    }

    const sheets = this.createSheetsClient();
    const sheetPrefix = getSheetPrefix(this.config.feeCalculatorCostsRange);
    const spreadsheetRow = targetRowIndex + 2;
    const data = [
      {
        range: `${sheetPrefix}!${toColumnName(activeIndex)}${spreadsheetRow}`,
        values: [["false"]],
      },
    ];

    if (updatedAtIndex >= 0) {
      data.push({
        range: `${sheetPrefix}!${toColumnName(updatedAtIndex)}${spreadsheetRow}`,
        values: [[new Date().toISOString()]],
      });
    }

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: feeCalculatorSpreadsheetId,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data,
      },
    });
    invalidateFeeCalculatorCache();
  }

  async resetFeeCalculatorCosts(): Promise<void> {
    this.assertConfigured();

    const spreadsheetId = this.getAppSpreadsheetId();
    const sheets = this.createSheetsClient();
    const costsSheetPrefix = getSheetPrefix(this.config.feeCalculatorCostsRange);
    const actualsSheetPrefix = getSheetPrefix(this.config.feeCalculatorActualsRange);

    await this.ensureSheetForRange(this.config.feeCalculatorCostsRange, spreadsheetId);
    await this.ensureSheetForRange(this.config.feeCalculatorActualsRange, spreadsheetId);
    await sheets.spreadsheets.values.batchClear({
      spreadsheetId,
      requestBody: {
        ranges: [
          `${costsSheetPrefix}!A:${toColumnName(feeCalculatorCostHeaders.length - 1)}`,
          `${actualsSheetPrefix}!A:${toColumnName(
            feeCalculatorActualHeaders.length - 1,
          )}`,
        ],
      },
    });
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data: [
          {
            range: `${costsSheetPrefix}!A:${toColumnName(
              feeCalculatorCostHeaders.length - 1,
            )}`,
            values: [feeCalculatorCostHeaders],
          },
          {
            range: `${actualsSheetPrefix}!A:${toColumnName(
              feeCalculatorActualHeaders.length - 1,
            )}`,
            values: [feeCalculatorActualHeaders],
          },
        ],
      },
    });

    invalidateFeeCalculatorCache();
    invalidateDashboardCache();
    invalidateCashFlowCache();
  }

  async updateFeeCalculatorActual(input: UpdateFeeCalculatorActualInput): Promise<void> {
    this.assertConfigured();
    assertValidPeriod(input.period);

    const feeCalculatorSpreadsheetId = this.getAppSpreadsheetId();
    const actual = normalizeFeeCalculatorActualInput(input);
    const rows = await this.readOptionalValuesFromSpreadsheet(
      feeCalculatorSpreadsheetId,
      this.config.feeCalculatorActualsRange,
    );
    const now = new Date().toISOString();
    const sheets = this.createSheetsClient();
    const sheetPrefix = getSheetPrefix(this.config.feeCalculatorActualsRange);

    await this.ensureSheetForRange(
      this.config.feeCalculatorActualsRange,
      feeCalculatorSpreadsheetId,
    );

    if (rows.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: feeCalculatorSpreadsheetId,
        range: `${sheetPrefix}!A:F`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [
            feeCalculatorActualHeaders,
            buildFeeCalculatorActualWritableRow(feeCalculatorActualHeaders, {
              ...actual,
              id: createId("actual"),
              updatedAt: now,
            }),
          ],
        },
      });
      invalidateFeeCalculatorCache();
      return;
    }

    const [headerRow = [], ...dataRows] = rows;
    const headers = normalizeWritableHeaders(headerRow, feeCalculatorActualHeaders);
    const costIdIndex = findHeaderIndex(headers, ["costo_id", "cost_id"]);
    const periodIndex = findHeaderIndex(headers, ["periodo", "period", "mes"]);
    const targetRowIndex =
      costIdIndex >= 0 && periodIndex >= 0
        ? dataRows.findIndex(
            (row) =>
              String(row[costIdIndex] ?? "").trim() === actual.costId &&
              normalizePeriod(String(row[periodIndex] ?? "").trim()) === actual.period,
          )
        : -1;

    if (targetRowIndex >= 0) {
      const existing = mapRowsToFeeCalculatorActuals([
        headers,
        dataRows[targetRowIndex],
      ])[0];
      const spreadsheetRow = targetRowIndex + 2;

      await sheets.spreadsheets.values.update({
        spreadsheetId: feeCalculatorSpreadsheetId,
        range: `${sheetPrefix}!A${spreadsheetRow}:${toColumnName(headers.length - 1)}${spreadsheetRow}`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [
            buildFeeCalculatorActualWritableRow(headers, {
              ...actual,
              id: existing?.id || createId("actual"),
              updatedAt: now,
            }),
          ],
        },
      });
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId: feeCalculatorSpreadsheetId,
        range: this.config.feeCalculatorActualsRange,
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: {
          values: [
            buildFeeCalculatorActualWritableRow(headers, {
              ...actual,
              id: createId("actual"),
              updatedAt: now,
            }),
          ],
        },
      });
    }

    invalidateFeeCalculatorCache();
  }

  async updateFeeCalculatorPlayerStatus(
    input: UpdateFeeCalculatorPlayerStatusInput,
  ): Promise<void> {
    this.assertConfigured();
    assertValidPeriod(input.period);

    const feeCalculatorSpreadsheetId = this.getAppSpreadsheetId();
    const playerStatus = normalizeFeeCalculatorPlayerStatusInput(input);
    const rows = await this.readOptionalValuesFromSpreadsheet(
      feeCalculatorSpreadsheetId,
      this.config.feeCalculatorPlayerStatusesRange,
    );
    const now = new Date().toISOString();
    const sheets = this.createSheetsClient();
    const sheetPrefix = getSheetPrefix(this.config.feeCalculatorPlayerStatusesRange);

    await this.ensureSheetForRange(
      this.config.feeCalculatorPlayerStatusesRange,
      feeCalculatorSpreadsheetId,
    );

    if (rows.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: feeCalculatorSpreadsheetId,
        range: `${sheetPrefix}!A:G`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [
            feeCalculatorPlayerStatusHeaders,
            buildFeeCalculatorPlayerStatusWritableRow(feeCalculatorPlayerStatusHeaders, {
              ...playerStatus,
              id: createId("player-status"),
              updatedAt: now,
            }),
          ],
        },
      });
      invalidateFeeCalculatorCache();
      return;
    }

    const [headerRow = [], ...dataRows] = rows;
    const headers = normalizeWritableHeaders(headerRow, feeCalculatorPlayerStatusHeaders);
    const playerIdIndex = findHeaderIndex(headers, [
      "jugador_id",
      "player_id",
      "id_jugador",
    ]);
    const playerNameIndex = findHeaderIndex(headers, [
      "jugador",
      "nombre",
      "player",
      "name",
    ]);
    const periodIndex = findHeaderIndex(headers, ["periodo", "period", "mes"]);
    const normalizedPlayerName = normalizeClubPlayerName(playerStatus.playerName);
    const targetRowIndex =
      periodIndex >= 0
        ? dataRows.findIndex((row) => {
            const rowPeriod = normalizePeriod(String(row[periodIndex] ?? "").trim());
            const rowPlayerId =
              playerIdIndex >= 0 ? String(row[playerIdIndex] ?? "").trim() : "";
            const rowPlayerName =
              playerNameIndex >= 0
                ? normalizeClubPlayerName(String(row[playerNameIndex] ?? ""))
                : "";

            return (
              rowPeriod === playerStatus.period &&
              (rowPlayerId === playerStatus.playerId ||
                (!!rowPlayerName && rowPlayerName === normalizedPlayerName))
            );
          })
        : -1;

    if (targetRowIndex >= 0) {
      const existing = mapRowsToFeeCalculatorPlayerStatuses([
        headers,
        dataRows[targetRowIndex],
      ])[0];
      const spreadsheetRow = targetRowIndex + 2;

      await sheets.spreadsheets.values.update({
        spreadsheetId: feeCalculatorSpreadsheetId,
        range: `${sheetPrefix}!A${spreadsheetRow}:${toColumnName(headers.length - 1)}${spreadsheetRow}`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [
            buildFeeCalculatorPlayerStatusWritableRow(headers, {
              ...playerStatus,
              id: existing?.id || createId("player-status"),
              updatedAt: now,
            }),
          ],
        },
      });
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId: feeCalculatorSpreadsheetId,
        range: this.config.feeCalculatorPlayerStatusesRange,
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: {
          values: [
            buildFeeCalculatorPlayerStatusWritableRow(headers, {
              ...playerStatus,
              id: createId("player-status"),
              updatedAt: now,
            }),
          ],
        },
      });
    }

    invalidateFeeCalculatorCache();
  }

  async updateFeeRefundPolicy(input: UpdateFeeRefundPolicyInput): Promise<void> {
    this.assertConfigured();

    const feeCalculatorSpreadsheetId = this.getAppSpreadsheetId();
    const rules = normalizeFeeRefundPolicyInput(input);
    const sheets = this.createSheetsClient();
    const sheetPrefix = getSheetPrefix(this.config.refundPolicyRange);

    await this.ensureSheetForRange(
      this.config.refundPolicyRange,
      feeCalculatorSpreadsheetId,
    );
    await sheets.spreadsheets.values.clear({
      spreadsheetId: feeCalculatorSpreadsheetId,
      range: this.config.refundPolicyRange,
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: feeCalculatorSpreadsheetId,
      range: `${sheetPrefix}!A:C`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [
          feeRefundPolicyHeaders,
          ...rules.map((rule) => [rule.fromPercent, rule.toPercent, rule.refundPercent]),
        ],
      },
    });

    invalidateFeeCalculatorCache();
  }

  async getExportData(dataset: ExportDataset): Promise<ExportData> {
    this.assertConfigured();

    if (dataset === "cash-flow") {
      return buildCashFlowExport(await this.readCashFlowTransactions());
    }

    const { players, fees } = await this.readDashboardRecords();

    if (dataset === "players") {
      return buildPlayersExport(players);
    }

    if (dataset === "fees") {
      return buildFeesExport(players, fees);
    }

    return buildIncomeExport(players, fees);
  }

  async getPlayerProfile(playerId: string, year = new Date().getFullYear()) {
    try {
      this.assertConfigured();
      const { players, fees } = await this.readDashboardRecords();
      const player =
        players.find((candidate) => candidate.id === playerId) ??
        buildPlayerFromFees(playerId, fees);

      if (!player) {
        return null;
      }

      return buildPlayerProfile(player, fees, year);
    } catch {
      return null;
    }
  }

  async updatePlayerFeeStatus(input: UpdatePlayerFeeStatusInput) {
    this.assertConfigured();
    assertValidPeriod(input.period);

    let values: unknown[][];

    try {
      values = await this.readValues(this.config.feesRange);
    } catch (error) {
      if (shouldUseClubSheetLayout(error)) {
        await this.updateClubSheetFeeStatus(input);
        return;
      }

      throw error;
    }

    const targetStatus = input.status === "paid" ? "pagada" : "pendiente";
    const paidAt = input.status === "paid" ? getTodayIsoDate() : "";
    const sheetPrefix = getSheetPrefix(this.config.feesRange);

    if (values.length === 0) {
      const monthlyFee = await this.readPlayerMonthlyFee(input.playerId);
      await this.appendInitialFeeRows(
        input,
        targetStatus,
        paidAt,
        sheetPrefix,
        monthlyFee,
      );
      invalidateDashboardCache();
      return;
    }

    const [headerRow = [], ...dataRows] = values;
    const headers = headerRow.map((header) => normalizeHeader(String(header)));
    const playerIndex = findHeaderIndex(headers, [
      "jugador_id",
      "id_jugador",
      "player_id",
      "socio_id",
      "id_socio",
    ]);
    const periodIndex = findHeaderIndex(headers, ["periodo", "period", "mes"]);
    const statusIndex = findHeaderIndex(headers, ["estado", "status"]);
    const paidAtIndex = findHeaderIndex(headers, [
      "fecha_pago",
      "pagado_el",
      "paid_at",
      "payment_date",
    ]);

    if (playerIndex < 0 || periodIndex < 0 || statusIndex < 0) {
      throw new DataServiceError(
        "La hoja Cuotas debe incluir columnas de jugador, periodo y estado.",
        "CONFIGURATION_ERROR",
      );
    }

    const targetRowIndex = dataRows.findIndex((row) => {
      const rowPlayerId = String(row[playerIndex] ?? "").trim();
      const rowPeriod = normalizePeriod(String(row[periodIndex] ?? "").trim());

      return rowPlayerId === input.playerId && rowPeriod === input.period;
    });

    if (targetRowIndex >= 0) {
      await this.updateExistingFeeRow({
        sheetPrefix,
        spreadsheetRow: targetRowIndex + 2,
        statusIndex,
        paidAtIndex,
        targetStatus,
        paidAt,
      });
    } else {
      const monthlyFee = await this.readPlayerMonthlyFee(input.playerId);
      await this.appendFeeRow(headers, input, targetStatus, paidAt, monthlyFee);
    }

    invalidateDashboardCache();
  }

  async getPremiumData(): Promise<PremiumData> {
    const cachedAt = new Date().toISOString();

    try {
      this.assertConfigured();
      const { auditRows, logRows, notificationRows, reminderRows, paymentRows } =
        await this.readCachedPremiumRows();

      return buildPremiumData({
        audit: mapRowsToAuditEvents(auditRows),
        logs: mapRowsToLogs(logRows),
        notifications: mapRowsToNotifications(notificationRows),
        reminders: mapRowsToReminderJobs(reminderRows),
        payments: mapRowsToPaymentRecords(paymentRows),
        status: "ready",
        message: "Datos premium obtenidos desde Google Sheets.",
        cachedAt,
        revalidateSeconds: this.config.cacheTtlSeconds,
      });
    } catch (error) {
      const serviceError = normalizeGoogleSheetsError(error);

      return buildPremiumData({
        audit: [],
        logs: [
          {
            id: createId("log"),
            timestamp: cachedAt,
            level: "warning",
            source: "GoogleSheetsService",
            message: serviceError.message,
            context: {
              code: serviceError.code,
            },
          },
        ],
        notifications: [],
        reminders: [],
        payments: [],
        status: "error",
        message: serviceError.message,
        cachedAt,
        revalidateSeconds: this.config.cacheTtlSeconds,
      });
    }
  }

  async recordAuditEvent(input: CreateAuditEventInput): Promise<void> {
    this.assertConfigured();

    await this.appendRowsWithHeaders(this.config.auditRange, auditHeaders, [
      createId("audit"),
      new Date().toISOString(),
      input.actor.id,
      input.actor.name,
      input.actor.role,
      input.action,
      input.entityType,
      input.entityId,
      input.summary,
      JSON.stringify(input.metadata ?? {}),
    ]);
    invalidatePremiumCache();
  }

  async createNotification(input: CreateNotificationInput): Promise<void> {
    this.assertConfigured();

    await this.appendRowsWithHeaders(
      this.config.notificationsRange,
      notificationHeaders,
      [
        createId("notification"),
        new Date().toISOString(),
        input.title,
        input.message,
        input.type ?? "info",
        "unread",
        input.targetRole ?? "all",
        "",
      ],
    );
    invalidatePremiumCache();
  }

  async markNotificationRead(notificationId: string): Promise<void> {
    this.assertConfigured();

    const values = await this.readValues(this.config.notificationsRange);

    if (values.length === 0) {
      return;
    }

    const [headerRow = [], ...dataRows] = values;
    const headers = headerRow.map((header) => normalizeHeader(String(header)));
    const idIndex = findHeaderIndex(headers, ["id", "notification_id"]);
    const statusIndex = findHeaderIndex(headers, ["status", "estado"]);
    const readAtIndex = findHeaderIndex(headers, ["read_at", "leido_el"]);

    if (idIndex < 0 || statusIndex < 0) {
      return;
    }

    const targetRowIndex = dataRows.findIndex(
      (row) => String(row[idIndex] ?? "").trim() === notificationId,
    );

    if (targetRowIndex < 0) {
      return;
    }

    const sheets = this.createSheetsClient();
    const sheetPrefix = getSheetPrefix(this.config.notificationsRange);
    const spreadsheetRow = targetRowIndex + 2;
    const data = [
      {
        range: `${sheetPrefix}!${toColumnName(statusIndex)}${spreadsheetRow}`,
        values: [["read"]],
      },
    ];

    if (readAtIndex >= 0) {
      data.push({
        range: `${sheetPrefix}!${toColumnName(readAtIndex)}${spreadsheetRow}`,
        values: [[new Date().toISOString()]],
      });
    }

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: this.config.spreadsheetId,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data,
      },
    });
    invalidatePremiumCache();
  }

  async createReminderJob(input: CreateReminderJobInput): Promise<void> {
    this.assertConfigured();

    await this.appendRowsWithHeaders(this.config.remindersRange, reminderHeaders, [
      createId("reminder"),
      new Date().toISOString(),
      input.scheduledFor,
      input.period,
      input.playerId,
      input.playerName,
      input.phone,
      input.paymentStatus,
      input.message,
      input.status ?? "queued",
      input.status === "sent" ? new Date().toISOString() : "",
      input.error ?? "",
    ]);
    invalidatePremiumCache();
  }

  async upsertPaymentRecord(input: UpsertPaymentRecordInput): Promise<void> {
    this.assertConfigured();

    const values = await this.readValues(this.config.paymentsRange);
    const now = new Date().toISOString();
    const nextRow = buildPaymentWritableRow(paymentHeaders, input, now);

    if (values.length === 0) {
      await this.appendRowsWithHeaders(
        this.config.paymentsRange,
        paymentHeaders,
        nextRow,
      );
      invalidatePremiumCache();
      return;
    }

    const [headerRow = [], ...dataRows] = values;
    const headers = headerRow.map((header) => normalizeHeader(String(header)));
    const providerIndex = findHeaderIndex(headers, ["provider", "proveedor"]);
    const externalIdIndex = findHeaderIndex(headers, ["external_id", "externalid"]);
    const targetRowIndex =
      providerIndex >= 0 && externalIdIndex >= 0
        ? dataRows.findIndex(
            (row) =>
              String(row[providerIndex] ?? "").trim() === input.provider &&
              String(row[externalIdIndex] ?? "").trim() === input.externalId,
          )
        : -1;

    if (targetRowIndex < 0) {
      await this.appendRowsWithHeaders(
        this.config.paymentsRange,
        headers.length ? headers : paymentHeaders,
        buildPaymentWritableRow(headers.length ? headers : paymentHeaders, input, now),
      );
      invalidatePremiumCache();
      return;
    }

    const sheets = this.createSheetsClient();
    const sheetPrefix = getSheetPrefix(this.config.paymentsRange);
    const spreadsheetRow = targetRowIndex + 2;

    await sheets.spreadsheets.values.update({
      spreadsheetId: this.config.spreadsheetId,
      range: `${sheetPrefix}!A${spreadsheetRow}:${toColumnName(headers.length - 1)}${spreadsheetRow}`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [buildPaymentWritableRow(headers, input, now)],
      },
    });
    invalidatePremiumCache();
  }

  private assertConfigured() {
    const missing = [
      ["GOOGLE_SHEETS_SPREADSHEET_ID", this.config.spreadsheetId],
      ["GOOGLE_SHEETS_CLIENT_EMAIL", this.config.clientEmail],
      ["GOOGLE_SHEETS_PRIVATE_KEY", this.config.privateKey],
    ]
      .filter(([, value]) => !value)
      .map(([key]) => key);

    if (missing.length > 0) {
      throw new DataServiceError(
        `Faltan variables de entorno para Google Sheets: ${missing.join(", ")}.`,
        "CONFIGURATION_ERROR",
      );
    }
  }

  private async readCachedDashboardRows() {
    const spreadsheetId = this.getAppSpreadsheetId();
    const playersSpreadsheetId = spreadsheetId;
    const clubSpreadsheetId = this.getClubSpreadsheetId();

    if (!spreadsheetId) {
      throw new DataServiceError(
        "GOOGLE_SHEETS_SPREADSHEET_ID no esta configurado.",
        "CONFIGURATION_ERROR",
      );
    }

    return unstable_cache(
      async () => ({
        playersRows: await this.readPlayerDirectoryRows(playersSpreadsheetId),
        feesRows: await this.readOptionalValues(this.config.feesRange),
        formResponseRows: await this.readFormResponseRows(clubSpreadsheetId),
      }),
      [
        "google-sheets-dashboard",
        spreadsheetId,
        playersSpreadsheetId,
        clubSpreadsheetId,
        this.config.playersRange,
        this.config.feesRange,
        this.config.formResponsesRange,
      ],
      {
        revalidate: this.config.cacheTtlSeconds,
        tags: ["google-sheets", "google-sheets:dashboard"],
      },
    )();
  }

  private async readCachedPlayerDirectoryRows() {
    const spreadsheetId = this.getAppSpreadsheetId();

    return unstable_cache(
      async () => this.readPlayerDirectoryRows(spreadsheetId),
      ["google-sheets-players", spreadsheetId, this.config.playersRange],
      {
        revalidate: this.config.cacheTtlSeconds,
        tags: ["google-sheets", "google-sheets:players"],
      },
    )();
  }

  private async readCachedCashFlowRows() {
    const spreadsheetId = this.config.spreadsheetId;

    if (!spreadsheetId) {
      throw new DataServiceError(
        "GOOGLE_SHEETS_SPREADSHEET_ID no esta configurado.",
        "CONFIGURATION_ERROR",
      );
    }

    return unstable_cache(
      async () => this.readValues(this.config.cashFlowRange),
      ["google-sheets-cash-flow", spreadsheetId, this.config.cashFlowRange],
      {
        revalidate: this.config.cacheTtlSeconds,
        tags: ["google-sheets", "google-sheets:cash-flow"],
      },
    )();
  }

  private async readCachedSettingsRows() {
    const spreadsheetId = this.config.spreadsheetId;

    if (!spreadsheetId) {
      throw new DataServiceError(
        "GOOGLE_SHEETS_SPREADSHEET_ID no esta configurado.",
        "CONFIGURATION_ERROR",
      );
    }

    return unstable_cache(
      async () => this.readValues(this.config.settingsRange),
      ["google-sheets-settings", spreadsheetId, this.config.settingsRange],
      {
        revalidate: this.config.cacheTtlSeconds,
        tags: ["google-sheets", "google-sheets:settings"],
      },
    )();
  }

  private async readCachedPremiumRows() {
    const spreadsheetId = this.config.spreadsheetId;

    if (!spreadsheetId) {
      throw new DataServiceError(
        "GOOGLE_SHEETS_SPREADSHEET_ID no esta configurado.",
        "CONFIGURATION_ERROR",
      );
    }

    return unstable_cache(
      async () => ({
        auditRows: await this.readValues(this.config.auditRange),
        logRows: await this.readValues(this.config.logsRange),
        notificationRows: await this.readValues(this.config.notificationsRange),
        reminderRows: await this.readValues(this.config.remindersRange),
        paymentRows: await this.readValues(this.config.paymentsRange),
      }),
      [
        "google-sheets-premium",
        spreadsheetId,
        this.config.auditRange,
        this.config.logsRange,
        this.config.notificationsRange,
        this.config.remindersRange,
        this.config.paymentsRange,
      ],
      {
        revalidate: this.config.cacheTtlSeconds,
        tags: ["google-sheets", "google-sheets:premium"],
      },
    )();
  }

  private async readCachedClubDashboardRows() {
    const spreadsheetId = this.getClubSpreadsheetId();

    if (!spreadsheetId) {
      throw new DataServiceError(
        "GOOGLE_SHEETS_SPREADSHEET_ID no esta configurado.",
        "CONFIGURATION_ERROR",
      );
    }

    return unstable_cache(
      async () => ({
        playersRows: await this.readValuesFromSpreadsheet(
          spreadsheetId,
          CLUB_PLAYERS_RANGE,
        ),
        trackingRows: await this.readValuesFromSpreadsheet(
          spreadsheetId,
          CLUB_TRACKING_RANGE,
        ),
        finalFeeRows: await this.readValuesFromSpreadsheet(
          spreadsheetId,
          CLUB_FINAL_FEE_RANGE,
        ),
        formResponseRows: await this.readFormResponseRows(spreadsheetId),
      }),
      [
        "google-sheets-club-dashboard",
        spreadsheetId,
        CLUB_PLAYERS_RANGE,
        CLUB_TRACKING_RANGE,
        CLUB_FINAL_FEE_RANGE,
        this.config.formResponsesRange,
      ],
      {
        revalidate: this.config.cacheTtlSeconds,
        tags: ["google-sheets", "google-sheets:dashboard"],
      },
    )();
  }

  private async ensureWritableHeaders(
    spreadsheetId: string,
    sheetPrefix: string,
    headers: string[],
    requiredHeaders: string[],
  ) {
    const mergedHeaders = Array.from(new Set([...headers, ...requiredHeaders]));

    if (mergedHeaders.length === headers.length) {
      return headers;
    }

    await this.createSheetsClient().spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetPrefix}!A1:${toColumnName(mergedHeaders.length - 1)}1`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [mergedHeaders],
      },
    });

    return mergedHeaders;
  }

  private async readCachedClubFinancialRows() {
    const spreadsheetId = this.getClubSpreadsheetId();

    if (!spreadsheetId) {
      throw new DataServiceError(
        "GOOGLE_SHEETS_SPREADSHEET_ID no esta configurado.",
        "CONFIGURATION_ERROR",
      );
    }

    return unstable_cache(
      async () => ({
        playersRows: await this.readValuesFromSpreadsheet(
          spreadsheetId,
          CLUB_PLAYERS_RANGE,
        ),
        trackingRows: await this.readValuesFromSpreadsheet(
          spreadsheetId,
          CLUB_TRACKING_RANGE,
        ),
        finalFeeRows: await this.readValuesFromSpreadsheet(
          spreadsheetId,
          CLUB_FINAL_FEE_RANGE,
        ),
        formResponseRows: await this.readFormResponseRows(spreadsheetId),
        expenseRows: await this.readOptionalValuesFromSpreadsheet(
          spreadsheetId,
          this.config.expensesRange,
        ),
      }),
      [
        "google-sheets-club-financial",
        spreadsheetId,
        CLUB_PLAYERS_RANGE,
        CLUB_TRACKING_RANGE,
        CLUB_FINAL_FEE_RANGE,
        this.config.formResponsesRange,
        this.config.expensesRange,
      ],
      {
        revalidate: this.config.cacheTtlSeconds,
        tags: ["google-sheets", "google-sheets:cash-flow"],
      },
    )();
  }

  private async readFeeCalculatorRows() {
    const spreadsheetId = this.getAppSpreadsheetId();
    const matchesSpreadsheetId = this.config.matchesSpreadsheetId;
    const feeCalculatorSpreadsheetId = spreadsheetId;
    const clubSpreadsheetId = this.getClubSpreadsheetId();

    if (!spreadsheetId) {
      throw new DataServiceError(
        "GOOGLE_SHEETS_SPREADSHEET_ID no esta configurado.",
        "CONFIGURATION_ERROR",
      );
    }

    return unstable_cache(
      async () => ({
        costsRows: await this.readOptionalValuesFromSpreadsheet(
          feeCalculatorSpreadsheetId,
          this.config.feeCalculatorCostsRange,
        ),
        actualsRows: await this.readOptionalValuesFromSpreadsheet(
          feeCalculatorSpreadsheetId,
          this.config.feeCalculatorActualsRange,
        ),
        playerStatusRows: await this.readOptionalValuesFromSpreadsheet(
          feeCalculatorSpreadsheetId,
          this.config.feeCalculatorPlayerStatusesRange,
        ),
        refundPolicyRows: await this.readOptionalValuesFromSpreadsheet(
          feeCalculatorSpreadsheetId,
          this.config.refundPolicyRange,
        ),
        matchRows: matchesSpreadsheetId
          ? await this.readOptionalValuesFromSpreadsheet(
              matchesSpreadsheetId,
              this.config.matchesRange,
            )
          : [],
        expenseRows: await this.readOptionalValuesFromSpreadsheet(
          clubSpreadsheetId,
          this.config.expensesRange,
        ),
      }),
      [
        "google-sheets-fee-calculator",
        spreadsheetId,
        matchesSpreadsheetId ?? "",
        feeCalculatorSpreadsheetId,
        clubSpreadsheetId,
        this.config.feeCalculatorCostsRange,
        this.config.feeCalculatorActualsRange,
        this.config.feeCalculatorPlayerStatusesRange,
        this.config.refundPolicyRange,
        this.config.matchesRange,
        this.config.expensesRange,
      ],
      {
        revalidate: this.config.cacheTtlSeconds,
        tags: ["google-sheets", "google-sheets:fee-calculator"],
      },
    )();
  }

  private async readValues(range: string) {
    return this.readValuesFromSpreadsheet(this.config.spreadsheetId, range);
  }

  private async readValuesFromSpreadsheet(
    spreadsheetId: string | undefined,
    range: string,
  ) {
    if (!spreadsheetId) {
      throw new DataServiceError(
        "GOOGLE_SHEETS_SPREADSHEET_ID no esta configurado.",
        "CONFIGURATION_ERROR",
      );
    }

    const sheets = this.createSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    return response.data.values ?? [];
  }

  private async readOptionalValues(range: string) {
    try {
      return await this.readValues(range);
    } catch {
      return [];
    }
  }

  private async readOptionalValuesFromSpreadsheet(spreadsheetId: string, range: string) {
    try {
      return await this.readValuesFromSpreadsheet(spreadsheetId, range);
    } catch {
      return [];
    }
  }

  private async readFormResponseRows(spreadsheetId: string) {
    const configuredRows = await this.readOptionalValuesFromSpreadsheet(
      spreadsheetId,
      this.config.formResponsesRange,
    );

    if (
      configuredRows.length > 0 ||
      this.config.formResponsesRange !== CLUB_FORM_RESPONSES_RANGE
    ) {
      return configuredRows;
    }

    return this.readOptionalValuesFromSpreadsheet(
      spreadsheetId,
      CLUB_FORM_RESPONSE_RANGE,
    );
  }

  private async readPlayerDirectoryRows(spreadsheetId: string) {
    return this.readOptionalValuesFromSpreadsheet(
      spreadsheetId,
      this.config.playersRange,
    );
  }

  private getWritablePlayersRange() {
    return this.config.playersRange;
  }

  private getClubSpreadsheetId() {
    const spreadsheetId = this.config.clubSpreadsheetId ?? this.config.spreadsheetId;

    if (!spreadsheetId) {
      throw new DataServiceError(
        "GOOGLE_SHEETS_CLUB_SPREADSHEET_ID no esta configurado.",
        "CONFIGURATION_ERROR",
      );
    }

    return spreadsheetId;
  }

  private getAppSpreadsheetId() {
    const spreadsheetId = this.config.spreadsheetId;

    if (!spreadsheetId) {
      throw new DataServiceError(
        "GOOGLE_SHEETS_SPREADSHEET_ID no esta configurado.",
        "CONFIGURATION_ERROR",
      );
    }

    return spreadsheetId;
  }

  private async ensureSheetForRange(
    range: string,
    spreadsheetId = this.getAppSpreadsheetId(),
  ) {
    const title = unquoteSheetTitle(getSheetPrefix(range));
    const sheets = this.createSheetsClient();
    const metadata = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: "sheets.properties.title",
    });
    const exists = metadata.data.sheets?.some(
      (sheet) => sheet.properties?.title === title,
    );

    if (exists) {
      return;
    }

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title,
              },
            },
          },
        ],
      },
    });
  }

  private createSheetsClient(): sheets_v4.Sheets {
    const auth = new google.auth.JWT({
      email: this.config.clientEmail,
      key: this.config.privateKey?.replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    return google.sheets({ version: "v4", auth });
  }

  private async appendRowsWithHeaders(
    range: string,
    headers: string[],
    row: Array<string | number | boolean>,
    spreadsheetId = this.config.spreadsheetId,
  ) {
    const values = await this.readValuesFromSpreadsheet(spreadsheetId, range).catch(
      () => [],
    );
    const sheets = this.createSheetsClient();

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: values.length === 0 ? [headers, row] : [row],
      },
    });
  }

  private async appendInitialFeeRows(
    input: UpdatePlayerFeeStatusInput,
    targetStatus: string,
    paidAt: string,
    sheetPrefix: string,
    monthlyFee: number,
  ) {
    const headers = [
      "id",
      "jugador_id",
      "periodo",
      "monto",
      "estado",
      "vencimiento",
      "fecha_pago",
    ];
    const row = buildWritableFeeRow(headers, input, targetStatus, paidAt, monthlyFee);
    const sheets = this.createSheetsClient();

    await sheets.spreadsheets.values.append({
      spreadsheetId: this.config.spreadsheetId,
      range: `${sheetPrefix}!A:G`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [headers, row],
      },
    });
  }

  private async updateExistingFeeRow({
    sheetPrefix,
    spreadsheetRow,
    statusIndex,
    paidAtIndex,
    targetStatus,
    paidAt,
  }: {
    sheetPrefix: string;
    spreadsheetRow: number;
    statusIndex: number;
    paidAtIndex: number;
    targetStatus: string;
    paidAt: string;
  }) {
    const sheets = this.createSheetsClient();
    const data = [
      {
        range: `${sheetPrefix}!${toColumnName(statusIndex)}${spreadsheetRow}`,
        values: [[targetStatus]],
      },
    ];

    if (paidAtIndex >= 0) {
      data.push({
        range: `${sheetPrefix}!${toColumnName(paidAtIndex)}${spreadsheetRow}`,
        values: [[paidAt]],
      });
    }

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: this.config.spreadsheetId,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data,
      },
    });
  }

  private async appendFeeRow(
    headers: string[],
    input: UpdatePlayerFeeStatusInput,
    targetStatus: string,
    paidAt: string,
    monthlyFee: number,
  ) {
    const sheets = this.createSheetsClient();
    const row = buildWritableFeeRow(headers, input, targetStatus, paidAt, monthlyFee);

    await sheets.spreadsheets.values.append({
      spreadsheetId: this.config.spreadsheetId,
      range: this.config.feesRange,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [row],
      },
    });
  }

  private async readPlayerMonthlyFee(playerId: string) {
    const playersRows = await this.readPlayerDirectoryRows(this.getAppSpreadsheetId());
    const player = mapRowsToPlayers(playersRows).find(
      (candidate) => candidate.id === playerId,
    );

    if (player?.monthlyFee) {
      return player.monthlyFee;
    }

    const settingsRows = await this.readCachedSettingsRows();
    const settings = mapRowsToAppSettings(settingsRows);

    return settings.monthlyFee;
  }

  private async readDashboardRecords(): Promise<DashboardRecords> {
    try {
      const { playersRows, feesRows, formResponseRows } =
        await this.readCachedDashboardRows();
      const players = mapRowsToPlayers(playersRows);
      const fees = mergeFeeRecords(
        mapRowsToFees(feesRows),
        mapFormResponsesToPaidFees(players, formResponseRows),
      );

      return {
        players,
        fees,
        message: "Datos obtenidos desde Google Sheets y pagos del formulario.",
      };
    } catch (error) {
      if (!shouldUseClubSheetLayout(error)) {
        throw error;
      }

      const { playersRows, trackingRows, finalFeeRows, formResponseRows } =
        await this.readCachedClubDashboardRows();
      const players = mapClubRowsToPlayers(playersRows);
      const fees = mapClubRowsToFees({
        players,
        trackingRows,
        finalFeeRows,
        formResponseRows,
      });

      return {
        players,
        fees,
        message: "Datos obtenidos desde la planilla operativa del club.",
      };
    }
  }

  private async readCashFlowTransactions(): Promise<CashFlowTransactionRecord[]> {
    try {
      const rows = await this.readCachedCashFlowRows();
      return mapRowsToCashFlowTransactions(rows);
    } catch (error) {
      if (!shouldUseClubSheetLayout(error)) {
        throw error;
      }

      const { playersRows, trackingRows, finalFeeRows, formResponseRows, expenseRows } =
        await this.readCachedClubFinancialRows();
      const players = mapClubRowsToPlayers(playersRows);
      const fees = mapClubRowsToFees({
        players,
        trackingRows,
        finalFeeRows,
        formResponseRows,
      });

      return [
        ...mapClubFeesToIncomeTransactions(players, fees),
        ...mapClubExpenseRowsToTransactions(expenseRows),
      ];
    }
  }

  private async readFeeIncomeByPeriod(periods: string[]) {
    const uniquePeriods = Array.from(new Set(periods));
    const entries = await Promise.all(
      uniquePeriods.map(async (period) => {
        const data = await this.getFeeCalculatorData(period);
        const total = data.playerCalculations.reduce(
          (sum, calculation) => sum + calculation.finalQuota,
          0,
        );

        return [period, total] as const;
      }),
    );

    return new Map(entries);
  }

  private async updateClubSheetFeeStatus(input: UpdatePlayerFeeStatusInput) {
    if (input.status !== "paid") {
      throw new DataServiceError(
        "La planilla operativa calcula los impagos desde el formulario. Para desmarcar un pago, corregi la respuesta en Google Sheets.",
        "CONFIGURATION_ERROR",
      );
    }

    const { players } = await this.readDashboardRecords();
    const player = players.find((candidate) => candidate.id === input.playerId);

    if (!player) {
      throw new DataServiceError(
        "No se encontro el jugador en Listado jugadores.",
        "CONFIGURATION_ERROR",
      );
    }

    await this.appendRowsWithHeaders(
      this.config.formResponsesRange,
      [
        "Marca temporal ",
        "Nombren del jugador ",
        "Año ",
        "Mes ",
        "Comprobante de pago ",
        "Dirección de correo electrónico ",
        "Columna 1 ",
      ],
      [
        formatClubFormTimestamp(new Date()),
        player.name,
        input.period.slice(0, 4),
        formatClubMonthName(input.period),
        "Carga manual desde app",
        "",
        "Marcado desde la app",
      ],
      this.getClubSpreadsheetId(),
    );

    invalidateDashboardCache();
  }
}

function mapRowsToPlayers(rows: unknown[][]): PlayerRecord[] {
  return rowsToRecords(rows).map((record, index) => {
    const name = pick(record, [
      "nombre_y_apellido",
      "nombre_apellido",
      "nombre",
      "name",
      "jugador",
      "player",
    ]);

    return {
      id:
        pick(record, [
          "id",
          "jugador_id",
          "id_jugador",
          "player_id",
          "socio_id",
          "id_socio",
        ]) ||
        name ||
        `player-${index + 1}`,
      name: name || `Jugador ${index + 1}`,
      category:
        pick(record, ["categoria", "category", "division", "equipo"]) || "Sin categoria",
      phone:
        normalizeClubPhone(pick(record, ["telefono", "phone", "whatsapp", "celular"])) ||
        "-",
      email: pick(record, ["email", "correo", "mail", "correo_electronico"]),
      monthlyFee: parseMoney(
        pick(record, ["cuota", "monto_mensual", "monthly_fee", "importe"]),
      ),
      observations:
        pick(record, ["observaciones", "observacion", "notas", "notes"]) || "-",
      status: normalizeText(pick(record, ["estado", "status"])),
      joinedAt: parseDate(
        pick(record, [
          "fecha_alta",
          "alta",
          "fecha_ingreso",
          "ingreso",
          "joined_at",
          "created_at",
          "fecha_registro",
        ]),
      ),
      leftAt: parseDate(
        pick(record, [
          "fecha_baja",
          "baja",
          "fecha_egreso",
          "egreso",
          "left_at",
          "deleted_at",
        ]),
      ),
    };
  });
}

function mapRowsToPlayerDirectoryItems(rows: unknown[][]): PlayerDirectoryItem[] {
  return rowsToRecords(rows)
    .map((record, index) => {
      const name = pick(record, [
        "nombre_y_apellido",
        "nombre_apellido",
        "nombre",
        "name",
        "jugador",
        "player",
      ]).trim();

      if (!name) {
        return null;
      }

      const id =
        pick(record, ["id", "jugador_id", "id_jugador", "player_id"]) ||
        createClubPlayerId(name) ||
        `player-${index + 1}`;
      const leftAt = parseDate(
        pick(record, ["fecha_baja", "baja", "left_at", "deleted_at"]),
      );
      const status = normalizePlayerDirectoryStatus(
        pick(record, ["estado", "status"]),
        leftAt,
      );
      const createdAt =
        parseDateTime(pick(record, ["creado_en", "created_at", "created"])) ?? "";
      const updatedAt =
        parseDateTime(
          pick(record, ["actualizado_en", "updated_at", "updated", "modificado"]),
        ) || createdAt;

      return {
        id,
        name,
        phone: pick(record, ["telefono", "phone", "whatsapp", "celular"]),
        email: pick(record, ["email", "correo", "mail", "correo_electronico"]),
        category:
          pick(record, ["categoria", "category", "division", "equipo"]) || "Plantel",
        notes: pick(record, ["observaciones", "observacion", "notas", "notes"]),
        status,
        joinedAt:
          parseDate(
            pick(record, ["fecha_alta", "alta", "fecha_ingreso", "ingreso", "joined_at"]),
          ) || createdAt.slice(0, 10),
        leftAt: status === "inactive" ? leftAt || "" : "",
        createdAt,
        updatedAt,
      } satisfies PlayerDirectoryItem;
    })
    .filter((player): player is PlayerDirectoryItem => Boolean(player))
    .sort((left, right) => left.name.localeCompare(right.name, "es"));
}

function findPlayerDirectoryRowIndex(
  headers: string[],
  rows: unknown[][],
  playerId: string,
  playerName = "",
) {
  const idIndex = findHeaderIndex(headers, [
    "id",
    "jugador_id",
    "player_id",
    "id_jugador",
  ]);
  const nameIndex = findHeaderIndex(headers, [
    "nombre_y_apellido",
    "nombre_apellido",
    "nombre",
    "name",
    "jugador",
    "player",
  ]);
  const normalizedName = normalizeClubPlayerName(playerName);

  if (idIndex >= 0) {
    const byId = rows.findIndex((row) => String(row[idIndex] ?? "").trim() === playerId);

    if (byId >= 0) {
      return byId;
    }
  }

  const records = rowsToRecords([headers, ...rows]);
  const byMappedId = records.findIndex((record, index) => {
    const name = pick(record, [
      "nombre_y_apellido",
      "nombre_apellido",
      "nombre",
      "name",
      "jugador",
      "player",
    ]);
    const recordId =
      pick(record, ["id", "jugador_id", "id_jugador", "player_id"]) ||
      createClubPlayerId(name) ||
      `player-${index + 1}`;

    return recordId === playerId;
  });

  if (byMappedId >= 0) {
    return byMappedId;
  }

  if (nameIndex < 0 || !normalizedName) {
    return -1;
  }

  return rows.findIndex(
    (row) => normalizeClubPlayerName(String(row[nameIndex] ?? "")) === normalizedName,
  );
}

function normalizePlayerInput(
  input: UpsertPlayerInput,
  existingIds: Set<string>,
  now: string,
  targetId?: string,
  existing?: PlayerDirectoryItem,
): PlayerDirectoryItem {
  const name = input.name.trim();
  const id =
    targetId ||
    input.id?.trim() ||
    createUniqueClubPlayerId(createClubPlayerId(name) || "player", existingIds);
  const status = input.status ?? existing?.status ?? "active";

  return {
    id,
    name,
    phone: input.phone?.trim() ?? existing?.phone ?? "",
    email: input.email?.trim() ?? existing?.email ?? "",
    category: input.category?.trim() || existing?.category || "Plantel",
    notes: input.notes?.trim() ?? existing?.notes ?? "",
    status,
    joinedAt: existing?.joinedAt || now.slice(0, 10),
    leftAt: status === "inactive" ? existing?.leftAt || now.slice(0, 10) : "",
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

function buildPlayerDirectoryWritableRow(headers: string[], player: PlayerDirectoryItem) {
  const values: Record<string, string> = {
    id: player.id,
    jugador_id: player.id,
    id_jugador: player.id,
    player_id: player.id,
    nombre: player.name,
    nombre_y_apellido: player.name,
    nombre_apellido: player.name,
    name: player.name,
    jugador: player.name,
    player: player.name,
    telefono: player.phone,
    phone: player.phone,
    whatsapp: player.phone,
    celular: player.phone,
    email: player.email,
    correo: player.email,
    mail: player.email,
    correo_electronico: player.email,
    categoria: player.category,
    category: player.category,
    division: player.category,
    equipo: player.category,
    observaciones: player.notes,
    observacion: player.notes,
    notas: player.notes,
    notes: player.notes,
    estado: player.status === "active" ? "activo" : "inactivo",
    status: player.status,
    fecha_alta: player.joinedAt,
    alta: player.joinedAt,
    joined_at: player.joinedAt,
    fecha_baja: player.leftAt,
    baja: player.leftAt,
    left_at: player.leftAt,
    creado_en: player.createdAt,
    created_at: player.createdAt,
    actualizado_en: player.updatedAt,
    updated_at: player.updatedAt,
  };

  return headers.map((header) => values[header] ?? "");
}

function mapRowsToFees(rows: unknown[][]): FeeRecord[] {
  const today = new Date();

  return rowsToRecords(rows).map((record, index) => {
    const dueDate = parseDate(
      pick(record, ["vencimiento", "fecha_vencimiento", "due_date", "vence"]),
    );
    const paidAt = parseDate(
      pick(record, ["fecha_pago", "pagado_el", "paid_at", "payment_date"]),
    );
    const rawStatus = pick(record, ["estado", "status"]);
    const status = normalizeFeeStatus(rawStatus, dueDate, today);
    const period =
      normalizePeriod(pick(record, ["periodo", "period", "mes"])) ??
      getPeriodFromDate(paidAt) ??
      getPeriodFromDate(dueDate) ??
      getCurrentPeriod();

    return {
      id: pick(record, ["id", "cuota_id", "fee_id"]) || `fee-${index + 1}`,
      playerId:
        pick(record, [
          "jugador_id",
          "id_jugador",
          "player_id",
          "socio_id",
          "id_socio",
          "id",
        ]) || `player-${index + 1}`,
      period,
      amount: parseMoney(pick(record, ["monto", "importe", "amount", "valor"])),
      status,
      dueDate,
      paidAt,
    };
  });
}

function mapRowsToCashFlowTransactions(rows: unknown[][]): CashFlowTransactionRecord[] {
  return rowsToRecords(rows)
    .map((record, index): CashFlowTransactionRecord | null => {
      const date = parseDate(pick(record, ["fecha", "date", "dia", "day"]));
      const rawAmount = parseMoney(
        pick(record, ["monto", "importe", "amount", "valor", "total"]),
      );
      const type = normalizeCashFlowType(
        pick(record, ["tipo", "type", "movimiento", "clase"]),
        rawAmount,
      );
      const amount = Math.abs(rawAmount);
      const period =
        normalizePeriod(pick(record, ["periodo", "period", "mes"])) ??
        getPeriodFromDate(date) ??
        getCurrentPeriod();
      const startPeriod =
        normalizePeriod(
          pick(record, ["vigencia_desde", "desde", "start_period", "periodo_desde"]),
        ) ?? period;
      const rawEndPeriod =
        normalizePeriod(
          pick(record, ["vigencia_hasta", "hasta", "end_period", "periodo_hasta"]),
        ) ?? startPeriod;
      const endPeriod = rawEndPeriod < startPeriod ? startPeriod : rawEndPeriod;
      const repeatsMonthly = parseLooseBoolean(
        pick(record, ["repite_mensual", "repite", "mensual", "recurrente"]),
        false,
      );
      const active = parseLooseBoolean(pick(record, ["activo", "active"]), true);

      if (amount === 0 || !active) {
        return null;
      }

      return {
        id:
          pick(record, ["id", "movimiento_id", "transaction_id", "cash_flow_id"]) ||
          `cash-flow-${index + 1}`,
        date,
        period,
        type,
        concept:
          pick(record, [
            "concepto",
            "descripcion",
            "description",
            "detalle",
            "categoria",
            "category",
          ]) || "-",
        amount,
        repeatsMonthly,
        startPeriod,
        endPeriod: repeatsMonthly ? endPeriod : period,
        notes: pick(record, ["notas", "notes", "observaciones"]),
        active,
        source: "manual",
        createdAt:
          parseDateTime(pick(record, ["creado_en", "created_at", "created"])) ??
          new Date().toISOString(),
        updatedAt:
          parseDateTime(
            pick(record, ["actualizado_en", "updated_at", "updated", "modificado"]),
          ) ?? new Date().toISOString(),
      };
    })
    .filter((transaction): transaction is CashFlowTransactionRecord =>
      Boolean(transaction),
    );
}

function mapClubRowsToPlayers(rows: unknown[][]): PlayerRecord[] {
  const seenIds = new Set<string>();

  return rowsToRecords(rows)
    .map((record, index) => {
      const name = pick(record, ["nombre", "name", "jugador", "player"]).trim();

      if (!name) {
        return null;
      }

      const baseId = createClubPlayerId(name) || `player-${index + 1}`;
      const id = createUniqueClubPlayerId(baseId, seenIds);

      return {
        id,
        name: name.trim(),
        category:
          pick(record, ["categoria", "category", "division", "equipo"]) || "Plantel",
        phone: normalizeClubPhone(
          pick(record, ["telefono", "phone", "whatsapp", "celular"]),
        ),
        email: pick(record, ["email", "correo", "mail", "correo_electronico"]),
        monthlyFee: parseMoney(
          pick(record, ["cuota", "monto_mensual", "monthly_fee", "importe"]),
        ),
        observations: pick(record, ["observaciones", "observacion", "notas", "notes"]),
        status: "activo",
      } satisfies PlayerRecord;
    })
    .filter((player): player is PlayerRecord => Boolean(player));
}

function mapClubRowsToFees({
  players,
  trackingRows,
  finalFeeRows,
  formResponseRows,
}: {
  players: PlayerRecord[];
  trackingRows: unknown[][];
  finalFeeRows: unknown[][];
  formResponseRows: unknown[][];
}): FeeRecord[] {
  const year = getClubSheetYear(trackingRows);
  const today = new Date();
  const playersByName = new Map(
    players.map((player) => [normalizeClubPlayerName(player.name), player]),
  );
  const amountsByPlayerPeriod = mapClubFinalFeeAmounts(finalFeeRows, year);
  const paymentsByPlayerPeriod = mapClubPaymentsByPlayerPeriod(formResponseRows);
  const rows = trackingRows.slice(2);

  return rows.flatMap((row, rowIndex) => {
    const rawName = String(row[0] ?? "").trim();
    const normalizedName = normalizeClubPlayerName(rawName);

    if (!normalizedName) {
      return [];
    }

    const player = playersByName.get(normalizedName);
    const playerId =
      player?.id ?? createClubPlayerId(rawName) ?? `player-${rowIndex + 1}`;
    const playerFees: FeeRecord[] = [];

    for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
      const rawStatus = String(row[monthIndex + 1] ?? "").trim();

      if (!isChargeableClubStatus(rawStatus)) {
        continue;
      }

      const period = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
      const dueDate = `${period}-10`;
      const amount =
        amountsByPlayerPeriod.get(`${normalizedName}:${period}`) ??
        player?.monthlyFee ??
        0;
      const paidAt = paymentsByPlayerPeriod.get(`${normalizedName}:${period}`);
      const status =
        paidAt || isClubPaidStatus(rawStatus)
          ? "paid"
          : normalizeFeeStatus("pendiente", dueDate, today);

      playerFees.push({
        id: `fee-${playerId}-${period}`,
        playerId,
        period,
        amount,
        status,
        dueDate,
        paidAt,
      });
    }

    return playerFees;
  });
}

function mapClubFeesToIncomeTransactions(
  players: PlayerRecord[],
  fees: FeeRecord[],
): CashFlowTransactionRecord[] {
  const playersById = new Map(players.map((player) => [player.id, player]));

  return fees
    .filter((fee) => fee.status === "paid" && fee.amount > 0)
    .map((fee) => {
      const player = playersById.get(fee.playerId);

      return {
        id: `income-${fee.id}`,
        date: fee.paidAt,
        period: fee.period,
        type: "income",
        concept: `Cuota ${player?.name ?? fee.playerId}`,
        amount: fee.amount,
        repeatsMonthly: false,
        startPeriod: fee.period,
        endPeriod: fee.period,
        notes: "Ingreso legacy desde cuotas pagadas.",
        active: true,
        source: "legacy",
      };
    });
}

function mapClubExpenseRowsToTransactions(
  rows: unknown[][],
): CashFlowTransactionRecord[] {
  const transactions: CashFlowTransactionRecord[] = [];

  rowsToRecords(rows).forEach((record, index) => {
    const amount = Math.abs(parseMoney(pick(record, ["monto", "importe", "amount"])));

    if (amount === 0) {
      return;
    }

    const date = parseClubDateTime(pick(record, ["fecha", "date", "dia"]));

    transactions.push({
      id: pick(record, ["id", "movimiento_id"]) || `expense-${index + 1}`,
      date,
      period: getPeriodFromDate(date) ?? getCurrentPeriod(),
      type: "expense",
      concept:
        pick(record, ["concepto", "descripcion", "detalle", "category"]) ||
        "Gasto del club",
      amount,
      repeatsMonthly: false,
      startPeriod: getPeriodFromDate(date) ?? getCurrentPeriod(),
      endPeriod: getPeriodFromDate(date) ?? getCurrentPeriod(),
      notes: "Gasto legacy del club.",
      active: true,
      source: "legacy",
    });
  });

  return transactions;
}

function mapClubFinalFeeAmounts(rows: unknown[][], fallbackYear: number) {
  const year = getClubSheetYear(rows) || fallbackYear;
  const amounts = new Map<string, number>();

  for (const row of rows.slice(2)) {
    const normalizedName = normalizeClubPlayerName(String(row[0] ?? ""));

    if (!normalizedName) {
      continue;
    }

    for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
      const period = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
      const amount = parseMoney(String(row[monthIndex + 1] ?? ""));

      if (amount > 0) {
        amounts.set(`${normalizedName}:${period}`, amount);
      }
    }
  }

  return amounts;
}

function mapClubPaymentsByPlayerPeriod(rows: unknown[][]) {
  const payments = new Map<string, string>();

  for (const record of rowsToRecords(rows)) {
    const name = pick(record, [
      "nombren_del_jugador",
      "nombre_del_jugador",
      "nombre_jugador",
      "nombre_y_apellido",
      "jugador",
      "nombre",
      "player",
    ]);
    const year = Number(pick(record, ["ano", "anio", "year", "ano_vigente"]));
    const month = monthNameToNumber(
      pick(record, [
        "mes",
        "mes_vigente",
        "mes_de_la_cuota",
        "mes_cuota",
        "mes_pago",
        "month",
      ]),
    );
    const paidAt =
      parseClubDateTime(pick(record, ["marca_temporal", "timestamp", "fecha"])) ??
      getTodayIsoDate();

    if (!name || !Number.isFinite(year) || !month) {
      continue;
    }

    const period = `${year}-${String(month).padStart(2, "0")}`;
    payments.set(`${normalizeClubPlayerName(name)}:${period}`, paidAt);
  }

  return payments;
}

function mapFormResponsesToPaidFees(
  players: PlayerRecord[],
  rows: unknown[][],
): FeeRecord[] {
  const paymentsByPlayerPeriod = mapClubPaymentsByPlayerPeriod(rows);
  const playersByName = new Map(
    players.map((player) => [normalizeClubPlayerName(player.name), player]),
  );

  return Array.from(paymentsByPlayerPeriod.entries()).flatMap(([key, paidAt]) => {
    const [normalizedName, period] = key.split(":");
    const player = playersByName.get(normalizedName);

    if (!player || !period) {
      return [];
    }

    return {
      id: `form-payment-${player.id}-${period}`,
      playerId: player.id,
      period,
      amount: 0,
      status: "paid",
      dueDate: `${period}-10`,
      paidAt,
    } satisfies FeeRecord;
  });
}

function mergeFeeRecords(primaryFees: FeeRecord[], paymentFees: FeeRecord[]) {
  const feesByKey = new Map<string, FeeRecord>();

  primaryFees.forEach((fee) => {
    feesByKey.set(`${fee.playerId}:${fee.period}`, fee);
  });

  paymentFees.forEach((paymentFee) => {
    const key = `${paymentFee.playerId}:${paymentFee.period}`;
    const existing = feesByKey.get(key);

    feesByKey.set(key, {
      ...existing,
      ...paymentFee,
      amount: Math.max(existing?.amount ?? 0, paymentFee.amount),
      status: "paid",
      paidAt: paymentFee.paidAt || existing?.paidAt,
    });
  });

  return Array.from(feesByKey.values());
}

function mapRowsToFeeCalculatorCostRecords(rows: unknown[][]): FeeCalculatorCost[] {
  return rowsToRecords(rows).map((record, index) => {
    const startPeriod =
      normalizePeriod(
        pick(record, ["vigencia_desde", "desde", "periodo_desde", "start_period"]),
      ) ?? getCurrentPeriod();
    const name =
      pick(record, ["nombre", "name", "costo", "concepto"]) || `Costo ${index + 1}`;

    return {
      id: pick(record, ["id", "costo_id", "cost_id"]) || `cost-${index + 1}`,
      name,
      type: normalizeFeeCalculatorCostType(pick(record, ["tipo", "type"])),
      startPeriod,
      endPeriod: startPeriod,
      amount: Math.max(
        parseMoney(pick(record, ["monto", "importe", "amount", "valor"])),
        0,
      ),
      repeatsMonthly: false,
      splitBetween: Math.max(
        Math.round(
          parseMoney(
            pick(record, ["dividir_entre", "personas", "split_between", "jugadores"]),
          ),
        ),
        1,
      ),
      forecastUnits: Math.max(
        parseMoney(
          pick(record, [
            "cantidad_estimada",
            "canchas_estimadas",
            "forecast_units",
            "cantidad",
          ]),
        ) || 1,
        0,
      ),
      notes: pick(record, ["notas", "notes", "observaciones", "detalle"]),
      active: parseLooseBoolean(pick(record, ["activo", "active"]), true),
      createdAt:
        parseDateTime(pick(record, ["creado_en", "created_at", "created"])) ??
        new Date().toISOString(),
      updatedAt:
        parseDateTime(
          pick(record, ["actualizado_en", "updated_at", "updated", "modificado"]),
        ) ?? new Date().toISOString(),
    } satisfies FeeCalculatorCost;
  });
}

function mapRowsToFeeCalculatorCosts(rows: unknown[][]): FeeCalculatorCost[] {
  return mapRowsToFeeCalculatorCostRecords(rows)
    .filter((cost) => cost.active)
    .sort((left, right) => {
      const periodComparison = left.startPeriod.localeCompare(right.startPeriod);

      if (periodComparison !== 0) {
        return periodComparison;
      }

      return left.createdAt.localeCompare(right.createdAt);
    });
}

function mapRowsToFeeCalculatorActuals(rows: unknown[][]): FeeCalculatorActual[] {
  return rowsToRecords(rows)
    .map((record, index) => {
      const period =
        normalizePeriod(pick(record, ["periodo", "period", "mes"])) ?? getCurrentPeriod();
      const costId = pick(record, ["costo_id", "cost_id", "id_costo"]);

      if (!costId) {
        return null;
      }

      return {
        id: pick(record, ["id", "real_id", "actual_id"]) || `actual-${index + 1}`,
        costId,
        period,
        actualUnits: Math.max(
          parseMoney(
            pick(record, ["cantidad_real", "canchas_reales", "actual_units", "cantidad"]),
          ),
          0,
        ),
        notes: pick(record, ["notas", "notes", "observaciones"]),
        updatedAt:
          parseDateTime(
            pick(record, ["actualizado_en", "updated_at", "updated", "modificado"]),
          ) ?? new Date().toISOString(),
      } satisfies FeeCalculatorActual;
    })
    .filter((actual): actual is FeeCalculatorActual => Boolean(actual));
}

function mapRowsToFeeCalculatorPlayerStatuses(
  rows: unknown[][],
): FeeCalculatorPlayerStatusRecord[] {
  return rowsToRecords(rows)
    .map((record, index) => {
      const playerName = pick(record, [
        "jugador",
        "nombre",
        "nombre_y_apellido",
        "name",
        "player",
      ]);
      const playerId =
        pick(record, ["jugador_id", "player_id", "id_jugador"]) ||
        createClubPlayerId(playerName);
      const period = normalizePeriod(pick(record, ["periodo", "period", "mes"]));

      if (!playerId || !period) {
        return null;
      }

      return {
        id:
          pick(record, ["id", "estado_id", "status_id"]) || `player-status-${index + 1}`,
        playerId,
        playerName,
        period,
        status: normalizePlayerDirectoryStatus(pick(record, ["estado", "status"])),
        notes: pick(record, ["notas", "notes", "observaciones"]),
        updatedAt:
          parseDateTime(
            pick(record, ["actualizado_en", "updated_at", "updated", "modificado"]),
          ) ?? new Date().toISOString(),
      } satisfies FeeCalculatorPlayerStatusRecord;
    })
    .filter((status): status is FeeCalculatorPlayerStatusRecord => status !== null);
}

function mapRowsToRefundPolicy(rows: unknown[][]): FeeRefundPolicyRule[] {
  const rules = rowsToRecords(rows)
    .map((record) => {
      const fromPercent = parsePercentValue(pick(record, ["desde", "from"]));
      const toPercent = parsePercentValue(pick(record, ["hasta", "to"]));
      const refundPercent = parsePercentValue(
        pick(record, ["devolucion", "devolucion_", "refund", "porcentaje"]),
      );

      if (
        !Number.isFinite(fromPercent) ||
        !Number.isFinite(toPercent) ||
        !Number.isFinite(refundPercent)
      ) {
        return null;
      }

      return {
        fromPercent,
        toPercent,
        refundPercent,
      } satisfies FeeRefundPolicyRule;
    })
    .filter((rule): rule is FeeRefundPolicyRule => Boolean(rule))
    .sort((left, right) => left.fromPercent - right.fromPercent);

  return rules.length > 0 ? rules : getDefaultRefundPolicy();
}

function mapRowsToMatches(rows: unknown[][]): MatchRecord[] {
  return rowsToRecords(rows)
    .map((record, index) => {
      const date = parseClubDateTime(pick(record, ["fecha", "date", "dia"]));
      const rival = pick(record, ["rival", "oponente", "contrario"]) || "Rival";
      const venue = pick(record, [
        "local_visitante",
        "local_o_visitante",
        "condicion",
        "sede",
        "venue",
      ]);
      const coachAttended = parseLooseBoolean(
        pick(record, [
          "asistio_joaco",
          "asistio_joaco_",
          "asistencia_joaco",
          "joaco",
          "dt",
        ]),
      );
      const rawPlayers = pick(record, [
        "jugadores_que_ingresaron",
        "jugadores",
        "players",
        "ingresaron",
      ]);
      const players = splitPlayerNames(rawPlayers);

      if (!date || players.length === 0) {
        return null;
      }

      return {
        id: pick(record, ["id", "partido_id", "match_id"]) || `match-${index + 1}`,
        date,
        period: getPeriodFromDate(date) ?? getCurrentPeriod(),
        rival,
        players,
        venue,
        coachAttended,
      } satisfies MatchRecord;
    })
    .filter((match): match is MatchRecord => Boolean(match))
    .sort((left, right) => left.date.localeCompare(right.date));
}

function mapClubExpenseRowsToPlayerCredits(rows: unknown[][]): PlayerExpenseCredit[] {
  return rowsToRecords(rows)
    .map((record) => {
      const playerName = pick(record, [
        "pagado_por",
        "jugador",
        "nombre",
        "player",
        "paid_by",
      ]);
      const amount = Math.abs(
        parseMoney(pick(record, ["monto", "importe", "amount", "valor"])),
      );
      const date = parseClubDateTime(pick(record, ["fecha", "date", "dia"]));

      if (!playerName || amount === 0 || !date) {
        return null;
      }

      return {
        playerName,
        amount,
        period: getPeriodFromDate(date) ?? getCurrentPeriod(),
      };
    })
    .filter(
      (
        credit,
      ): credit is PlayerExpenseCredit & {
        period: string;
      } => Boolean(credit),
    );
}

function buildFeeCalculatorData({
  period,
  players,
  costs,
  actuals,
  playerStatuses,
  refundPolicy,
  matches,
  expenseCredits,
  status,
  message,
  cachedAt,
  revalidateSeconds,
}: {
  period: string;
  players: PlayerRecord[];
  costs: FeeCalculatorCost[];
  actuals: FeeCalculatorActual[];
  playerStatuses: FeeCalculatorPlayerStatusRecord[];
  refundPolicy: FeeRefundPolicyRule[];
  matches: MatchRecord[];
  expenseCredits: Array<PlayerExpenseCredit & { period: string }>;
  status: FeeCalculatorData["source"]["status"];
  message: string;
  cachedAt: string;
  revalidateSeconds: number;
}): FeeCalculatorData {
  const previousPeriod = getPreviousPeriod(period);
  const periodBeforePrevious = getPreviousPeriod(previousPeriod);
  const playerStatusMap = buildFeeCalculatorPlayerStatusMap(playerStatuses, period);
  const calculatorPlayers = players.map((player) =>
    mapPlayerToFeeCalculatorPlayer(player, playerStatusMap),
  );
  const activePlayerIds = new Set(
    calculatorPlayers
      .filter((player) => player.status === "active")
      .map((player) => player.id),
  );
  const activePlayers = players.filter((player) => activePlayerIds.has(player.id));
  const activeCosts = costs.filter((cost) => cost.active);
  const currentPeriodCosts = activeCosts.filter((cost) =>
    isCostActiveForPeriod(cost, period),
  );
  const effectiveActuals = [previousPeriod, periodBeforePrevious].reduce(
    (mergedActuals, actualPeriod) =>
      mergeInferredFeeCalculatorActuals(
        activeCosts,
        mergedActuals,
        matches,
        actualPeriod,
      ),
    actuals,
  );
  const plannedCurrentQuota = calculateBaseQuotaForPeriod(
    activeCosts,
    effectiveActuals,
    period,
    "forecast",
  );
  const adjustments = buildFeeCalculatorAdjustments(
    activeCosts,
    effectiveActuals,
    previousPeriod,
  );
  const previousPeriodBaseQuota = calculateAppBaseQuotaForPeriod(
    activeCosts,
    effectiveActuals,
    previousPeriod,
  );
  const previousCostVariance = adjustments.reduce(
    (total, adjustment) => total + adjustment.variance,
    0,
  );
  const previousPeriodMatches = matches.filter(
    (match) => match.period === previousPeriod,
  );
  const totalMatchesPreviousPeriod = previousPeriodMatches.length;
  const totalLocalMatchesPreviousPeriod =
    previousPeriodMatches.filter(isLocalMatch).length;
  const coachHoursPreviousPeriod =
    previousPeriodMatches.filter((match) => match.coachAttended).length * 3;
  const baseQuota = Math.max(plannedCurrentQuota + previousCostVariance, 0);
  const calculations = activePlayers.map((player) =>
    buildPlayerFeeCalculation({
      player,
      period,
      previousPeriod,
      baseQuota,
      plannedCurrentQuota,
      previousBaseQuota: previousPeriodBaseQuota,
      previousCostVariance,
      matches,
      refundPolicy,
      expenseCredits,
      totalMatchesPreviousPeriod,
    }),
  );

  return {
    period,
    previousPeriod,
    costs,
    actuals: effectiveActuals,
    adjustments,
    players: calculatorPlayers,
    refundPolicy,
    playerCalculations: calculations,
    matchSummaries: calculations.map((calculation) => ({
      playerId: calculation.playerId,
      playerName: calculation.playerName,
      period: previousPeriod,
      playedMatches: calculation.playedMatches,
      totalMatches: calculation.totalMatches,
      attendanceRate: calculation.attendanceRate,
      matches: calculation.matches,
    })),
    summary: {
      period,
      previousPeriod,
      plannedCurrentQuota,
      previousBaseQuota: previousPeriodBaseQuota,
      previousCostVariance,
      baseQuota,
      activeCosts: currentPeriodCosts.length,
      players: activePlayers.length,
      totalMatchesPreviousPeriod,
      totalLocalMatchesPreviousPeriod,
      coachHoursPreviousPeriod,
    },
    emptyState: {
      title: status === "ready" ? "Calculador de cuota" : "Calculador sin costos",
      description:
        status === "ready"
          ? "Cuotas calculadas con costos, asistencia, devoluciones y gastos."
          : "Cargá los costos mensuales para calcular la cuota base y la cuota por jugador.",
    },
    source: {
      provider: "google-sheets",
      status,
      message,
      cachedAt,
      revalidateSeconds,
    },
  };
}

function buildPlayerFeeCalculation({
  player,
  period,
  previousPeriod,
  baseQuota,
  plannedCurrentQuota,
  previousBaseQuota,
  previousCostVariance,
  matches,
  refundPolicy,
  expenseCredits,
  totalMatchesPreviousPeriod,
}: {
  player: PlayerRecord;
  period: string;
  previousPeriod: string;
  baseQuota: number;
  plannedCurrentQuota: number;
  previousBaseQuota: number;
  previousCostVariance: number;
  matches: MatchRecord[];
  refundPolicy: FeeRefundPolicyRule[];
  expenseCredits: Array<PlayerExpenseCredit & { period: string }>;
  totalMatchesPreviousPeriod: number;
}): FeePlayerCalculation {
  const normalizedPlayerName = normalizeClubPlayerName(player.name);
  const playerMatches = matches
    .filter(
      (match) =>
        match.period === previousPeriod &&
        match.players.some(
          (name) => normalizeClubPlayerName(name) === normalizedPlayerName,
        ),
    )
    .map<FeeMatchDetail>((match) => ({
      date: match.date,
      rival: match.rival,
    }));
  const playedMatches = playerMatches.length;
  const attendanceRate =
    totalMatchesPreviousPeriod > 0 ? playedMatches / totalMatchesPreviousPeriod : 0;
  const refundPercent = findRefundPercent(refundPolicy, attendanceRate * 100);
  const refundAmount = previousBaseQuota * (refundPercent / 100);
  const expenseCredit = expenseCredits
    .filter(
      (credit) =>
        credit.period === previousPeriod &&
        normalizeClubPlayerName(credit.playerName) === normalizedPlayerName,
    )
    .reduce((total, credit) => total + credit.amount, 0);
  const finalQuota = Math.max(baseQuota - refundAmount - expenseCredit, 0);

  return {
    playerId: player.id,
    playerName: player.name,
    currentPeriod: period,
    previousPeriod,
    baseQuota,
    plannedCurrentQuota,
    previousBaseQuota,
    previousCostVariance,
    refundPercent,
    refundAmount,
    expenseCredit,
    finalQuota,
    attendanceRate,
    playedMatches,
    totalMatches: totalMatchesPreviousPeriod,
    matches: playerMatches,
  };
}

function mapPlayerToFeeCalculatorPlayer(
  player: PlayerRecord,
  statusMap: Map<string, PlayerDirectoryStatus>,
): FeeCalculatorPlayer {
  const status =
    statusMap.get(player.id) ??
    statusMap.get(normalizeClubPlayerName(player.name)) ??
    "active";

  return {
    id: player.id,
    name: player.name,
    category: player.category,
    status,
  };
}

function buildFeeCalculatorPlayerStatusMap(
  playerStatuses: FeeCalculatorPlayerStatusRecord[],
  period: string,
) {
  return playerStatuses
    .filter((status) => status.period === period)
    .reduce<Map<string, PlayerDirectoryStatus>>((map, status) => {
      map.set(status.playerId, status.status);

      const normalizedName = normalizeClubPlayerName(status.playerName);

      if (normalizedName) {
        map.set(normalizedName, status.status);
      }

      return map;
    }, new Map());
}

function mapRowsToAppSettings(rows: unknown[][]): AppSettings {
  if (rows.length === 0) {
    return DEFAULT_APP_SETTINGS;
  }

  const values = rowsToSettingsMap(rows);

  return normalizeAppSettings({
    clubName: pickSetting(values, ["club_name", "nombre_club", "name", "nombre"]),
    logoUrl: pickSetting(values, ["logo_url", "logo", "club_logo"]),
    whatsAppMessageTemplate: pickSetting(values, [
      "whatsapp_message_template",
      "mensaje_whatsapp",
      "whatsapp_message",
      "whatsapp_template",
      "recordatorio_whatsapp",
    ]),
    monthlyFee: parseMoney(
      pickSetting(values, ["monthly_fee", "valor_cuota", "cuota", "fee"]),
    ),
    primaryColor:
      normalizeHexColor(
        pickSetting(values, ["primary_color", "color_principal", "brand_color"]),
      ) ?? DEFAULT_APP_SETTINGS.primaryColor,
    darkMode: parseBooleanValue(
      pickSetting(values, ["dark_mode", "modo_oscuro", "theme_dark"]),
    ),
  });
}

function rowsToSettingsMap(rows: unknown[][]) {
  const [firstRow = []] = rows;
  const headers = firstRow.map((cell) => normalizeHeader(String(cell)));
  const keyIndex = findHeaderIndex(headers, ["clave", "key", "setting", "campo"]);
  const valueIndex = findHeaderIndex(headers, ["valor", "value", "contenido"]);
  const dataRows = keyIndex >= 0 && valueIndex >= 0 ? rows.slice(1) : rows;
  const settings = new Map<string, string>();

  for (const row of dataRows) {
    const key = normalizeHeader(String(row[keyIndex >= 0 ? keyIndex : 0] ?? ""));
    const value = String(row[valueIndex >= 0 ? valueIndex : 1] ?? "").trim();

    if (key) {
      settings.set(key, value);
    }
  }

  return settings;
}

function pickSetting(settings: Map<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = settings.get(key);

    if (value) {
      return value;
    }
  }

  return "";
}

function buildSettingsRows(settings: AppSettings) {
  return [
    ["clave", "valor"],
    ...APP_SETTINGS_ROWS.map(({ key, label }) => [
      label,
      formatSettingValue(settings[key]),
    ]),
  ];
}

function formatSettingValue(value: AppSettings[keyof AppSettings]) {
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return String(value);
}

function mapRowsToAuditEvents(rows: unknown[][]): AuditEvent[] {
  return rowsToRecords(rows)
    .map((record, index) => {
      const timestamp =
        parseDateTime(pick(record, ["timestamp", "fecha", "created_at"])) ??
        new Date().toISOString();
      const action = normalizeAuditAction(pick(record, ["action", "accion"]));
      const entityType = normalizeAuditEntityType(
        pick(record, ["entity_type", "entidad", "entity"]),
      );

      return {
        id: pick(record, ["id", "audit_id"]) || `audit-${index + 1}`,
        timestamp,
        actor: {
          id: pick(record, ["actor_id", "user_id", "usuario_id"]) || "system",
          name: pick(record, ["actor_name", "user_name", "usuario"]) || "Sistema",
          role: normalizeAuditActorRole(pick(record, ["actor_role", "role", "rol"])),
        },
        action,
        entityType,
        entityId: pick(record, ["entity_id", "entidad_id", "resource_id"]) || "-",
        summary: pick(record, ["summary", "resumen", "message", "mensaje"]) || action,
        metadata: parseMetadata(pick(record, ["metadata", "meta", "context"])),
      };
    })
    .sort(compareByTimestampDesc);
}

function mapRowsToLogs(rows: unknown[][]): AppLogEntry[] {
  return rowsToRecords(rows)
    .map((record, index) => ({
      id: pick(record, ["id", "log_id"]) || `log-${index + 1}`,
      timestamp:
        parseDateTime(pick(record, ["timestamp", "fecha", "created_at"])) ??
        new Date().toISOString(),
      level: normalizeLogLevel(pick(record, ["level", "nivel"])),
      source: pick(record, ["source", "origen", "servicio"]) || "system",
      message: pick(record, ["message", "mensaje", "summary"]) || "-",
      context: parseMetadata(pick(record, ["context", "metadata", "meta"])),
    }))
    .sort(compareByTimestampDesc);
}

function mapRowsToNotifications(rows: unknown[][]): AppNotification[] {
  return rowsToRecords(rows)
    .map((record, index) => ({
      id: pick(record, ["id", "notification_id"]) || `notification-${index + 1}`,
      createdAt:
        parseDateTime(pick(record, ["created_at", "fecha", "timestamp"])) ??
        new Date().toISOString(),
      title: pick(record, ["title", "titulo"]) || "Notificacion",
      message: pick(record, ["message", "mensaje", "description"]) || "-",
      type: normalizeNotificationType(pick(record, ["type", "tipo"])),
      status: normalizeNotificationStatus(pick(record, ["status", "estado"])),
      targetRole: normalizeTargetRole(pick(record, ["target_role", "rol", "audience"])),
      readAt: parseDateTime(pick(record, ["read_at", "leido_el"])),
    }))
    .sort(compareByCreatedAtDesc);
}

function mapRowsToReminderJobs(rows: unknown[][]): ReminderJob[] {
  return rowsToRecords(rows)
    .map((record, index) => ({
      id: pick(record, ["id", "reminder_id"]) || `reminder-${index + 1}`,
      createdAt:
        parseDateTime(pick(record, ["created_at", "fecha", "timestamp"])) ??
        new Date().toISOString(),
      scheduledFor:
        parseDateTime(pick(record, ["scheduled_for", "programado_para"])) ??
        new Date().toISOString(),
      period:
        normalizePeriod(pick(record, ["period", "periodo", "mes"])) ?? getCurrentPeriod(),
      playerId: pick(record, ["player_id", "jugador_id", "id_jugador"]) || "-",
      playerName: pick(record, ["player_name", "jugador", "nombre"]) || "-",
      phone: pick(record, ["phone", "telefono", "whatsapp"]) || "-",
      paymentStatus: normalizePlayerPaymentStatus(
        pick(record, ["payment_status", "estado_pago", "estado"]),
      ),
      message: pick(record, ["message", "mensaje"]) || "-",
      status: normalizeReminderStatus(pick(record, ["status", "estado_recordatorio"])),
      sentAt: parseDateTime(pick(record, ["sent_at", "enviado_el"])),
      error: pick(record, ["error", "motivo_error"]) || undefined,
    }))
    .sort(compareByCreatedAtDesc);
}

function mapRowsToPaymentRecords(rows: unknown[][]): PaymentRecord[] {
  return rowsToRecords(rows)
    .map((record, index) => {
      const provider = normalizePaymentProvider(pick(record, ["provider", "proveedor"]));
      const now = new Date().toISOString();

      return {
        id: pick(record, ["id", "payment_id"]) || `payment-${index + 1}`,
        provider,
        externalId:
          pick(record, ["external_id", "externalid", "id_externo"]) ||
          `external-${index + 1}`,
        playerId: pick(record, ["player_id", "jugador_id", "id_jugador"]) || "-",
        playerName: pick(record, ["player_name", "jugador", "nombre"]) || "-",
        period:
          normalizePeriod(pick(record, ["period", "periodo", "mes"])) ??
          getCurrentPeriod(),
        amount: parseMoney(pick(record, ["amount", "monto", "importe"])),
        currency: pick(record, ["currency", "moneda"]) || "ARS",
        status: normalizePaymentStatus(pick(record, ["status", "estado"])),
        checkoutUrl: pick(record, ["checkout_url", "init_point", "url"]) || undefined,
        createdAt: parseDateTime(pick(record, ["created_at", "fecha"])) ?? now,
        updatedAt: parseDateTime(pick(record, ["updated_at", "actualizado_el"])) ?? now,
        rawEventType:
          pick(record, ["raw_event_type", "event_type", "evento"]) || undefined,
      };
    })
    .sort(compareByUpdatedAtDesc);
}

function buildPremiumData({
  audit,
  logs,
  notifications,
  reminders,
  payments,
  status,
  message,
  cachedAt,
  revalidateSeconds,
}: {
  audit: AuditEvent[];
  logs: AppLogEntry[];
  notifications: AppNotification[];
  reminders: ReminderJob[];
  payments: PaymentRecord[];
  status: "ready" | "empty" | "error";
  message: string;
  cachedAt: string;
  revalidateSeconds: number;
}): PremiumData {
  return {
    summary: {
      unreadNotifications: notifications.filter(
        (notification) => notification.status === "unread",
      ).length,
      queuedReminders: reminders.filter((reminder) => reminder.status === "queued")
        .length,
      failedReminders: reminders.filter((reminder) => reminder.status === "failed")
        .length,
      pendingPayments: payments.filter((payment) =>
        ["created", "pending", "unknown"].includes(payment.status),
      ).length,
      approvedPayments: payments.filter((payment) =>
        ["approved", "paid"].includes(payment.status),
      ).length,
      auditEvents: audit.length,
      errorLogs: logs.filter((log) => log.level === "error").length,
    },
    audit,
    logs,
    notifications,
    reminders,
    payments,
    source: {
      provider: "google-sheets",
      status,
      message,
      cachedAt,
      revalidateSeconds,
    },
  };
}

function buildPaymentWritableRow(
  headers: string[],
  input: UpsertPaymentRecordInput,
  now: string,
) {
  const id = `PAY-${input.provider}-${input.externalId}`;
  const fallbackValues: Record<string, string | number> = {
    id,
    payment_id: id,
    provider: input.provider,
    proveedor: input.provider,
    external_id: input.externalId,
    externalid: input.externalId,
    id_externo: input.externalId,
    player_id: input.playerId ?? "",
    jugador_id: input.playerId ?? "",
    id_jugador: input.playerId ?? "",
    player_name: input.playerName ?? "",
    jugador: input.playerName ?? "",
    nombre: input.playerName ?? "",
    period: input.period ?? getCurrentPeriod(),
    periodo: input.period ?? getCurrentPeriod(),
    mes: input.period ?? getCurrentPeriod(),
    amount: input.amount ?? 0,
    monto: input.amount ?? 0,
    importe: input.amount ?? 0,
    currency: input.currency ?? "ARS",
    moneda: input.currency ?? "ARS",
    status: input.status,
    estado: input.status,
    checkout_url: input.checkoutUrl ?? "",
    init_point: input.checkoutUrl ?? "",
    url: input.checkoutUrl ?? "",
    created_at: now,
    fecha: now,
    updated_at: now,
    actualizado_el: now,
    raw_event_type: input.rawEventType ?? "",
    event_type: input.rawEventType ?? "",
    evento: input.rawEventType ?? "",
  };

  return headers.map((header) => fallbackValues[header] ?? "");
}

function buildPlayersExport(players: PlayerRecord[]): ExportData {
  const columns: ExportColumn[] = [
    { key: "id", header: "ID" },
    { key: "name", header: "Nombre" },
    { key: "category", header: "Categoria" },
    { key: "phone", header: "Telefono" },
    { key: "monthlyFee", header: "Valor de cuota", type: "currency" },
    { key: "status", header: "Estado" },
    { key: "joinedAt", header: "Fecha alta", type: "date" },
    { key: "leftAt", header: "Fecha baja", type: "date" },
    { key: "observations", header: "Observaciones" },
  ];
  const rows = players.map<ExportRow>((player) => ({
    id: player.id,
    name: player.name,
    category: player.category,
    phone: player.phone,
    monthlyFee: player.monthlyFee,
    status: formatPlayerStatus(player),
    joinedAt: player.joinedAt ?? "",
    leftAt: player.leftAt ?? "",
    observations: player.observations,
  }));

  return buildExportData("players", "Jugadores", "jugadores", columns, rows);
}

function buildFeesExport(players: PlayerRecord[], fees: FeeRecord[]): ExportData {
  const playersById = new Map(players.map((player) => [player.id, player]));
  const columns: ExportColumn[] = [
    { key: "id", header: "ID" },
    { key: "playerId", header: "ID jugador" },
    { key: "playerName", header: "Jugador" },
    { key: "category", header: "Categoria" },
    { key: "period", header: "Periodo" },
    { key: "amount", header: "Monto", type: "currency" },
    { key: "status", header: "Estado" },
    { key: "dueDate", header: "Vencimiento", type: "date" },
    { key: "paidAt", header: "Fecha de pago", type: "date" },
  ];
  const rows = fees.map<ExportRow>((fee) => {
    const player = playersById.get(fee.playerId);

    return {
      id: fee.id,
      playerId: fee.playerId,
      playerName: player?.name ?? fee.playerId,
      category: player?.category ?? "",
      period: fee.period,
      amount: fee.amount,
      status: formatFeeStatus(fee.status),
      dueDate: fee.dueDate ?? "",
      paidAt: fee.paidAt ?? "",
    };
  });

  return buildExportData("fees", "Cuotas", "cuotas", columns, rows);
}

function buildIncomeExport(players: PlayerRecord[], fees: FeeRecord[]): ExportData {
  const playersById = new Map(players.map((player) => [player.id, player]));
  const columns: ExportColumn[] = [
    { key: "period", header: "Periodo" },
    { key: "paidAt", header: "Fecha de pago", type: "date" },
    { key: "playerId", header: "ID jugador" },
    { key: "playerName", header: "Jugador" },
    { key: "category", header: "Categoria" },
    { key: "amount", header: "Ingreso", type: "currency" },
    { key: "source", header: "Origen" },
  ];
  const rows = fees
    .filter((fee) => fee.status === "paid")
    .sort(compareFeesDesc)
    .map<ExportRow>((fee) => {
      const player = playersById.get(fee.playerId);

      return {
        period: fee.period,
        paidAt: fee.paidAt ?? "",
        playerId: fee.playerId,
        playerName: player?.name ?? fee.playerId,
        category: player?.category ?? "",
        amount: fee.amount,
        source: "Cuota",
      };
    });

  return buildExportData("income", "Ingresos", "ingresos", columns, rows);
}

function buildCashFlowExport(transactions: CashFlowTransactionRecord[]): ExportData {
  const columns: ExportColumn[] = [
    { key: "id", header: "ID" },
    { key: "date", header: "Fecha", type: "date" },
    { key: "period", header: "Periodo" },
    { key: "type", header: "Tipo" },
    { key: "concept", header: "Concepto" },
    { key: "amount", header: "Monto", type: "currency" },
    { key: "repeatsMonthly", header: "Recurrente" },
    { key: "startPeriod", header: "Desde" },
    { key: "endPeriod", header: "Hasta" },
    { key: "notes", header: "Notas" },
  ];
  const rows = transactions.map<ExportRow>((transaction) => ({
    id: transaction.id,
    date: transaction.date ?? "",
    period: transaction.period,
    type: transaction.type === "income" ? "Ingreso" : "Gasto",
    concept: transaction.concept,
    amount: transaction.type === "income" ? transaction.amount : -transaction.amount,
    repeatsMonthly: transaction.repeatsMonthly ? "Si" : "No",
    startPeriod: transaction.startPeriod,
    endPeriod: transaction.endPeriod,
    notes: transaction.notes,
  }));

  return buildExportData("cash-flow", "Cash Flow", "cash-flow", columns, rows);
}

function buildExportData(
  dataset: ExportDataset,
  title: string,
  fileName: string,
  columns: ExportColumn[],
  rows: ExportRow[],
): ExportData {
  return {
    dataset,
    title,
    fileName,
    generatedAt: new Date().toISOString(),
    columns,
    rows,
  };
}

function formatFeeStatus(status: FeeStatus) {
  if (status === "paid") {
    return "Pagada";
  }

  if (status === "overdue") {
    return "Vencida";
  }

  return "Pendiente";
}

function formatPlayerStatus(player: PlayerRecord) {
  if (isDroppedPlayer(player)) {
    return "Inactivo";
  }

  return player.status || "Activo";
}

function buildDashboardData({
  period,
  players,
  fees,
  feeCalculations,
  status,
  message,
  cachedAt,
  revalidateSeconds,
}: {
  period: string;
  players: PlayerRecord[];
  fees: FeeRecord[];
  feeCalculations: FeePlayerCalculation[];
  status: DashboardData["source"]["status"];
  message: string;
  cachedAt: string;
  revalidateSeconds: number;
}): DashboardData {
  const currentPeriod = period;
  const currentYear = Number(period.slice(0, 4));
  const paidFees = fees.filter((fee) => fee.status === "paid");
  const pendingFees = fees.filter((fee) => fee.status !== "paid");
  const overdueFees = fees.filter((fee) => fee.status === "overdue");
  const monthlyRevenue = paidFees
    .filter(
      (fee) =>
        fee.period === currentPeriod || getPeriodFromDate(fee.paidAt) === currentPeriod,
    )
    .reduce((total, fee) => total + fee.amount, 0);
  const annualRevenue = paidFees
    .filter((fee) => fee.period.startsWith(`${currentYear}-`))
    .reduce((total, fee) => total + fee.amount, 0);
  const overduePlayerIds = new Set(overdueFees.map((fee) => fee.playerId));
  const pendingPlayerIds = new Set(pendingFees.map((fee) => fee.playerId));
  const totalPlayers = players.length || new Set(fees.map((fee) => fee.playerId)).size;
  const activePlayers =
    players.length > 0
      ? players.filter((player) => !isDroppedPlayer(player)).length
      : totalPlayers;
  const debtors = overduePlayerIds.size;
  const delinquencyRate = activePlayers > 0 ? debtors / activePlayers : 0;
  const newPlayers = players.filter(
    (player) => getPeriodFromDate(player.joinedAt) === currentPeriod,
  ).length;
  const droppedPlayers = players.filter((player) => {
    const leftPeriod = getPeriodFromDate(player.leftAt);

    return leftPeriod === currentPeriod || (isDroppedPlayer(player) && !leftPeriod);
  }).length;
  const upToDatePlayers =
    players.length > 0
      ? players.filter(
          (player) => !isDroppedPlayer(player) && !pendingPlayerIds.has(player.id),
        ).length
      : Math.max(totalPlayers - pendingPlayerIds.size, 0);
  const pendingNotOverduePlayers = Array.from(pendingPlayerIds).filter(
    (playerId) => !overduePlayerIds.has(playerId),
  ).length;

  return {
    period,
    metrics: [
      {
        id: "total-players",
        title: "Cantidad de jugadores",
        value: formatInteger(activePlayers),
        detail: `${formatInteger(totalPlayers)} registrados`,
        tone: "neutral",
      },
      {
        id: "delinquency-rate",
        title: "Morosidad",
        value: formatPercent(delinquencyRate),
        detail: `${formatInteger(debtors)} jugadores morosos`,
        tone: debtors > 0 ? "danger" : "success",
      },
      {
        id: "monthly-income",
        title: "Ingresos del mes",
        value: formatCurrency(monthlyRevenue),
        detail: currentPeriod,
        tone: "success",
      },
      {
        id: "annual-income",
        title: "Ingresos del año",
        value: formatCurrency(annualRevenue),
        detail: `Comparativa ${currentYear}`,
        tone: "success",
      },
      {
        id: "new-players",
        title: "Jugadores nuevos",
        value: formatInteger(newPlayers),
        detail: currentPeriod,
        tone: newPlayers > 0 ? "success" : "neutral",
      },
      {
        id: "dropped-players",
        title: "Jugadores dados de baja",
        value: formatInteger(droppedPlayers),
        detail: "Mes actual o estado baja",
        tone: droppedPlayers > 0 ? "warning" : "neutral",
      },
    ],
    charts: {
      feeStatus: buildFeeStatusChart(
        paidFees.length,
        pendingFees.length,
        overdueFees.length,
      ),
      playerStatus: buildPlayerStatusChart(
        upToDatePlayers,
        debtors,
        pendingNotOverduePlayers,
      ),
      monthlyCollections: buildMonthlyCollections(fees),
      annualComparison: buildAnnualComparison(fees),
      playerLifecycle: buildPlayerLifecycle(players),
      delinquencyTrend: buildDelinquencyTrend(players, fees),
    },
    players: buildPlayerTableRows(players, fees, feeCalculations, period),
    emptyState: {
      title: status === "ready" ? "Dashboard principal" : "Dashboard sin datos",
      description:
        status === "ready"
          ? "Resumen operativo de jugadores, cuotas e ingresos."
          : "Carga jugadores y cuotas en Google Sheets para ver el dashboard completo.",
    },
    source: {
      provider: "google-sheets",
      status,
      message,
      cachedAt,
      revalidateSeconds,
    },
  };
}

function buildCashFlowData({
  period,
  transactions,
  feeIncomeByPeriod,
  status,
  message,
  cachedAt,
  revalidateSeconds,
}: {
  period: string;
  transactions: CashFlowTransactionRecord[];
  feeIncomeByPeriod: Map<string, number>;
  status: CashFlowData["source"]["status"];
  message: string;
  cachedAt: string;
  revalidateSeconds: number;
}): CashFlowData {
  const projectionPeriods = getCashFlowProjectionPeriods(period);
  const expandedTransactions = expandCashFlowTransactions(
    transactions,
    projectionPeriods,
  );
  const feeTransactions = buildFeeIncomeTransactions(feeIncomeByPeriod);
  const projectedTransactions = [...expandedTransactions, ...feeTransactions];
  const monthlySeries = buildCashFlowMonthlySeries(
    projectedTransactions,
    projectionPeriods,
  );
  const currentManualTransactions = expandedTransactions.filter(
    (transaction) => transaction.period === period,
  );
  const expectedFeeIncome = feeIncomeByPeriod.get(period) ?? 0;
  const additionalIncome = sumCashFlow(currentManualTransactions, "income");
  const currentIncome = expectedFeeIncome + additionalIncome;
  const currentExpenses = sumCashFlow(currentManualTransactions, "expense");
  const currentBalance = currentIncome - currentExpenses;
  const totalCash =
    sumCashFlow(projectedTransactions, "income") -
    sumCashFlow(projectedTransactions, "expense");

  return {
    period,
    metrics: buildCashFlowMetrics({
      currentIncome,
      currentExpenses,
      currentBalance,
      totalCash,
      currentPeriod: period,
      expectedFeeIncome,
      additionalIncome,
    }),
    charts: {
      monthly: buildCashFlowMonthlyChart(projectedTransactions, period, monthlySeries),
      annual: buildCashFlowAnnualChart(projectedTransactions),
      monthlySeries,
      conceptBreakdown: buildCashFlowConceptBreakdown(projectedTransactions, period),
    },
    transactions,
    expectedFeeIncome,
    additionalIncome,
    additionalExpenses: currentExpenses,
    emptyState: {
      title: status === "ready" ? "Cash Flow" : "Cash Flow sin movimientos",
      description:
        status === "ready"
          ? "Vista financiera de cuotas esperadas, ingresos, gastos, balance y saldo."
          : "Carga movimientos o calcula cuotas para alimentar esta seccion.",
    },
    source: {
      provider: "google-sheets",
      status,
      message,
      cachedAt,
      revalidateSeconds,
    },
  };
}

function buildFallbackCashFlowData({
  period,
  status,
  message,
  cachedAt,
  revalidateSeconds,
}: {
  period: string;
  status: CashFlowData["source"]["status"];
  message: string;
  cachedAt: string;
  revalidateSeconds: number;
}): CashFlowData {
  return {
    period,
    metrics: buildCashFlowMetrics({
      currentIncome: 0,
      currentExpenses: 0,
      currentBalance: 0,
      totalCash: 0,
      currentPeriod: period,
      expectedFeeIncome: 0,
      additionalIncome: 0,
    }),
    charts: {
      monthly: buildCashFlowMonthlyChart([], period, []),
      annual: buildCashFlowAnnualChart([]),
      monthlySeries: [],
      conceptBreakdown: [],
    },
    transactions: [],
    expectedFeeIncome: 0,
    additionalIncome: 0,
    additionalExpenses: 0,
    emptyState: {
      title: "Cash Flow sin datos",
      description: "Configura la hoja CashFlow para ver informacion financiera.",
    },
    source: {
      provider: "google-sheets",
      status,
      message,
      cachedAt,
      revalidateSeconds,
    },
  };
}

function buildCashFlowMetrics({
  currentIncome,
  currentExpenses,
  currentBalance,
  totalCash,
  currentPeriod,
  expectedFeeIncome,
  additionalIncome,
}: {
  currentIncome: number;
  currentExpenses: number;
  currentBalance: number;
  totalCash: number;
  currentPeriod: string;
  expectedFeeIncome: number;
  additionalIncome: number;
}): CashFlowMetric[] {
  return [
    {
      id: "income",
      title: "Ingresos",
      value: formatCurrency(currentIncome),
      detail: `${formatCurrency(expectedFeeIncome)} cuotas + ${formatCurrency(additionalIncome)} extra`,
      tone: "success",
    },
    {
      id: "expenses",
      title: "Gastos",
      value: formatCurrency(currentExpenses),
      detail: formatPeriodLabel(currentPeriod),
      tone: currentExpenses > 0 ? "warning" : "neutral",
    },
    {
      id: "balance",
      title: "Balance",
      value: formatCurrency(currentBalance),
      detail: "Ingresos menos gastos",
      tone: currentBalance < 0 ? "danger" : "success",
    },
    {
      id: "cash",
      title: "Saldo",
      value: formatCurrency(totalCash),
      detail: "Acumulado total",
      tone: totalCash < 0 ? "danger" : "neutral",
    },
  ];
}

const cashFlowExpenseColors = [
  "#c10202",
  "#f4ce0f",
  "#8b1a1a",
  "#b45309",
  "#be123c",
  "#7f1d1d",
  "#64748b",
];

const maxCashFlowExpenseSeries = 6;
const otherExpensesKey = "expense_otros_gastos";

function buildCashFlowMonthlySeries(
  transactions: CashFlowTransactionRecord[],
  periods: string[],
): CashFlowConceptSeries[] {
  const periodSet = new Set(periods);
  const totalsByKey = transactions
    .filter(
      (transaction) =>
        transaction.type === "expense" && periodSet.has(transaction.period),
    )
    .reduce<
      Map<
        string,
        {
          label: string;
          total: number;
        }
      >
    >((totals, transaction) => {
      const key = getCashFlowExpenseKey(transaction.concept);
      const current = totals.get(key);

      totals.set(key, {
        label: current?.label ?? transaction.concept,
        total: (current?.total ?? 0) + transaction.amount,
      });

      return totals;
    }, new Map());
  const sorted = Array.from(totalsByKey.entries()).sort(
    ([, left], [, right]) => right.total - left.total,
  );
  const topSeries = sorted
    .slice(0, maxCashFlowExpenseSeries)
    .map<CashFlowConceptSeries>(([key, item], index) => ({
      key,
      label: item.label,
      type: "expense",
      color: cashFlowExpenseColors[index % cashFlowExpenseColors.length],
    }));

  if (sorted.length > maxCashFlowExpenseSeries) {
    topSeries.push({
      key: otherExpensesKey,
      label: "Otros gastos",
      type: "expense",
      color: cashFlowExpenseColors[cashFlowExpenseColors.length - 1],
    });
  }

  return topSeries;
}

function buildCashFlowMonthlyChart(
  transactions: CashFlowTransactionRecord[],
  selectedPeriod = getCurrentPeriod(),
  expenseSeries: CashFlowConceptSeries[],
): CashFlowMonthlyPoint[] {
  const periods = getCashFlowProjectionPeriods(selectedPeriod);
  const expenseSeriesKeys = new Set(expenseSeries.map((series) => series.key));
  const hasOtherExpenses = expenseSeriesKeys.has(otherExpensesKey);
  let cashBalance = 0;

  return periods.map((period) => {
    const periodTransactions = transactions.filter(
      (transaction) => transaction.period === period,
    );
    const feeIncome = periodTransactions
      .filter((transaction) => transaction.source === "fee-calculator")
      .reduce((total, transaction) => total + transaction.amount, 0);
    const additionalIncome = sumCashFlow(periodTransactions, "income") - feeIncome;
    const ingresos = sumCashFlow(periodTransactions, "income");
    const gastos = sumCashFlow(periodTransactions, "expense");
    const balance = ingresos - gastos;
    cashBalance += balance;
    const expenseValues = expenseSeries.reduce<Record<string, number>>(
      (values, series) => {
        values[series.key] = 0;

        return values;
      },
      {},
    );

    periodTransactions
      .filter((transaction) => transaction.type === "expense")
      .forEach((transaction) => {
        const key = getCashFlowExpenseKey(transaction.concept);
        const targetKey =
          expenseSeriesKeys.has(key) || !hasOtherExpenses ? key : otherExpensesKey;

        if (targetKey in expenseValues) {
          expenseValues[targetKey] -= transaction.amount;
        }
      });

    return {
      period,
      label: formatPeriodLabel(period),
      feeIncome,
      additionalIncome,
      ingresos,
      gastos,
      balance,
      cashBalance,
      negativeCashBalance: cashBalance < 0 ? cashBalance : null,
      ...expenseValues,
    };
  });
}

function buildCashFlowConceptBreakdown(
  transactions: CashFlowTransactionRecord[],
  period: string,
): CashFlowConceptBreakdownPoint[] {
  const conceptMap = transactions
    .filter((transaction) => transaction.period === period)
    .reduce<
      Map<
        string,
        {
          amount: number;
          concept: string;
          type: CashFlowTransactionType;
        }
      >
    >((items, transaction) => {
      const concept =
        transaction.source === "fee-calculator"
          ? "Cuotas de jugadores"
          : transaction.concept;
      const key = `${transaction.type}:${normalizeHeader(concept) || "sin_concepto"}`;
      const current = items.get(key);

      items.set(key, {
        amount: (current?.amount ?? 0) + transaction.amount,
        concept: current?.concept ?? concept,
        type: transaction.type,
      });

      return items;
    }, new Map());

  return Array.from(conceptMap.values())
    .map<CashFlowConceptBreakdownPoint>((item) => ({
      concept: item.concept,
      type: item.type,
      amount: item.amount,
      signedAmount: item.type === "income" ? item.amount : -item.amount,
    }))
    .sort((left, right) => {
      if (left.type !== right.type) {
        return left.type === "income" ? -1 : 1;
      }

      return right.amount - left.amount;
    });
}

function getCashFlowExpenseKey(concept: string) {
  return `expense_${normalizeHeader(concept) || "sin_concepto"}`;
}

function buildCashFlowAnnualChart(
  transactions: CashFlowTransactionRecord[],
): CashFlowAnnualPoint[] {
  return getLastYears(5).map((year) => {
    const yearTransactions = transactions.filter((transaction) =>
      transaction.period.startsWith(`${year}-`),
    );
    const ingresos = sumCashFlow(yearTransactions, "income");
    const gastos = sumCashFlow(yearTransactions, "expense");

    return {
      year: String(year),
      ingresos,
      gastos,
      balance: ingresos - gastos,
    };
  });
}

function expandCashFlowTransactions(
  transactions: CashFlowTransactionRecord[],
  periods: string[],
): CashFlowTransactionRecord[] {
  const periodSet = new Set(periods);

  return transactions.flatMap((transaction) => {
    const transactionPeriods = transaction.repeatsMonthly
      ? getPeriodsBetween(transaction.startPeriod, transaction.endPeriod)
      : [transaction.period];

    return transactionPeriods
      .filter((period) => periodSet.has(period))
      .map((period) => ({
        ...transaction,
        id:
          transaction.repeatsMonthly && period !== transaction.period
            ? `${transaction.id}-${period}`
            : transaction.id,
        period,
        date: getCashFlowDateForPeriod(transaction.date, period),
      }));
  });
}

function buildFeeIncomeTransactions(
  feeIncomeByPeriod: Map<string, number>,
): CashFlowTransactionRecord[] {
  return Array.from(feeIncomeByPeriod.entries())
    .filter(([, amount]) => amount > 0)
    .map(([period, amount]) => ({
      id: `fee-income-${period}`,
      date: `${period}-01`,
      period,
      type: "income",
      concept: "Cuotas calculadas",
      amount,
      repeatsMonthly: false,
      startPeriod: period,
      endPeriod: period,
      notes: "Ingreso esperado calculado desde el calculador de cuota.",
      active: true,
      source: "fee-calculator",
    }));
}

function getCashFlowProjectionPeriods(period: string) {
  return Array.from(new Set([...getLastPeriods(12), period])).sort();
}

function getPeriodsBetween(startPeriod: string, endPeriod: string) {
  const periods: string[] = [];
  let current = startPeriod;

  while (current <= endPeriod && periods.length < 120) {
    periods.push(current);
    current = addMonthsToPeriod(current, 1);
  }

  return periods;
}

function addMonthsToPeriod(period: string, monthsToAdd: number) {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(year, month - 1 + monthsToAdd, 1);

  return getCurrentPeriod(date);
}

function getCashFlowDateForPeriod(date: string | undefined, period: string) {
  if (!date) {
    return `${period}-01`;
  }

  const day = Number(date.slice(8, 10)) || 1;
  const [year, month] = period.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();

  return `${period}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

function sumCashFlow(
  transactions: CashFlowTransactionRecord[],
  type: CashFlowTransactionType,
) {
  return transactions
    .filter((transaction) => transaction.type === type)
    .reduce((total, transaction) => total + transaction.amount, 0);
}

function buildFallbackDashboardData({
  period,
  status,
  message,
  cachedAt,
  revalidateSeconds,
}: {
  period: string;
  status: DashboardData["source"]["status"];
  message: string;
  cachedAt: string;
  revalidateSeconds: number;
}): DashboardData {
  return {
    period,
    metrics: buildEmptyMetrics(),
    charts: {
      feeStatus: buildFeeStatusChart(0, 0, 0),
      playerStatus: buildPlayerStatusChart(0, 0, 0),
      monthlyCollections: buildMonthlyCollections([]),
      annualComparison: buildAnnualComparison([]),
      playerLifecycle: buildPlayerLifecycle([]),
      delinquencyTrend: buildDelinquencyTrend([], []),
    },
    players: [],
    emptyState: {
      title: "Dashboard sin datos",
      description: "Configura Google Sheets para empezar a ver informacion real.",
    },
    source: {
      provider: "google-sheets",
      status,
      message,
      cachedAt,
      revalidateSeconds,
    },
  };
}

function buildFeeStatusChart(
  paid: number,
  pending: number,
  overdue: number,
): ChartDatum[] {
  return [
    { label: "Cobradas", value: paid },
    { label: "Pendientes", value: Math.max(pending - overdue, 0) },
    { label: "Vencidas", value: overdue },
  ];
}

function buildPlayerStatusChart(
  upToDate: number,
  overdue: number,
  pending: number,
): ChartDatum[] {
  return [
    { label: "Al dia", value: upToDate },
    { label: "Con pendientes", value: pending },
    { label: "Morosos", value: overdue },
  ];
}

function buildMonthlyCollections(fees: FeeRecord[]): MonthlyCollectionPoint[] {
  const periods = getLastPeriods(12);

  return periods.map((period) => {
    const periodFees = fees.filter((fee) => fee.period === period);
    const paid = periodFees.filter((fee) => fee.status === "paid");
    const pending = periodFees.filter((fee) => fee.status !== "paid");
    const overdue = periodFees.filter((fee) => fee.status === "overdue");

    return {
      period,
      label: formatPeriodLabel(period),
      ingresos: paid.reduce((total, fee) => total + fee.amount, 0),
      cobradas: paid.length,
      pendientes: pending.length,
      morosas: overdue.length,
    };
  });
}

function buildAnnualComparison(fees: FeeRecord[]): AnnualComparisonPoint[] {
  return getLastYears(5).map((year) => {
    const yearFees = fees.filter((fee) => fee.period.startsWith(`${year}-`));
    const paid = yearFees.filter((fee) => fee.status === "paid");
    const pending = yearFees.filter((fee) => fee.status !== "paid");
    const overdue = yearFees.filter((fee) => fee.status === "overdue");

    return {
      year: String(year),
      ingresos: paid.reduce((total, fee) => total + fee.amount, 0),
      cobradas: paid.length,
      pendientes: pending.length,
      morosas: overdue.length,
    };
  });
}

function buildPlayerLifecycle(players: PlayerRecord[]): PlayerLifecyclePoint[] {
  return getLastPeriods(12).map((period) => {
    const newPlayers = players.filter(
      (player) => getPeriodFromDate(player.joinedAt) === period,
    );
    const droppedPlayers = players.filter(
      (player) => getPeriodFromDate(player.leftAt) === period,
    );

    return {
      period,
      label: formatPeriodLabel(period),
      activos: players.filter((player) => isPlayerActiveInPeriod(player, period)).length,
      nuevos: newPlayers.length,
      bajas: droppedPlayers.length,
    };
  });
}

function buildDelinquencyTrend(
  players: PlayerRecord[],
  fees: FeeRecord[],
): DelinquencyTrendPoint[] {
  const playerIdsFromFees = Array.from(new Set(fees.map((fee) => fee.playerId)));

  return getLastPeriods(12).map((period) => {
    const periodFees = fees.filter((fee) => fee.period === period);
    const overduePlayerIds = new Set(
      periodFees.filter((fee) => fee.status === "overdue").map((fee) => fee.playerId),
    );
    const total =
      players.length > 0
        ? players.filter((player) => isPlayerActiveInPeriod(player, period)).length
        : playerIdsFromFees.length;
    const morosos = overduePlayerIds.size;

    return {
      period,
      label: formatPeriodLabel(period),
      morosos,
      total,
      porcentaje: total > 0 ? Math.round((morosos / total) * 100) : 0,
    };
  });
}

function buildPlayerTableRows(
  players: PlayerRecord[],
  fees: FeeRecord[],
  feeCalculations: FeePlayerCalculation[],
  period: string,
): PlayerTableRow[] {
  const feesByPlayer = groupFeesByPlayer(fees);
  const playerIdsFromFees = Array.from(new Set(fees.map((fee) => fee.playerId)));
  const feeCalculationsByPlayerId = new Map(
    feeCalculations.map((calculation) => [calculation.playerId, calculation]),
  );
  const feeCalculationsByPlayerName = new Map(
    feeCalculations.map((calculation) => [
      normalizeClubPlayerName(calculation.playerName),
      calculation,
    ]),
  );
  const sourcePlayers =
    players.length > 0
      ? players.filter((player) => !isDroppedPlayer(player))
      : playerIdsFromFees.map((playerId) => ({
          id: playerId,
          name: playerId,
          category: "Sin categoria",
          phone: "-",
          email: "",
          monthlyFee: 0,
          observations: "-",
          status: "",
        }));

  return sourcePlayers.map((player) => {
    const playerFees = feesByPlayer.get(player.id) ?? [];
    const currentFee = findCurrentFee(playerFees, period);
    const latestFee = findLatestFee(playerFees);
    const latestPaidFee = findLatestPaidFee(playerFees);
    const calculatedFee =
      feeCalculationsByPlayerId.get(player.id) ??
      feeCalculationsByPlayerName.get(normalizeClubPlayerName(player.name));
    const feeAmount =
      calculatedFee?.finalQuota ?? currentFee?.amount ?? player.monthlyFee ?? 0;
    const feeSource = calculatedFee
      ? "calculator"
      : currentFee
        ? "payments"
        : player.monthlyFee
          ? "player"
          : "none";
    const status = getPlayerPaymentStatus(
      playerFees,
      currentFee,
      latestFee,
      feeSource !== "none",
    );

    return {
      id: player.id,
      name: player.name,
      category: player.category,
      phone: player.phone,
      fee: feeSource === "none" ? "-" : formatCurrency(feeAmount),
      feeAmount,
      feePeriod: period,
      feeSource,
      status,
      lastPayment: latestPaidFee?.paidAt ? formatDate(latestPaidFee.paidAt) : "-",
      lastPaymentDate: latestPaidFee?.paidAt,
      observations: buildPlayerObservation(player, status),
    };
  });
}

function buildPlayerFromFees(playerId: string, fees: FeeRecord[]): PlayerRecord | null {
  if (!fees.some((fee) => fee.playerId === playerId)) {
    return null;
  }

  return {
    id: playerId,
    name: playerId,
    category: "Sin categoria",
    phone: "-",
    email: "",
    monthlyFee: 0,
    observations: "-",
    status: "",
  };
}

function buildPlayerProfile(
  player: PlayerRecord,
  fees: FeeRecord[],
  year: number,
): PlayerProfile {
  const playerFees = fees.filter((fee) => fee.playerId === player.id);

  return {
    id: player.id,
    name: player.name,
    category: player.category,
    phone: player.phone,
    observations: player.observations,
    year,
    history: buildPlayerHistory(playerFees),
    months: buildYearMonths(playerFees, year),
  };
}

function buildPlayerHistory(fees: FeeRecord[]): PlayerFeeHistoryItem[] {
  return [...fees].sort(compareFeesDesc).map((fee) => ({
    id: fee.id,
    period: fee.period,
    amount: fee.amount > 0 ? formatCurrency(fee.amount) : "-",
    status: toPlayerPaymentStatus(fee.status),
    dueDate: fee.dueDate ? formatDate(fee.dueDate) : "-",
    paidAt: fee.paidAt ? formatDate(fee.paidAt) : "-",
  }));
}

function buildYearMonths(fees: FeeRecord[], year: number): PlayerYearMonth[] {
  return Array.from({ length: 12 }, (_, index) => {
    const period = `${year}-${String(index + 1).padStart(2, "0")}`;
    const fee = fees.find((candidate) => candidate.period === period);

    return {
      period,
      label: formatFullMonthLabel(period),
      status: fee?.status === "paid" ? "paid" : "unpaid",
      amount: fee?.amount ? formatCurrency(fee.amount) : "-",
      dueDate: fee?.dueDate ? formatDate(fee.dueDate) : "-",
      paidAt: fee?.paidAt ? formatDate(fee.paidAt) : "-",
    };
  });
}

function toPlayerPaymentStatus(status: FeeStatus): PlayerPaymentStatus {
  if (status === "paid") {
    return "paid";
  }

  if (status === "overdue") {
    return "debt";
  }

  return "pending";
}

function groupFeesByPlayer(fees: FeeRecord[]) {
  const grouped = new Map<string, FeeRecord[]>();

  for (const fee of fees) {
    const current = grouped.get(fee.playerId) ?? [];
    current.push(fee);
    grouped.set(fee.playerId, current);
  }

  return grouped;
}

function findCurrentFee(fees: FeeRecord[], period: string) {
  return fees.find((fee) => fee.period === period);
}

function findLatestFee(fees: FeeRecord[]) {
  return [...fees].sort(compareFeesDesc)[0];
}

function findLatestPaidFee(fees: FeeRecord[]) {
  return fees.filter((fee) => fee.status === "paid").sort(compareFeesDesc)[0];
}

function compareFeesDesc(a: FeeRecord, b: FeeRecord) {
  const aDate = a.paidAt ?? a.dueDate ?? `${a.period}-01`;
  const bDate = b.paidAt ?? b.dueDate ?? `${b.period}-01`;

  return bDate.localeCompare(aDate);
}

function getPlayerPaymentStatus(
  fees: FeeRecord[],
  currentFee?: FeeRecord,
  latestFee?: FeeRecord,
  hasCurrentCharge = false,
): PlayerPaymentStatus {
  if (currentFee?.status === "paid") {
    return "paid";
  }

  if (hasCurrentCharge && !currentFee) {
    return "pending";
  }

  if (fees.some((fee) => fee.status === "overdue")) {
    return "debt";
  }

  if (!currentFee && latestFee?.status === "paid") {
    return "paid";
  }

  return "pending";
}

function buildPlayerObservation(player: PlayerRecord, status: PlayerPaymentStatus) {
  if (player.observations && player.observations !== "-") {
    return player.observations;
  }

  if (status === "paid") {
    return "Al dia";
  }

  if (status === "debt") {
    return "Requiere seguimiento";
  }

  return "Pendiente de pago";
}

function isDroppedPlayer(player: PlayerRecord) {
  if (player.leftAt) {
    return true;
  }

  return [
    "baja",
    "dado de baja",
    "dado_de_baja",
    "inactivo",
    "inactive",
    "egresado",
    "deleted",
  ].includes(player.status);
}

function isPlayerActiveInPeriod(player: PlayerRecord, period: string) {
  const joinedPeriod = getPeriodFromDate(player.joinedAt);
  const leftPeriod = getPeriodFromDate(player.leftAt);

  if (joinedPeriod && joinedPeriod > period) {
    return false;
  }

  if (leftPeriod) {
    return leftPeriod > period;
  }

  return !isDroppedPlayer(player);
}

function rowsToRecords(rows: unknown[][]): SheetRecord[] {
  if (rows.length === 0) {
    return [];
  }

  const [headerRow = [], ...dataRows] = rows;
  const headers = headerRow.map((header) => normalizeHeader(String(header)));

  return dataRows
    .filter((row) => row.some((cell) => String(cell ?? "").trim().length > 0))
    .map((row) =>
      headers.reduce<SheetRecord>((record, header, index) => {
        if (header) {
          record[header] = String(row[index] ?? "").trim();
        }

        return record;
      }, {}),
    );
}

function normalizeHeader(header: string) {
  return header
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function pick(record: SheetRecord, keys: string[]) {
  for (const key of keys) {
    if (record[key]) {
      return record[key];
    }
  }

  return "";
}

function shouldUseClubSheetLayout(error: unknown) {
  return !(error instanceof DataServiceError && error.code === "CONFIGURATION_ERROR");
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function normalizeClubPlayerName(value: string) {
  return normalizeText(value).replace(/\s+/g, " ");
}

function createClubPlayerId(name: string) {
  const normalized = normalizeClubPlayerName(name);

  if (!normalized) {
    return "";
  }

  return normalizeHeader(normalized).replace(/_/g, "-");
}

function createUniqueClubPlayerId(baseId: string, seenIds: Set<string>) {
  let id = baseId;
  let suffix = 2;

  while (seenIds.has(id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }

  seenIds.add(id);
  return id;
}

function normalizeClubPhone(value: string) {
  const digits = value.replace(/\D/g, "");

  if (!digits) {
    return "-";
  }

  if (digits.startsWith("549") || digits.startsWith("54")) {
    return digits;
  }

  const withoutLeadingZero = digits.replace(/^0+/, "");

  if (withoutLeadingZero.startsWith("11") && withoutLeadingZero.length === 10) {
    return `549${withoutLeadingZero}`;
  }

  if (withoutLeadingZero.length === 8) {
    return `54911${withoutLeadingZero}`;
  }

  return withoutLeadingZero;
}

function normalizeFeeCalculatorCostType(value: string): FeeCalculatorCostType {
  const type = normalizeText(value);

  if (["cancha", "canchas", "court", "jornada", "jornadas"].includes(type)) {
    return "court";
  }

  if (
    [
      "director tecnico",
      "dt",
      "profesor",
      "coach",
      "entrenador",
      "hora_dt",
      "horas_dt",
    ].includes(type)
  ) {
    return "coach";
  }

  if (["fijo", "fixed", "mensual"].includes(type)) {
    return "fixed";
  }

  return "custom";
}

function normalizeFeeCalculatorCostInput(
  input: UpsertFeeCalculatorCostInput,
): Omit<FeeCalculatorCost, "active" | "createdAt" | "updatedAt"> {
  const startPeriod = normalizePeriod(input.startPeriod);
  const endPeriod = normalizePeriod(input.endPeriod);
  const period = startPeriod ?? endPeriod;

  if (!period) {
    throw new DataServiceError(
      "El mes del costo debe tener formato AAAA-MM.",
      "CONFIGURATION_ERROR",
    );
  }

  return {
    id: input.id?.trim() ?? "",
    name: input.name.trim(),
    type: input.type,
    startPeriod: period,
    endPeriod: period,
    amount: Math.max(Number(input.amount), 0),
    repeatsMonthly: false,
    splitBetween: Math.max(Math.round(Number(input.splitBetween)), 1),
    forecastUnits: Math.max(Number(input.forecastUnits), 0),
    notes: input.notes?.trim() ?? "",
  };
}

function normalizeCashFlowTransactionInput(
  input: UpsertCashFlowTransactionInput,
): Omit<CashFlowTransactionRecord, "active" | "source" | "createdAt" | "updatedAt"> {
  const date = parseDate(input.date);
  const period = normalizePeriod(input.period);
  const startPeriod = normalizePeriod(input.startPeriod);
  const endPeriod = normalizePeriod(input.endPeriod);

  if (!date) {
    throw new DataServiceError(
      "La fecha del movimiento debe ser valida.",
      "CONFIGURATION_ERROR",
    );
  }

  if (!period || !startPeriod || !endPeriod) {
    throw new DataServiceError(
      "El periodo del movimiento debe tener formato AAAA-MM.",
      "CONFIGURATION_ERROR",
    );
  }

  const repeatsMonthly = Boolean(input.repeatsMonthly);
  const normalizedStartPeriod = repeatsMonthly ? startPeriod : period;
  const normalizedEndPeriod = repeatsMonthly
    ? endPeriod < startPeriod
      ? startPeriod
      : endPeriod
    : period;

  return {
    id: input.id?.trim() ?? "",
    date,
    period,
    type: input.type,
    concept: input.concept.trim(),
    amount: Math.max(Number(input.amount), 0),
    repeatsMonthly,
    startPeriod: normalizedStartPeriod,
    endPeriod: normalizedEndPeriod,
    notes: input.notes?.trim() ?? "",
  };
}

function normalizeFeeCalculatorActualInput(
  input: UpdateFeeCalculatorActualInput,
): Omit<FeeCalculatorActual, "id" | "updatedAt"> {
  return {
    costId: input.costId.trim(),
    period: input.period,
    actualUnits: Math.max(Number(input.actualUnits), 0),
    notes: input.notes?.trim() ?? "",
  };
}

function normalizeFeeRefundPolicyInput(
  input: UpdateFeeRefundPolicyInput,
): FeeRefundPolicyRule[] {
  const rules = input.rules
    .map((rule) => ({
      fromPercent: Math.max(Number(rule.fromPercent), 0),
      toPercent: Math.min(Math.max(Number(rule.toPercent), 0), 100),
      refundPercent: Math.min(Math.max(Number(rule.refundPercent), 0), 100),
    }))
    .filter(
      (rule) =>
        Number.isFinite(rule.fromPercent) &&
        Number.isFinite(rule.toPercent) &&
        Number.isFinite(rule.refundPercent) &&
        rule.toPercent >= rule.fromPercent,
    )
    .sort((left, right) => left.fromPercent - right.fromPercent);

  if (rules.length === 0) {
    throw new DataServiceError(
      "La politica de devoluciones debe tener al menos una regla valida.",
      "CONFIGURATION_ERROR",
    );
  }

  return rules;
}

function buildCashFlowWritableRow(
  headers: string[],
  transaction: CashFlowTransactionRecord,
) {
  const now = new Date().toISOString();
  const values: Record<string, string | number> = {
    id: transaction.id,
    movimiento_id: transaction.id,
    transaction_id: transaction.id,
    cash_flow_id: transaction.id,
    fecha: transaction.date ?? "",
    date: transaction.date ?? "",
    dia: transaction.date ?? "",
    periodo: transaction.period,
    period: transaction.period,
    mes: transaction.period,
    tipo: transaction.type === "income" ? "ingreso" : "gasto",
    type: transaction.type,
    movimiento: transaction.type,
    clase: transaction.type,
    concepto: transaction.concept,
    descripcion: transaction.concept,
    description: transaction.concept,
    detalle: transaction.concept,
    monto: transaction.amount,
    importe: transaction.amount,
    amount: transaction.amount,
    valor: transaction.amount,
    total: transaction.amount,
    repite_mensual: transaction.repeatsMonthly ? "true" : "false",
    repite: transaction.repeatsMonthly ? "true" : "false",
    mensual: transaction.repeatsMonthly ? "true" : "false",
    recurrente: transaction.repeatsMonthly ? "true" : "false",
    vigencia_desde: transaction.startPeriod,
    desde: transaction.startPeriod,
    start_period: transaction.startPeriod,
    periodo_desde: transaction.startPeriod,
    vigencia_hasta: transaction.endPeriod,
    hasta: transaction.endPeriod,
    end_period: transaction.endPeriod,
    periodo_hasta: transaction.endPeriod,
    notas: transaction.notes,
    notes: transaction.notes,
    observaciones: transaction.notes,
    activo: transaction.active ? "true" : "false",
    active: transaction.active ? "true" : "false",
    creado_en: transaction.createdAt ?? now,
    created_at: transaction.createdAt ?? now,
    actualizado_en: transaction.updatedAt ?? now,
    updated_at: transaction.updatedAt ?? now,
  };

  return headers.map((header) => values[header] ?? "");
}

function buildFeeCalculatorCostWritableRow(headers: string[], cost: FeeCalculatorCost) {
  const values: Record<string, string | number> = {
    id: cost.id,
    costo_id: cost.id,
    nombre: cost.name,
    name: cost.name,
    costo: cost.name,
    tipo: cost.type,
    type: cost.type,
    vigencia_desde: cost.startPeriod,
    desde: cost.startPeriod,
    start_period: cost.startPeriod,
    vigencia_hasta: cost.endPeriod,
    hasta: cost.endPeriod,
    end_period: cost.endPeriod,
    monto: cost.amount,
    importe: cost.amount,
    amount: cost.amount,
    valor: cost.amount,
    repite_mensual: cost.repeatsMonthly ? "true" : "false",
    repite: cost.repeatsMonthly ? "true" : "false",
    repeats_monthly: cost.repeatsMonthly ? "true" : "false",
    dividir_entre: cost.splitBetween,
    personas: cost.splitBetween,
    split_between: cost.splitBetween,
    cantidad_estimada: cost.forecastUnits,
    canchas_estimadas: cost.forecastUnits,
    forecast_units: cost.forecastUnits,
    notas: cost.notes,
    notes: cost.notes,
    observaciones: cost.notes,
    activo: cost.active ? "true" : "false",
    active: cost.active ? "true" : "false",
    creado_en: cost.createdAt,
    created_at: cost.createdAt,
    actualizado_en: cost.updatedAt,
    updated_at: cost.updatedAt,
  };

  return headers.map((header) => values[header] ?? "");
}

function buildFeeCalculatorActualWritableRow(
  headers: string[],
  actual: FeeCalculatorActual,
) {
  const values: Record<string, string | number> = {
    id: actual.id,
    real_id: actual.id,
    actual_id: actual.id,
    costo_id: actual.costId,
    cost_id: actual.costId,
    id_costo: actual.costId,
    periodo: actual.period,
    period: actual.period,
    mes: actual.period,
    cantidad_real: actual.actualUnits,
    canchas_reales: actual.actualUnits,
    actual_units: actual.actualUnits,
    cantidad: actual.actualUnits,
    notas: actual.notes,
    notes: actual.notes,
    observaciones: actual.notes,
    actualizado_en: actual.updatedAt,
    updated_at: actual.updatedAt,
  };

  return headers.map((header) => values[header] ?? "");
}

function normalizeFeeCalculatorPlayerStatusInput(
  input: UpdateFeeCalculatorPlayerStatusInput,
): Omit<FeeCalculatorPlayerStatusRecord, "id" | "updatedAt"> {
  const period = normalizePeriod(input.period);

  if (!period) {
    throw new DataServiceError(
      "El periodo del jugador debe tener formato AAAA-MM.",
      "CONFIGURATION_ERROR",
    );
  }

  return {
    playerId: input.playerId.trim(),
    playerName: input.playerName.trim(),
    period,
    status: input.status,
    notes: input.notes?.trim() ?? "",
  };
}

function buildFeeCalculatorPlayerStatusWritableRow(
  headers: string[],
  status: FeeCalculatorPlayerStatusRecord,
) {
  const values: Record<string, string> = {
    id: status.id,
    estado_id: status.id,
    status_id: status.id,
    jugador_id: status.playerId,
    player_id: status.playerId,
    id_jugador: status.playerId,
    jugador: status.playerName,
    nombre: status.playerName,
    nombre_y_apellido: status.playerName,
    name: status.playerName,
    player: status.playerName,
    periodo: status.period,
    period: status.period,
    mes: status.period,
    estado: status.status === "active" ? "activo" : "inactivo",
    status: status.status,
    notas: status.notes,
    notes: status.notes,
    observaciones: status.notes,
    actualizado_en: status.updatedAt,
    updated_at: status.updatedAt,
  };

  return headers.map((header) => values[header] ?? "");
}

function normalizeWritableHeaders(row: unknown[], fallback: string[]) {
  const headers = row.map((header) => normalizeHeader(String(header)));

  return headers.some(Boolean) ? headers : fallback;
}

function splitPlayerNames(value: string) {
  return value
    .split(/[,;\n]/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function parseLooseBoolean(value: string, fallback = false) {
  if (!value) {
    return fallback;
  }

  const normalized = normalizeText(value);

  if (["1", "true", "si", "sí", "yes", "activo", "active", "x"].includes(normalized)) {
    return true;
  }

  if (
    ["0", "false", "no", "inactivo", "inactive", "baja", "deleted"].includes(normalized)
  ) {
    return false;
  }

  return fallback;
}

function parsePercentValue(value: string) {
  if (!value) {
    return Number.NaN;
  }

  return parseMoney(value.replace("%", ""));
}

function getDefaultRefundPolicy(): FeeRefundPolicyRule[] {
  return [
    { fromPercent: 0, toPercent: 0, refundPercent: 38 },
    { fromPercent: 0.01, toPercent: 50, refundPercent: 23 },
    { fromPercent: 50.01, toPercent: 100, refundPercent: 0 },
  ];
}

function findRefundPercent(rules: FeeRefundPolicyRule[], attendancePercent: number) {
  const rule = rules.find(
    (candidate) =>
      attendancePercent >= candidate.fromPercent &&
      attendancePercent <= candidate.toPercent,
  );

  return rule?.refundPercent ?? 0;
}

function calculateAppBaseQuotaForPeriod(
  costs: FeeCalculatorCost[],
  actuals: FeeCalculatorActual[],
  period: string,
) {
  const previousPeriod = getPreviousPeriod(period);
  const plannedQuota = calculateBaseQuotaForPeriod(costs, actuals, period, "forecast");
  const previousPlannedQuota = calculateBaseQuotaForPeriod(
    costs,
    actuals,
    previousPeriod,
    "forecast",
  );
  const previousActualQuota = calculateBaseQuotaForPeriod(
    costs,
    actuals,
    previousPeriod,
    "actual",
  );

  return Math.max(plannedQuota + previousActualQuota - previousPlannedQuota, 0);
}

function buildFeeCalculatorAdjustments(
  costs: FeeCalculatorCost[],
  actuals: FeeCalculatorActual[],
  period: string,
): FeeCalculatorAdjustment[] {
  return costs
    .filter((cost) => isCostActiveForPeriod(cost, period))
    .map((cost) => {
      const actualUnits = findActualUnitsForCost(cost, costs, actuals, period);

      if (typeof actualUnits !== "number") {
        return null;
      }

      const splitBetween = Math.max(cost.splitBetween, 1);
      const forecastUnits = cost.forecastUnits;
      const unitDifference = actualUnits - forecastUnits;
      const forecastShare = (cost.amount * forecastUnits) / splitBetween;
      const actualShare = (cost.amount * actualUnits) / splitBetween;
      const variance = actualShare - forecastShare;

      if (Math.abs(variance) < 0.01) {
        return null;
      }

      return {
        id: `adjustment-${cost.id}-${period}`,
        name: getAdjustmentName(cost),
        sourceCostId: cost.id,
        sourceCostName: cost.name,
        type: cost.type,
        period,
        forecastUnits,
        actualUnits,
        unitDifference,
        unitAmount: cost.amount,
        splitBetween,
        forecastShare,
        actualShare,
        variance,
      } satisfies FeeCalculatorAdjustment;
    })
    .filter((adjustment): adjustment is FeeCalculatorAdjustment => Boolean(adjustment))
    .sort((left, right) => left.name.localeCompare(right.name, "es"));
}

function calculateBaseQuotaForPeriod(
  costs: FeeCalculatorCost[],
  actuals: FeeCalculatorActual[],
  period: string,
  mode: "forecast" | "actual",
) {
  return costs
    .filter((cost) => isCostActiveForPeriod(cost, period))
    .reduce(
      (total, cost) => total + calculateCostShare(cost, costs, actuals, period, mode),
      0,
    );
}

function calculateCostShare(
  cost: FeeCalculatorCost,
  costs: FeeCalculatorCost[],
  actuals: FeeCalculatorActual[],
  period: string,
  mode: "forecast" | "actual",
) {
  const actualUnits = findActualUnitsForCost(cost, costs, actuals, period);
  const units =
    mode === "actual" && typeof actualUnits === "number"
      ? actualUnits
      : cost.forecastUnits;
  const total = cost.amount * units;

  return total / Math.max(cost.splitBetween, 1);
}

function mergeInferredFeeCalculatorActuals(
  costs: FeeCalculatorCost[],
  actuals: FeeCalculatorActual[],
  matches: MatchRecord[],
  period: string,
  requireActiveInPeriod = true,
) {
  const merged = [...actuals];

  costs.forEach((cost) => {
    if (requireActiveInPeriod && !isCostActiveForPeriod(cost, period)) {
      return;
    }

    const existingIndex = merged.findIndex(
      (actual) => actual.costId === cost.id && actual.period === period,
    );
    const existingActual = existingIndex >= 0 ? merged[existingIndex] : undefined;

    const inferredUnits = inferActualUnitsForCost(cost, matches, period);

    if (typeof inferredUnits !== "number") {
      return;
    }

    if (existingActual && !isInferredFeeCalculatorActual(existingActual)) {
      return;
    }

    const autoActualKind = getAutoActualCostKind(cost);
    const inferredActual = {
      id: `auto-${cost.id}-${period}`,
      costId: cost.id,
      period,
      actualUnits: inferredUnits,
      notes:
        autoActualKind === "coach"
          ? "Autocalculado desde Asistió joaco? x 3 horas."
          : "Autocalculado desde partidos Local.",
      updatedAt: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      merged[existingIndex] = inferredActual;
    } else {
      merged.push(inferredActual);
    }
  });

  return merged;
}

function isInferredFeeCalculatorActual(actual: FeeCalculatorActual) {
  const normalizedNotes = normalizeText(actual.notes);

  return (
    actual.id.startsWith("auto-") ||
    normalizedNotes.includes("autocalculado") ||
    normalizedNotes.includes("partidos local") ||
    normalizedNotes.includes("asistio joaco")
  );
}

function findActualUnitsForCost(
  cost: FeeCalculatorCost,
  costs: FeeCalculatorCost[],
  actuals: FeeCalculatorActual[],
  period: string,
) {
  const exactActual = actuals.find(
    (actual) => actual.costId === cost.id && actual.period === period,
  );

  if (typeof exactActual?.actualUnits === "number") {
    return exactActual.actualUnits;
  }

  if (!getAutoActualCostKind(cost)) {
    return undefined;
  }

  const compatibleActual = actuals.find((actual) => {
    if (actual.period !== period || actual.costId === cost.id) {
      return false;
    }

    const actualCost = costs.find((candidate) => candidate.id === actual.costId);

    return isCompatibleAutoActualCost(cost, actualCost);
  });

  return compatibleActual?.actualUnits;
}

function isCompatibleAutoActualCost(
  cost: FeeCalculatorCost,
  actualCost: FeeCalculatorCost | undefined,
) {
  if (!actualCost) {
    return false;
  }

  return (
    getAutoActualCostKind(actualCost) === getAutoActualCostKind(cost) &&
    normalizeText(actualCost.name) === normalizeText(cost.name)
  );
}

function inferActualUnitsForCost(
  cost: FeeCalculatorCost,
  matches: MatchRecord[],
  period: string,
) {
  const periodMatches = matches.filter((match) => match.period === period);

  const autoActualKind = getAutoActualCostKind(cost);

  if (autoActualKind === "court") {
    return periodMatches.filter(isLocalMatch).length;
  }

  if (autoActualKind === "coach") {
    return periodMatches.filter((match) => match.coachAttended).length * 3;
  }

  return undefined;
}

function getAutoActualCostKind(cost: FeeCalculatorCost): "court" | "coach" | undefined {
  if (cost.type === "court" || cost.type === "coach") {
    return cost.type;
  }

  const normalizedName = normalizeText(cost.name);
  const normalizedKey = normalizeHeader(cost.name);

  if (/\bcancha(s)?\b/.test(normalizedName) || normalizedKey.includes("cancha")) {
    return "court";
  }

  if (
    normalizedName.includes("director tecnico") ||
    normalizedName.includes("joaco") ||
    /\b(dt|tecnico|entrenador)\b/.test(normalizedName) ||
    /(^|_)(dt|tecnico|entrenador)(_|$)/.test(normalizedKey)
  ) {
    return "coach";
  }

  return undefined;
}

function getAdjustmentName(cost: FeeCalculatorCost) {
  const autoActualKind = getAutoActualCostKind(cost);

  if (autoActualKind === "court") {
    return "Ajuste cancha real";
  }

  if (autoActualKind === "coach") {
    return "Ajuste horas DT";
  }

  return `Ajuste ${cost.name}`;
}

function isLocalMatch(match: MatchRecord) {
  return normalizeText(match.venue) === "local";
}

function isCostActiveForPeriod(cost: FeeCalculatorCost, period: string) {
  if (!cost.active) {
    return false;
  }

  return period === cost.startPeriod;
}

function getPreviousPeriod(period: string) {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(year, month - 2, 1);

  return getCurrentPeriod(date);
}

function unquoteSheetTitle(title: string) {
  return title.replace(/^'|'$/g, "");
}

function getClubSheetYear(rows: unknown[][]) {
  const value = rows
    .slice(0, 2)
    .flat()
    .map((cell) => String(cell ?? ""))
    .find((cell) => /\b20\d{2}\b/.test(cell));
  const match = value?.match(/\b(20\d{2})\b/);

  return match ? Number(match[1]) : new Date().getFullYear();
}

function isClubPaidStatus(value: string) {
  const status = normalizeText(value);

  return ["pago", "pagada", "pagado", "paid"].includes(status);
}

function isChargeableClubStatus(value: string) {
  const status = normalizeText(value);

  if (!status || status.includes("no se cobra") || status.includes("no se jugo")) {
    return false;
  }

  if (status.includes("value")) {
    return false;
  }

  return isClubPaidStatus(value) || status.includes("recordatorio");
}

function monthNameToNumber(value: string) {
  const month = normalizeText(value);

  if (/^\d{1,2}$/.test(month)) {
    const parsed = Number(month);

    return parsed >= 1 && parsed <= 12 ? parsed : undefined;
  }

  const months = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ];
  const index = months.findIndex((candidate) => month.startsWith(candidate));

  return index >= 0 ? index + 1 : undefined;
}

function parseClubDateTime(value: string) {
  if (!value) {
    return undefined;
  }

  const match = value
    .trim()
    .match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?/);

  if (match) {
    const [, day, month, rawYear] = match;
    const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;

    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  return parseDate(value);
}

function normalizeFeeStatus(
  value: string,
  dueDate: string | undefined,
  today: Date,
): FeeStatus {
  const status = normalizeText(value);

  if (["pagada", "pagado", "cobrada", "cobrado", "paid", "pago"].includes(status)) {
    return "paid";
  }

  if (["vencida", "vencido", "morosa", "moroso", "overdue"].includes(status)) {
    return "overdue";
  }

  if (dueDate) {
    const parsedDueDate = new Date(`${dueDate}T00:00:00`);

    if (!Number.isNaN(parsedDueDate.getTime()) && parsedDueDate < today) {
      return "overdue";
    }
  }

  return "pending";
}

function normalizePlayerDirectoryStatus(
  value: string,
  leftAt?: string,
): PlayerDirectoryStatus {
  const status = normalizeText(value);

  if (
    leftAt ||
    ["baja", "dado de baja", "dado_de_baja", "inactivo", "inactive", "deleted"].includes(
      status,
    )
  ) {
    return "inactive";
  }

  return "active";
}

function normalizeCashFlowType(value: string, amount: number): CashFlowTransactionType {
  const type = normalizeText(value);

  if (
    [
      "gasto",
      "gastos",
      "expense",
      "expenses",
      "egreso",
      "egresos",
      "salida",
      "pago",
      "compra",
    ].includes(type)
  ) {
    return "expense";
  }

  if (
    ["ingreso", "ingresos", "income", "entrada", "cobro", "cobranza", "venta"].includes(
      type,
    )
  ) {
    return "income";
  }

  return amount < 0 ? "expense" : "income";
}

function parseMoney(value: string) {
  if (!value) {
    return 0;
  }

  const normalized = value
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDate(value: string) {
  if (!value) {
    return undefined;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const [day, month, year] = value.split(/[/-]/);

  if (day && month && year) {
    return `${year.padStart(4, "20")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10);
}

function normalizePeriod(value: string) {
  if (!value) {
    return undefined;
  }

  if (/^\d{4}-\d{2}$/.test(value)) {
    return value;
  }

  const parsedDate = parseDate(value);

  return getPeriodFromDate(parsedDate);
}

function getCurrentPeriod(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getPeriodFromDate(value?: string) {
  if (!value) {
    return undefined;
  }

  const date = new Date(`${value}T00:00:00`);

  return Number.isNaN(date.getTime()) ? undefined : getCurrentPeriod(date);
}

function getLastPeriods(count: number) {
  const now = new Date();

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1);
    return getCurrentPeriod(date);
  });
}

function getLastYears(count: number) {
  const currentYear = new Date().getFullYear();

  return Array.from({ length: count }, (_, index) => currentYear - (count - 1 - index));
}

function formatPeriodLabel(period: string) {
  const [year, month] = period.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);

  if (Number.isNaN(date.getTime())) {
    return period;
  }

  return new Intl.DateTimeFormat("es-AR", {
    month: "short",
  }).format(date);
}

function formatFullMonthLabel(period: string) {
  const [year, month] = period.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);

  if (Number.isNaN(date.getTime())) {
    return period;
  }

  return new Intl.DateTimeFormat("es-AR", {
    month: "long",
  }).format(date);
}

function formatClubMonthName(period: string) {
  const label = formatFullMonthLabel(period);

  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatClubFormTimestamp(date: Date) {
  const day = String(date.getDate());
  const month = String(date.getMonth() + 1);
  const year = String(date.getFullYear());
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 1,
    style: "percent",
  }).format(value);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function parseDateTime(value: string) {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);

  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  const parsedDate = parseDate(value);

  return parsedDate ? `${parsedDate}T00:00:00.000Z` : undefined;
}

function parseMetadata(value: string): Record<string, string | number | boolean | null> {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.entries(parsed as Record<string, unknown>).reduce<
      Record<string, string | number | boolean | null>
    >((metadata, [key, metadataValue]) => {
      if (
        typeof metadataValue === "string" ||
        typeof metadataValue === "number" ||
        typeof metadataValue === "boolean" ||
        metadataValue === null
      ) {
        metadata[key] = metadataValue;
      }

      return metadata;
    }, {});
  } catch {
    return {
      raw: value,
    };
  }
}

function normalizeAuditAction(value: string): AuditAction {
  const action = normalizeText(value).replace(/_/g, ".");
  const validActions: AuditAction[] = [
    "auth.login",
    "auth.logout",
    "settings.updated",
    "player.fee_status_updated",
    "notification.created",
    "notification.read",
    "reminder.queued",
    "reminder.sent",
    "payment.checkout_created",
    "payment.webhook_received",
    "payment.status_updated",
    "api.request",
    "system.error",
  ];

  return validActions.includes(action as AuditAction)
    ? (action as AuditAction)
    : "api.request";
}

function normalizeAuditEntityType(value: string): AuditEntityType {
  const entityType = normalizeText(value).replace(/_/g, "-");
  const validTypes: AuditEntityType[] = [
    "auth",
    "settings",
    "player",
    "fee",
    "cash-flow",
    "notification",
    "reminder",
    "payment",
    "api",
    "system",
  ];

  return validTypes.includes(entityType as AuditEntityType)
    ? (entityType as AuditEntityType)
    : "system";
}

function normalizeAuditActorRole(value: string): AuditActor["role"] {
  const role = normalizeText(value);

  if (role === "admin" || role === "treasurer" || role === "coach") {
    return role;
  }

  if (role === "api") {
    return "api";
  }

  return "system";
}

function normalizeLogLevel(value: string): AppLogLevel {
  const level = normalizeText(value);

  if (level === "error" || level === "warning") {
    return level;
  }

  return "info";
}

function normalizeNotificationType(value: string): NotificationType {
  const type = normalizeText(value);

  if (type === "success" || type === "warning" || type === "danger") {
    return type;
  }

  return "info";
}

function normalizeNotificationStatus(value: string): NotificationStatus {
  const status = normalizeText(value);

  if (status === "read" || status === "leida") {
    return "read";
  }

  if (status === "archived" || status === "archivada") {
    return "archived";
  }

  return "unread";
}

function normalizeTargetRole(value: string): AppNotification["targetRole"] {
  const role = normalizeText(value);

  if (role === "admin" || role === "treasurer" || role === "coach") {
    return role;
  }

  return "all";
}

function normalizePlayerPaymentStatus(value: string): PlayerPaymentStatus {
  const status = normalizeText(value);

  if (["paid", "pago", "pagada", "pagado"].includes(status)) {
    return "paid";
  }

  if (["debt", "debe", "moroso", "vencida", "vencido"].includes(status)) {
    return "debt";
  }

  return "pending";
}

function normalizeReminderStatus(value: string): ReminderStatus {
  const status = normalizeText(value);

  if (status === "sent" || status === "enviado") {
    return "sent";
  }

  if (status === "failed" || status === "fallido" || status === "error") {
    return "failed";
  }

  if (status === "skipped" || status === "omitido") {
    return "skipped";
  }

  return "queued";
}

function normalizePaymentProvider(value: string): PaymentProvider {
  const provider = normalizeText(value);

  return provider === "stripe" ? "stripe" : "mercado-pago";
}

function normalizePaymentStatus(value: string): PaymentStatus {
  const status = normalizeText(value);

  if (["approved", "aprobado"].includes(status)) {
    return "approved";
  }

  if (["paid", "pagado", "pagada"].includes(status)) {
    return "paid";
  }

  if (["pending", "pendiente", "in_process"].includes(status)) {
    return "pending";
  }

  if (["created", "creado"].includes(status)) {
    return "created";
  }

  if (["rejected", "rechazado"].includes(status)) {
    return "rejected";
  }

  if (["cancelled", "canceled", "cancelado"].includes(status)) {
    return "cancelled";
  }

  if (["refunded", "reembolsado"].includes(status)) {
    return "refunded";
  }

  return "unknown";
}

function compareByTimestampDesc(
  left: { timestamp: string },
  right: { timestamp: string },
) {
  return right.timestamp.localeCompare(left.timestamp);
}

function compareByCreatedAtDesc(
  left: { createdAt: string },
  right: { createdAt: string },
) {
  return right.createdAt.localeCompare(left.createdAt);
}

function compareByUpdatedAtDesc(
  left: { updatedAt: string },
  right: { updatedAt: string },
) {
  return right.updatedAt.localeCompare(left.updatedAt);
}

function normalizeGoogleSheetsError(error: unknown) {
  if (error instanceof DataServiceError) {
    return error;
  }

  return new DataServiceError(
    "No se pudieron obtener datos desde Google Sheets.",
    "GOOGLE_SHEETS_ERROR",
    error,
  );
}

function buildEmptyMetrics(): DashboardMetric[] {
  return [
    {
      id: "total-players",
      title: "Cantidad de jugadores",
      value: "0",
      detail: "0 registrados",
      tone: "neutral",
    },
    {
      id: "delinquency-rate",
      title: "Morosidad",
      value: "0%",
      detail: "0 jugadores morosos",
      tone: "success",
    },
    {
      id: "monthly-income",
      title: "Ingresos del mes",
      value: formatCurrency(0),
      detail: getCurrentPeriod(),
      tone: "success",
    },
    {
      id: "annual-income",
      title: "Ingresos del año",
      value: formatCurrency(0),
      detail: `Comparativa ${new Date().getFullYear()}`,
      tone: "success",
    },
    {
      id: "new-players",
      title: "Jugadores nuevos",
      value: "0",
      detail: getCurrentPeriod(),
      tone: "neutral",
    },
    {
      id: "dropped-players",
      title: "Jugadores dados de baja",
      value: "0",
      detail: "Mes actual o estado baja",
      tone: "neutral",
    },
  ];
}

function parseCacheTtl(value?: string) {
  const parsed = Number(value ?? DEFAULT_CACHE_TTL_SECONDS);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_CACHE_TTL_SECONDS;
  }

  return parsed;
}

function assertValidPeriod(period: string) {
  if (!/^\d{4}-\d{2}$/.test(period)) {
    throw new DataServiceError(
      "El periodo debe tener formato AAAA-MM.",
      "CONFIGURATION_ERROR",
    );
  }
}

function findHeaderIndex(headers: string[], candidates: string[]) {
  return headers.findIndex((header) => candidates.includes(header));
}

function buildWritableFeeRow(
  headers: string[],
  input: UpdatePlayerFeeStatusInput,
  targetStatus: string,
  paidAt: string,
  monthlyFee: number,
) {
  const fallbackDueDate = `${input.period}-10`;
  const fallbackAmount = monthlyFee > 0 ? String(monthlyFee) : "";
  const fallbackValues: Record<string, string> = {
    id: `CUO-${input.playerId}-${input.period}`,
    cuota_id: `CUO-${input.playerId}-${input.period}`,
    fee_id: `CUO-${input.playerId}-${input.period}`,
    jugador_id: input.playerId,
    id_jugador: input.playerId,
    player_id: input.playerId,
    socio_id: input.playerId,
    id_socio: input.playerId,
    periodo: input.period,
    period: input.period,
    mes: input.period,
    monto: fallbackAmount,
    importe: fallbackAmount,
    amount: fallbackAmount,
    estado: targetStatus,
    status: targetStatus,
    vencimiento: fallbackDueDate,
    fecha_vencimiento: fallbackDueDate,
    due_date: fallbackDueDate,
    fecha_pago: paidAt,
    pagado_el: paidAt,
    paid_at: paidAt,
    payment_date: paidAt,
  };

  return headers.map((header) => fallbackValues[header] ?? "");
}

function getSheetPrefix(range: string) {
  return range.includes("!") ? range.split("!")[0] : "Cuotas";
}

function toColumnName(index: number) {
  let column = "";
  let value = index + 1;

  while (value > 0) {
    const remainder = (value - 1) % 26;
    column = String.fromCharCode(65 + remainder) + column;
    value = Math.floor((value - 1) / 26);
  }

  return column;
}

function getTodayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function invalidateDashboardCache() {
  revalidateGoogleSheetsTag("google-sheets");
  revalidateGoogleSheetsTag("google-sheets:dashboard");
}

function invalidateSettingsCache() {
  revalidateGoogleSheetsTag("google-sheets");
  revalidateGoogleSheetsTag("google-sheets:settings");
}

function invalidatePremiumCache() {
  revalidateGoogleSheetsTag("google-sheets");
  revalidateGoogleSheetsTag("google-sheets:premium");
}

function invalidatePlayersCache() {
  revalidateGoogleSheetsTag("google-sheets");
  revalidateGoogleSheetsTag("google-sheets:players");
  revalidateGoogleSheetsTag("google-sheets:dashboard");
  revalidateGoogleSheetsTag("google-sheets:fee-calculator");
  revalidateGoogleSheetsTag("google-sheets:cash-flow");
}

function invalidateFeeCalculatorCache() {
  revalidateGoogleSheetsTag("google-sheets");
  revalidateGoogleSheetsTag("google-sheets:fee-calculator");
  revalidateGoogleSheetsTag("google-sheets:cash-flow");
}

function invalidateCashFlowCache() {
  revalidateGoogleSheetsTag("google-sheets");
  revalidateGoogleSheetsTag("google-sheets:cash-flow");
}
