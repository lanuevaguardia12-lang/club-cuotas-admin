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
  CashFlowData,
  CashFlowMetric,
  CashFlowMonthlyPoint,
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
  FeeCalculatorCost,
  FeeCalculatorCostType,
  FeeCalculatorData,
  FeeMatchDetail,
  FeePlayerCalculation,
  FeeRefundPolicyRule,
  UpdateFeeCalculatorActualInput,
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

type RevalidateTagWithProfile = (
  tag: string,
  profile: "max" | { expire?: number },
) => void;

const revalidateTagWithProfile = revalidateTag as unknown as RevalidateTagWithProfile;

interface GoogleSheetsConfig {
  spreadsheetId?: string;
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
  matchesSpreadsheetId?: string;
  matchesRange: string;
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

interface CashFlowTransactionRecord {
  id: string;
  date: string | undefined;
  period: string;
  type: CashFlowTransactionType;
  concept: string;
  amount: number;
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
const DEFAULT_MATCHES_RANGE = "Partidos jugados formulario!A:Z";
const DEFAULT_REFUND_POLICY_RANGE = "Politica devoluciones!A:C";
const DEFAULT_CACHE_TTL_SECONDS = 300;

const CLUB_PLAYERS_RANGE = "Listado jugadores!A:Z";
const CLUB_TRACKING_RANGE = "Seguimiento!A:Z";
const CLUB_FINAL_FEE_RANGE = "Cuota final por jugador!A:Z";
const CLUB_FORM_RESPONSES_RANGE = "Respuestas de formulario!A:Z";
const CLUB_EXPENSES_RANGE = "Gastos nueva guardia!A:Z";

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

export class GoogleSheetsService implements IDataService {
  private readonly config: GoogleSheetsConfig;

  constructor(config: Partial<GoogleSheetsConfig> = {}) {
    this.config = {
      spreadsheetId: config.spreadsheetId ?? process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
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
      matchesSpreadsheetId:
        config.matchesSpreadsheetId ??
        process.env.GOOGLE_SHEETS_MATCHES_SPREADSHEET_ID ??
        config.spreadsheetId ??
        process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
      matchesRange:
        config.matchesRange ??
        process.env.GOOGLE_SHEETS_MATCHES_RANGE ??
        DEFAULT_MATCHES_RANGE,
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

  async getDashboardData(): Promise<DashboardData> {
    const cachedAt = new Date().toISOString();

    try {
      this.assertConfigured();
      const { players, fees, message } = await this.readDashboardRecords();

      return buildDashboardData({
        players,
        fees,
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
        status: "error",
        message: serviceError.message,
        cachedAt,
        revalidateSeconds: this.config.cacheTtlSeconds,
      });
    }
  }

  async getCashFlowData(): Promise<CashFlowData> {
    const cachedAt = new Date().toISOString();

    try {
      this.assertConfigured();
      const transactions = await this.readCashFlowTransactions();

      return buildCashFlowData({
        transactions,
        status: transactions.length === 0 ? "empty" : "ready",
        message:
          transactions.length === 0
            ? "Google Sheets conectado, sin movimientos de cash flow cargados."
            : "Cash Flow obtenido desde Google Sheets.",
        cachedAt,
        revalidateSeconds: this.config.cacheTtlSeconds,
      });
    } catch (error) {
      const serviceError = normalizeGoogleSheetsError(error);

      return buildFallbackCashFlowData({
        status: "error",
        message: serviceError.message,
        cachedAt,
        revalidateSeconds: this.config.cacheTtlSeconds,
      });
    }
  }

  async getFeeCalculatorData(period = getCurrentPeriod()): Promise<FeeCalculatorData> {
    const cachedAt = new Date().toISOString();

    try {
      this.assertConfigured();
      assertValidPeriod(period);

      const {
        players,
        fees,
        costsRows,
        actualsRows,
        refundPolicyRows,
        matchRows,
        expenseRows,
      } = await this.readFeeCalculatorRows();
      const costs = mapRowsToFeeCalculatorCosts(costsRows);
      const actuals = mapRowsToFeeCalculatorActuals(actualsRows);
      const refundPolicy = mapRowsToRefundPolicy(refundPolicyRows);
      const matches = mapRowsToMatches(matchRows);
      const expenseCredits = mapClubExpenseRowsToPlayerCredits(expenseRows);

      return buildFeeCalculatorData({
        period,
        players,
        fees,
        costs,
        actuals,
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
        fees: [],
        costs: [],
        actuals: [],
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

    const cost = normalizeFeeCalculatorCostInput(input);
    const rows = await this.readOptionalValues(this.config.feeCalculatorCostsRange);
    const now = new Date().toISOString();
    const sheets = this.createSheetsClient();
    const sheetPrefix = getSheetPrefix(this.config.feeCalculatorCostsRange);

    await this.ensureSheetForRange(this.config.feeCalculatorCostsRange);

    if (rows.length === 0) {
      const id = cost.id || createId("cost");

      await sheets.spreadsheets.values.update({
        spreadsheetId: this.config.spreadsheetId,
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
      const existing = mapRowsToFeeCalculatorCosts([
        headers,
        dataRows[targetRowIndex],
      ])[0];
      const spreadsheetRow = targetRowIndex + 2;

      await sheets.spreadsheets.values.update({
        spreadsheetId: this.config.spreadsheetId,
        range: `${sheetPrefix}!A${spreadsheetRow}:${toColumnName(headers.length - 1)}${spreadsheetRow}`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [
            buildFeeCalculatorCostWritableRow(headers, {
              ...cost,
              id: targetId,
              active: existing?.active ?? true,
              createdAt: existing?.createdAt || now,
              updatedAt: now,
            }),
          ],
        },
      });
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId: this.config.spreadsheetId,
        range: this.config.feeCalculatorCostsRange,
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

    const values = await this.readValues(this.config.feeCalculatorCostsRange);

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
      spreadsheetId: this.config.spreadsheetId,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data,
      },
    });
    invalidateFeeCalculatorCache();
  }

  async updateFeeCalculatorActual(input: UpdateFeeCalculatorActualInput): Promise<void> {
    this.assertConfigured();
    assertValidPeriod(input.period);

    const actual = normalizeFeeCalculatorActualInput(input);
    const rows = await this.readOptionalValues(this.config.feeCalculatorActualsRange);
    const now = new Date().toISOString();
    const sheets = this.createSheetsClient();
    const sheetPrefix = getSheetPrefix(this.config.feeCalculatorActualsRange);

    await this.ensureSheetForRange(this.config.feeCalculatorActualsRange);

    if (rows.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: this.config.spreadsheetId,
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
        spreadsheetId: this.config.spreadsheetId,
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
        spreadsheetId: this.config.spreadsheetId,
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
    const spreadsheetId = this.config.spreadsheetId;

    if (!spreadsheetId) {
      throw new DataServiceError(
        "GOOGLE_SHEETS_SPREADSHEET_ID no esta configurado.",
        "CONFIGURATION_ERROR",
      );
    }

    return unstable_cache(
      async () => ({
        playersRows: await this.readValues(this.config.playersRange),
        feesRows: await this.readValues(this.config.feesRange),
      }),
      [
        "google-sheets-dashboard",
        spreadsheetId,
        this.config.playersRange,
        this.config.feesRange,
      ],
      {
        revalidate: this.config.cacheTtlSeconds,
        tags: ["google-sheets", "google-sheets:dashboard"],
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
    const spreadsheetId = this.config.spreadsheetId;

    if (!spreadsheetId) {
      throw new DataServiceError(
        "GOOGLE_SHEETS_SPREADSHEET_ID no esta configurado.",
        "CONFIGURATION_ERROR",
      );
    }

    return unstable_cache(
      async () => ({
        playersRows: await this.readValues(CLUB_PLAYERS_RANGE),
        trackingRows: await this.readValues(CLUB_TRACKING_RANGE),
        finalFeeRows: await this.readValues(CLUB_FINAL_FEE_RANGE),
        formResponseRows: await this.readOptionalValues(CLUB_FORM_RESPONSES_RANGE),
      }),
      [
        "google-sheets-club-dashboard",
        spreadsheetId,
        CLUB_PLAYERS_RANGE,
        CLUB_TRACKING_RANGE,
        CLUB_FINAL_FEE_RANGE,
        CLUB_FORM_RESPONSES_RANGE,
      ],
      {
        revalidate: this.config.cacheTtlSeconds,
        tags: ["google-sheets", "google-sheets:dashboard"],
      },
    )();
  }

  private async readCachedClubFinancialRows() {
    const spreadsheetId = this.config.spreadsheetId;

    if (!spreadsheetId) {
      throw new DataServiceError(
        "GOOGLE_SHEETS_SPREADSHEET_ID no esta configurado.",
        "CONFIGURATION_ERROR",
      );
    }

    return unstable_cache(
      async () => ({
        playersRows: await this.readValues(CLUB_PLAYERS_RANGE),
        trackingRows: await this.readValues(CLUB_TRACKING_RANGE),
        finalFeeRows: await this.readValues(CLUB_FINAL_FEE_RANGE),
        formResponseRows: await this.readOptionalValues(CLUB_FORM_RESPONSES_RANGE),
        expenseRows: await this.readOptionalValues(CLUB_EXPENSES_RANGE),
      }),
      [
        "google-sheets-club-financial",
        spreadsheetId,
        CLUB_PLAYERS_RANGE,
        CLUB_TRACKING_RANGE,
        CLUB_FINAL_FEE_RANGE,
        CLUB_FORM_RESPONSES_RANGE,
        CLUB_EXPENSES_RANGE,
      ],
      {
        revalidate: this.config.cacheTtlSeconds,
        tags: ["google-sheets", "google-sheets:cash-flow"],
      },
    )();
  }

  private async readFeeCalculatorRows() {
    const spreadsheetId = this.config.spreadsheetId;
    const matchesSpreadsheetId = this.config.matchesSpreadsheetId;

    if (!spreadsheetId) {
      throw new DataServiceError(
        "GOOGLE_SHEETS_SPREADSHEET_ID no esta configurado.",
        "CONFIGURATION_ERROR",
      );
    }

    const [{ players, fees }, calculatorRows] = await Promise.all([
      this.readDashboardRecords(),
      unstable_cache(
        async () => ({
          costsRows: await this.readOptionalValues(this.config.feeCalculatorCostsRange),
          actualsRows: await this.readOptionalValues(
            this.config.feeCalculatorActualsRange,
          ),
          refundPolicyRows: await this.readOptionalValues(this.config.refundPolicyRange),
          matchRows: matchesSpreadsheetId
            ? await this.readOptionalValuesFromSpreadsheet(
                matchesSpreadsheetId,
                this.config.matchesRange,
              )
            : [],
          expenseRows: await this.readOptionalValues(CLUB_EXPENSES_RANGE),
        }),
        [
          "google-sheets-fee-calculator",
          spreadsheetId,
          matchesSpreadsheetId ?? "",
          this.config.feeCalculatorCostsRange,
          this.config.feeCalculatorActualsRange,
          this.config.refundPolicyRange,
          this.config.matchesRange,
          CLUB_EXPENSES_RANGE,
        ],
        {
          revalidate: this.config.cacheTtlSeconds,
          tags: ["google-sheets", "google-sheets:fee-calculator"],
        },
      )(),
    ]);

    return {
      players,
      fees,
      ...calculatorRows,
    };
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

  private async ensureSheetForRange(range: string) {
    const title = unquoteSheetTitle(getSheetPrefix(range));
    const sheets = this.createSheetsClient();
    const metadata = await sheets.spreadsheets.get({
      spreadsheetId: this.config.spreadsheetId,
      fields: "sheets.properties.title",
    });
    const exists = metadata.data.sheets?.some(
      (sheet) => sheet.properties?.title === title,
    );

    if (exists) {
      return;
    }

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.config.spreadsheetId,
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
  ) {
    const values = await this.readValues(range).catch(() => []);
    const sheets = this.createSheetsClient();

    await sheets.spreadsheets.values.append({
      spreadsheetId: this.config.spreadsheetId,
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
    const playersRows = await this.readValues(this.config.playersRange);
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
      const { playersRows, feesRows } = await this.readCachedDashboardRows();
      const players = mapRowsToPlayers(playersRows);
      const fees = mapRowsToFees(feesRows);

      return {
        players,
        fees,
        message: "Datos obtenidos desde Google Sheets.",
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
      CLUB_FORM_RESPONSES_RANGE,
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
    );

    invalidateDashboardCache();
  }
}

function mapRowsToPlayers(rows: unknown[][]): PlayerRecord[] {
  return rowsToRecords(rows).map((record, index) => {
    const name = pick(record, ["nombre", "name", "jugador", "player"]);

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
      phone: pick(record, ["telefono", "phone", "whatsapp", "celular"]) || "-",
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
    .map((record, index) => {
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

      if (amount === 0) {
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
      const status = isClubPaidStatus(rawStatus)
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
      "jugador",
      "nombre",
    ]);
    const year = Number(pick(record, ["ano", "anio", "year"]));
    const month = monthNameToNumber(pick(record, ["mes", "month"]));
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

function mapRowsToFeeCalculatorCosts(rows: unknown[][]): FeeCalculatorCost[] {
  return rowsToRecords(rows)
    .map((record, index) => {
      const startPeriod =
        normalizePeriod(
          pick(record, ["vigencia_desde", "desde", "periodo_desde", "start_period"]),
        ) ?? getCurrentPeriod();
      const endPeriod =
        normalizePeriod(
          pick(record, ["vigencia_hasta", "hasta", "periodo_hasta", "end_period"]),
        ) ?? startPeriod;
      const name =
        pick(record, ["nombre", "name", "costo", "concepto"]) || `Costo ${index + 1}`;

      return {
        id: pick(record, ["id", "costo_id", "cost_id"]) || `cost-${index + 1}`,
        name,
        type: normalizeFeeCalculatorCostType(pick(record, ["tipo", "type"])),
        startPeriod,
        endPeriod: endPeriod < startPeriod ? startPeriod : endPeriod,
        amount: Math.max(
          parseMoney(pick(record, ["monto", "importe", "amount", "valor"])),
          0,
        ),
        repeatsMonthly: parseLooseBoolean(
          pick(record, ["repite_mensual", "repite", "mensual", "repeats_monthly"]),
          true,
        ),
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
    })
    .filter((cost) => cost.active)
    .sort((left, right) => left.name.localeCompare(right.name, "es"));
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
  fees,
  costs,
  actuals,
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
  fees: FeeRecord[];
  costs: FeeCalculatorCost[];
  actuals: FeeCalculatorActual[];
  refundPolicy: FeeRefundPolicyRule[];
  matches: MatchRecord[];
  expenseCredits: Array<PlayerExpenseCredit & { period: string }>;
  status: FeeCalculatorData["source"]["status"];
  message: string;
  cachedAt: string;
  revalidateSeconds: number;
}): FeeCalculatorData {
  const previousPeriod = getPreviousPeriod(period);
  const activePlayers = players.filter((player) => !isDroppedPlayer(player));
  const activeCosts = costs.filter((cost) => cost.active);
  const effectiveActuals = mergeInferredFeeCalculatorActuals(
    activeCosts,
    actuals,
    matches,
    previousPeriod,
  );
  const plannedCurrentQuota = calculateBaseQuotaForPeriod(
    activeCosts,
    effectiveActuals,
    period,
    "forecast",
  );
  const previousPlannedQuota = calculateBaseQuotaForPeriod(
    activeCosts,
    effectiveActuals,
    previousPeriod,
    "forecast",
  );
  const previousActualQuota = calculateBaseQuotaForPeriod(
    activeCosts,
    effectiveActuals,
    previousPeriod,
    "actual",
  );
  const previousCostVariance = previousActualQuota - previousPlannedQuota;
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
      fees,
      period,
      previousPeriod,
      baseQuota,
      plannedCurrentQuota,
      previousBaseQuota:
        previousPlannedQuota || getPlayerFeeAmount(fees, player.id, previousPeriod),
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
      previousBaseQuota: previousPlannedQuota,
      previousCostVariance,
      baseQuota,
      activeCosts: activeCosts.length,
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
  fees,
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
  fees: FeeRecord[];
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
  const refundBase =
    previousBaseQuota || getPlayerFeeAmount(fees, player.id, previousPeriod);
  const refundAmount = refundBase * (refundPercent / 100);
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
    previousBaseQuota: refundBase,
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
  ];
  const rows = transactions.map<ExportRow>((transaction) => ({
    id: transaction.id,
    date: transaction.date ?? "",
    period: transaction.period,
    type: transaction.type === "income" ? "Ingreso" : "Gasto",
    concept: transaction.concept,
    amount: transaction.type === "income" ? transaction.amount : -transaction.amount,
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
    return "Baja";
  }

  return player.status || "Activo";
}

function buildDashboardData({
  players,
  fees,
  status,
  message,
  cachedAt,
  revalidateSeconds,
}: {
  players: PlayerRecord[];
  fees: FeeRecord[];
  status: DashboardData["source"]["status"];
  message: string;
  cachedAt: string;
  revalidateSeconds: number;
}): DashboardData {
  const currentPeriod = getCurrentPeriod();
  const currentYear = new Date().getFullYear();
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
      ? players.filter((player) => !pendingPlayerIds.has(player.id)).length
      : Math.max(totalPlayers - pendingPlayerIds.size, 0);
  const pendingNotOverduePlayers = Array.from(pendingPlayerIds).filter(
    (playerId) => !overduePlayerIds.has(playerId),
  ).length;

  return {
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
    players: buildPlayerTableRows(players, fees),
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
  transactions,
  status,
  message,
  cachedAt,
  revalidateSeconds,
}: {
  transactions: CashFlowTransactionRecord[];
  status: CashFlowData["source"]["status"];
  message: string;
  cachedAt: string;
  revalidateSeconds: number;
}): CashFlowData {
  const currentPeriod = getCurrentPeriod();
  const currentTransactions = transactions.filter(
    (transaction) => transaction.period === currentPeriod,
  );
  const currentIncome = sumCashFlow(currentTransactions, "income");
  const currentExpenses = sumCashFlow(currentTransactions, "expense");
  const currentBalance = currentIncome - currentExpenses;
  const totalCash =
    sumCashFlow(transactions, "income") - sumCashFlow(transactions, "expense");

  return {
    metrics: buildCashFlowMetrics({
      currentIncome,
      currentExpenses,
      currentBalance,
      totalCash,
      currentPeriod,
    }),
    charts: {
      monthly: buildCashFlowMonthlyChart(transactions),
      annual: buildCashFlowAnnualChart(transactions),
    },
    emptyState: {
      title: status === "ready" ? "Cash Flow" : "Cash Flow sin movimientos",
      description:
        status === "ready"
          ? "Vista financiera de ingresos, gastos, balance y saldo."
          : "Carga movimientos en Google Sheets para alimentar esta seccion.",
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
  status,
  message,
  cachedAt,
  revalidateSeconds,
}: {
  status: CashFlowData["source"]["status"];
  message: string;
  cachedAt: string;
  revalidateSeconds: number;
}): CashFlowData {
  return {
    metrics: buildCashFlowMetrics({
      currentIncome: 0,
      currentExpenses: 0,
      currentBalance: 0,
      totalCash: 0,
      currentPeriod: getCurrentPeriod(),
    }),
    charts: {
      monthly: buildCashFlowMonthlyChart([]),
      annual: buildCashFlowAnnualChart([]),
    },
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
}: {
  currentIncome: number;
  currentExpenses: number;
  currentBalance: number;
  totalCash: number;
  currentPeriod: string;
}): CashFlowMetric[] {
  return [
    {
      id: "income",
      title: "Ingresos",
      value: formatCurrency(currentIncome),
      detail: currentPeriod,
      tone: "success",
    },
    {
      id: "expenses",
      title: "Gastos",
      value: formatCurrency(currentExpenses),
      detail: currentPeriod,
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

function buildCashFlowMonthlyChart(
  transactions: CashFlowTransactionRecord[],
): CashFlowMonthlyPoint[] {
  return getLastPeriods(12).map((period) => {
    const periodTransactions = transactions.filter(
      (transaction) => transaction.period === period,
    );
    const ingresos = sumCashFlow(periodTransactions, "income");
    const gastos = sumCashFlow(periodTransactions, "expense");

    return {
      period,
      label: formatPeriodLabel(period),
      ingresos,
      gastos,
      balance: ingresos - gastos,
    };
  });
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

function sumCashFlow(
  transactions: CashFlowTransactionRecord[],
  type: CashFlowTransactionType,
) {
  return transactions
    .filter((transaction) => transaction.type === type)
    .reduce((total, transaction) => total + transaction.amount, 0);
}

function buildFallbackDashboardData({
  status,
  message,
  cachedAt,
  revalidateSeconds,
}: {
  status: DashboardData["source"]["status"];
  message: string;
  cachedAt: string;
  revalidateSeconds: number;
}): DashboardData {
  return {
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
): PlayerTableRow[] {
  const feesByPlayer = groupFeesByPlayer(fees);
  const playerIdsFromFees = Array.from(new Set(fees.map((fee) => fee.playerId)));
  const sourcePlayers =
    players.length > 0
      ? players
      : playerIdsFromFees.map((playerId) => ({
          id: playerId,
          name: playerId,
          category: "Sin categoria",
          phone: "-",
          monthlyFee: 0,
          observations: "-",
          status: "",
        }));

  return sourcePlayers.map((player) => {
    const playerFees = feesByPlayer.get(player.id) ?? [];
    const currentFee = findCurrentFee(playerFees);
    const latestFee = findLatestFee(playerFees);
    const latestPaidFee = findLatestPaidFee(playerFees);
    const status = getPlayerPaymentStatus(playerFees, currentFee, latestFee);
    const feeAmount = currentFee?.amount || latestFee?.amount || player.monthlyFee;

    return {
      id: player.id,
      name: player.name,
      category: player.category,
      phone: player.phone,
      fee: feeAmount > 0 ? formatCurrency(feeAmount) : "-",
      feeAmount,
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

function findCurrentFee(fees: FeeRecord[]) {
  const currentPeriod = getCurrentPeriod();

  return fees.find((fee) => fee.period === currentPeriod);
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
): PlayerPaymentStatus {
  if (fees.some((fee) => fee.status === "overdue")) {
    return "debt";
  }

  if (currentFee?.status === "paid" || (!currentFee && latestFee?.status === "paid")) {
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

  if (!startPeriod || !endPeriod) {
    throw new DataServiceError(
      "La vigencia del costo debe tener formato AAAA-MM.",
      "CONFIGURATION_ERROR",
    );
  }

  return {
    id: input.id?.trim() ?? "",
    name: input.name.trim(),
    type: input.type,
    startPeriod,
    endPeriod: endPeriod < startPeriod ? startPeriod : endPeriod,
    amount: Math.max(Number(input.amount), 0),
    repeatsMonthly: Boolean(input.repeatsMonthly),
    splitBetween: Math.max(Math.round(Number(input.splitBetween)), 1),
    forecastUnits: Math.max(Number(input.forecastUnits), 0),
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

function calculateBaseQuotaForPeriod(
  costs: FeeCalculatorCost[],
  actuals: FeeCalculatorActual[],
  period: string,
  mode: "forecast" | "actual",
) {
  return costs
    .filter((cost) => isCostActiveForPeriod(cost, period))
    .reduce((total, cost) => total + calculateCostShare(cost, actuals, period, mode), 0);
}

function calculateCostShare(
  cost: FeeCalculatorCost,
  actuals: FeeCalculatorActual[],
  period: string,
  mode: "forecast" | "actual",
) {
  const actualUnits = actuals.find(
    (actual) => actual.costId === cost.id && actual.period === period,
  )?.actualUnits;
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
) {
  const merged = [...actuals];
  const existingKeys = new Set(
    actuals.map((actual) => `${actual.costId}:${actual.period}`),
  );

  costs.forEach((cost) => {
    const key = `${cost.id}:${period}`;

    if (existingKeys.has(key)) {
      return;
    }

    const inferredUnits = inferActualUnitsForCost(cost, matches, period);

    if (typeof inferredUnits !== "number") {
      return;
    }

    merged.push({
      id: `auto-${cost.id}-${period}`,
      costId: cost.id,
      period,
      actualUnits: inferredUnits,
      notes:
        cost.type === "coach"
          ? "Autocalculado desde Asistió joaco? x 3 horas."
          : "Autocalculado desde partidos Local.",
      updatedAt: new Date().toISOString(),
    });
  });

  return merged;
}

function inferActualUnitsForCost(
  cost: FeeCalculatorCost,
  matches: MatchRecord[],
  period: string,
) {
  const periodMatches = matches.filter((match) => match.period === period);

  if (cost.type === "court") {
    return periodMatches.filter(isLocalMatch).length;
  }

  if (cost.type === "coach") {
    return periodMatches.filter((match) => match.coachAttended).length * 3;
  }

  return undefined;
}

function isLocalMatch(match: MatchRecord) {
  return normalizeText(match.venue) === "local";
}

function isCostActiveForPeriod(cost: FeeCalculatorCost, period: string) {
  if (!cost.active) {
    return false;
  }

  if (cost.repeatsMonthly) {
    return period >= cost.startPeriod && period <= cost.endPeriod;
  }

  return period === cost.startPeriod;
}

function getPlayerFeeAmount(fees: FeeRecord[], playerId: string, period: string) {
  return (
    fees.find((fee) => fee.playerId === playerId && fee.period === period)?.amount ?? 0
  );
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
  revalidateTagWithProfile("google-sheets", "max");
  revalidateTagWithProfile("google-sheets:dashboard", "max");
}

function invalidateSettingsCache() {
  revalidateTagWithProfile("google-sheets", "max");
  revalidateTagWithProfile("google-sheets:settings", "max");
}

function invalidatePremiumCache() {
  revalidateTagWithProfile("google-sheets", "max");
  revalidateTagWithProfile("google-sheets:premium", "max");
}

function invalidateFeeCalculatorCache() {
  revalidateTagWithProfile("google-sheets", "max");
  revalidateTagWithProfile("google-sheets:fee-calculator", "max");
}
