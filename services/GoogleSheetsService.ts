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
import { APP_TEAM_NAME, getLeagueClubMatchesForYear } from "@/lib/league-fixture";
import { DataServiceError } from "@/services/data-service-error";
import type { IDataService } from "@/services/IDataService";
import type {
  AccountAuthOverride,
  AccountProfile,
  PlayerAttendanceSummary,
  UpdateAccountPasswordInput,
  UpdateAccountProfileInput,
} from "@/types/account";
import type { AuthUser } from "@/types/auth";
import type {
  AnnualComparisonPoint,
  CashFlowConceptBreakdownPoint,
  CashFlowConceptSeries,
  CashFlowData,
  CashFlowMatrixRow,
  CashFlowMetric,
  CashFlowMonthlyPoint,
  CashFlowScenario,
  CashFlowScenarioData,
  CashFlowTransaction,
  CashFlowTransactionType,
  ChartDatum,
  DashboardData,
  DashboardMetric,
  DelinquencyTrendPoint,
  MonthlyCollectionPoint,
  PlayerFeeHistoryItem,
  PlayerLifecyclePoint,
  PlayerMonthMatchSummary,
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
  FeePlayerMatchSummary,
  FeeRefundPolicyRule,
  UpdateFeeCalculatorActualInput,
  UpdateFeeCalculatorPlayerStatusInput,
  UpdateFeeRefundPolicyInput,
  UpsertFeeCalculatorCostInput,
} from "@/types/fee-calculator";
import type {
  FixtureMatchScheduleOverride,
  LeagueCompetitionKind,
  LeagueFixtureMatch,
  LeagueGoalEvent,
  LeagueMatchStatus,
  UpdateFixtureMatchScheduleInput,
} from "@/types/fixture";
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
  PushSubscriptionInput,
  PushSubscriptionRecord,
  ReminderJob,
  ReminderStatus,
  UpdateReminderJobStatusInput,
  UpsertPaymentRecordInput,
} from "@/types/premium";
import type {
  PlayerOfMatchData,
  PlayerOfMatchMatch,
  PlayerOfMatchRankings,
  PlayerOfMatchVote,
  SubmitPlayerOfMatchVoteInput,
  UpdatePlayerOfMatchMatchInput,
} from "@/types/player-of-match";
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
  accountProfilesRange: string;
  playerAttendanceSnapshotsRange: string;
  playersRange: string;
  feesRange: string;
  cashFlowRange: string;
  settingsRange: string;
  auditRange: string;
  logsRange: string;
  notificationsRange: string;
  remindersRange: string;
  paymentsRange: string;
  pushSubscriptionsRange: string;
  playerOfMatchVotesRange: string;
  playerOfMatchOverridesRange: string;
  fixtureOverridesRange: string;
  feeCalculatorCostsRange: string;
  feeCalculatorActualsRange: string;
  feeCalculatorPlayerStatusesRange: string;
  matchesSpreadsheetId?: string;
  matchesRange: string;
  formResponsesRange: string;
  expensesRange: string;
  refundPolicyRange: string;
  cacheTtlSeconds: number;
  formResponsesCacheTtlSeconds: number;
}

interface SheetRecord {
  [key: string]: string;
}

interface PlayerRecord {
  id: string;
  name: string;
  category: string;
  dni: string;
  birthDate: string;
  position: string;
  secondPosition: string;
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
  sourceType?: LeagueCompetitionKind;
  sourceLabel?: string;
  resultLabel?: string;
  canEdit?: boolean;
  localTeam?: string;
  visitorTeam?: string;
  players: string[];
  venue: string;
  coachAttended: boolean;
  loadedAt: string;
}

interface PlayerOfMatchOverrideRecord {
  matchId: string;
  date: string;
  rival: string;
  sourceType: LeagueCompetitionKind;
  players: string[];
  updatedByUserId: string;
  updatedByName: string;
  updatedAt: string;
}

interface AccountProfileRecord extends AccountProfile {
  passwordHash: string;
}

interface PlayerAttendanceSnapshotRecord extends PlayerAttendanceSummary {
  id: string;
  playerId: string;
  playerName: string;
  updatedAt: string;
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
const DEFAULT_PUSH_SUBSCRIPTIONS_RANGE = "PushSubscriptions!A:Z";
const DEFAULT_PLAYER_OF_MATCH_VOTES_RANGE = "JugadorPartidoVotos!A:Z";
const DEFAULT_PLAYER_OF_MATCH_OVERRIDES_RANGE = "JugadorPartidoAjustes!A:Z";
const DEFAULT_FIXTURE_OVERRIDES_RANGE = "FixtureAjustes!A:Z";
const DEFAULT_FEE_CALCULATOR_COSTS_RANGE = "CalculadoraCostos!A:Z";
const DEFAULT_FEE_CALCULATOR_ACTUALS_RANGE = "CalculadoraReales!A:Z";
const DEFAULT_FEE_CALCULATOR_PLAYER_STATUSES_RANGE = "CalculadoraJugadores!A:Z";
const DEFAULT_MATCHES_RANGE = "Partidos jugados formulario!A:Z";
const DEFAULT_FORM_RESPONSES_RANGE = "Respuestas de formulario!A:Z";
const DEFAULT_EXPENSES_RANGE = "Gastos nueva guardia!A:Z";
const DEFAULT_REFUND_POLICY_RANGE = "Politica devoluciones!A:C";
const DEFAULT_CACHE_TTL_SECONDS = 300;
const DEFAULT_FORM_RESPONSES_CACHE_TTL_SECONDS = 60;
const DEFAULT_ACCOUNT_PROFILES_RANGE = "CuentasUsuario!A:Z";
const DEFAULT_PLAYER_ATTENDANCE_SNAPSHOTS_RANGE = "AsistenciasJugadores!A:Z";
const PLAYER_PROFILE_SEASON_START_DATE = "2026-08-11";
const PLAYER_OF_MATCH_VOTING_WINDOW_DAYS = 4;

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
  "target_user_id",
  "target_player_id",
  "reference_id",
  "url",
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

const pushSubscriptionHeaders = [
  "id",
  "user_id",
  "player_id",
  "endpoint",
  "p256dh",
  "auth",
  "user_agent",
  "activo",
  "creado_en",
  "actualizado_en",
];

const playerOfMatchVoteHeaders = [
  "id",
  "partido_id",
  "fecha_partido",
  "rival",
  "votante_user_id",
  "votante_player_id",
  "votante_nombre",
  "primer_voto_jugador",
  "segundo_voto_jugador",
  "creado_en",
];

const playerOfMatchOverrideHeaders = [
  "partido_id",
  "fecha",
  "rival",
  "competencia",
  "jugadores",
  "actualizado_por_user_id",
  "actualizado_por",
  "actualizado_en",
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
  "escenario",
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
  "dni",
  "fecha_nacimiento",
  "posicion",
  "segunda_posicion",
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
  "jugadores_asignados",
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
  "monto_real",
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

const accountProfileHeaders = [
  "user_id",
  "username",
  "rol",
  "nombre",
  "email",
  "telefono",
  "foto_perfil",
  "password_hash",
  "password_actualizado_en",
  "actualizado_en",
];

const playerAttendanceSnapshotHeaders = [
  "id",
  "jugador_id",
  "jugador",
  "temporada",
  "fecha_inicio",
  "partidos_totales",
  "partidos_asistidos",
  "porcentaje_asistencia",
  "mejor_racha",
  "racha_actual",
  "ultima_asistencia_fecha",
  "ultima_asistencia_rival",
  "calculado_en",
  "actualizado_en",
];

const fixtureOverrideHeaders = [
  "match_id",
  "fecha_hora",
  "goles_local",
  "goles_visitante",
  "penales_local",
  "penales_visitante",
  "goleadores_lng",
  "actualizado_por_user_id",
  "actualizado_por",
  "actualizado_en",
];

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
      accountProfilesRange:
        config.accountProfilesRange ??
        process.env.GOOGLE_SHEETS_ACCOUNT_PROFILES_RANGE ??
        DEFAULT_ACCOUNT_PROFILES_RANGE,
      playerAttendanceSnapshotsRange:
        config.playerAttendanceSnapshotsRange ??
        process.env.GOOGLE_SHEETS_PLAYER_ATTENDANCE_SNAPSHOTS_RANGE ??
        DEFAULT_PLAYER_ATTENDANCE_SNAPSHOTS_RANGE,
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
      pushSubscriptionsRange:
        config.pushSubscriptionsRange ??
        process.env.GOOGLE_SHEETS_PUSH_SUBSCRIPTIONS_RANGE ??
        DEFAULT_PUSH_SUBSCRIPTIONS_RANGE,
      playerOfMatchVotesRange:
        config.playerOfMatchVotesRange ??
        process.env.GOOGLE_SHEETS_PLAYER_OF_MATCH_VOTES_RANGE ??
        DEFAULT_PLAYER_OF_MATCH_VOTES_RANGE,
      playerOfMatchOverridesRange:
        config.playerOfMatchOverridesRange ??
        process.env.GOOGLE_SHEETS_PLAYER_OF_MATCH_OVERRIDES_RANGE ??
        DEFAULT_PLAYER_OF_MATCH_OVERRIDES_RANGE,
      fixtureOverridesRange:
        config.fixtureOverridesRange ??
        process.env.GOOGLE_SHEETS_FIXTURE_OVERRIDES_RANGE ??
        DEFAULT_FIXTURE_OVERRIDES_RANGE,
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
      formResponsesCacheTtlSeconds:
        config.formResponsesCacheTtlSeconds ??
        parseCacheTtl(
          process.env.GOOGLE_SHEETS_FORM_RESPONSES_CACHE_TTL_SECONDS,
          DEFAULT_FORM_RESPONSES_CACHE_TTL_SECONDS,
        ),
    };
  }

  private getPaymentAwareCacheTtlSeconds() {
    return Math.min(
      this.config.cacheTtlSeconds,
      this.config.formResponsesCacheTtlSeconds,
    );
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

  async getAccountProfile(user: AuthUser) {
    const cachedAt = new Date().toISOString();

    try {
      this.assertConfigured();
      const account = await this.findAccountProfile(user.id, user.username);
      const player =
        user.role === "player"
          ? await this.findPlayerRecordForUser(user).catch(() => null)
          : null;
      const attendance = player
        ? buildPlayerAttendanceSummary(
            player,
            await this.readPlayerOfMatchMatches().catch(() => []),
          )
        : undefined;
      const mvpWins = player
        ? await this.getPlayerOfMatchData(user.id)
            .then((data) => countPlayerOfMatchWins(player, data.matches))
            .catch(() => 0)
        : 0;

      if (player && attendance) {
        await this.upsertPlayerAttendanceSnapshot({
          ...attendance,
          id: `attendance-${attendance.seasonYear}-${player.id}`,
          playerId: player.id,
          playerName: player.name,
          updatedAt: new Date().toISOString(),
        }).catch(() => undefined);
      }

      return {
        profile: buildAccountProfile(user, account, player, attendance, mvpWins),
        source: {
          provider: "google-sheets" as const,
          status: "ready" as const,
          message: "Cuenta obtenida desde Google Sheets.",
          cachedAt,
          revalidateSeconds: this.config.cacheTtlSeconds,
        },
      };
    } catch (error) {
      const serviceError = normalizeGoogleSheetsError(error);

      return {
        profile: buildAccountProfile(user),
        source: {
          provider: "google-sheets" as const,
          status: "error" as const,
          message: serviceError.message,
          cachedAt,
          revalidateSeconds: this.config.cacheTtlSeconds,
        },
      };
    }
  }

  async updateAccountProfile(input: UpdateAccountProfileInput): Promise<void> {
    this.assertConfigured();

    const existing = await this.findAccountProfile(input.userId, input.username);

    await this.upsertAccountProfile({
      ...buildAccountProfileFromInput(input, existing),
      passwordHash: existing?.passwordHash ?? "",
      passwordUpdatedAt: existing?.passwordUpdatedAt ?? "",
    });

    if (input.role === "player") {
      const existingPlayer = await this.findPlayerDirectoryItemForUser({
        id: input.userId,
        name: input.name,
        playerId: input.playerId ?? input.userId,
        role: input.role,
        username: input.username,
      }).catch(() => null);

      if (existingPlayer) {
        await this.upsertPlayer({
          id: existingPlayer.id,
          birthDate: input.birthDate,
          category: existingPlayer.category,
          dni: input.dni,
          email: input.email,
          name: input.name,
          notes: existingPlayer.notes,
          phone: input.phone,
          position: input.position,
          secondPosition: input.secondPosition,
          status: existingPlayer.status,
        });
      }
    }
    invalidateAccountCache();
  }

  async updateAccountPassword(input: UpdateAccountPasswordInput): Promise<void> {
    this.assertConfigured();

    const existing = await this.findAccountProfile(input.userId, input.username);
    const now = new Date().toISOString();

    await this.upsertAccountProfile({
      userId: input.userId,
      username: input.username,
      role: existing?.role ?? input.role,
      name: existing?.name || input.name,
      email: existing?.email ?? "",
      phone: existing?.phone ?? "",
      profilePhotoDataUrl: existing?.profilePhotoDataUrl ?? "",
      passwordHash: input.passwordHash,
      passwordUpdatedAt: now,
      updatedAt: existing?.updatedAt || now,
    });
    invalidateAccountCache();
  }

  async getAccountAuthOverride(
    userId: string,
    username: string,
  ): Promise<AccountAuthOverride | null> {
    this.assertConfigured();

    const account = await this.findAccountProfile(userId, username).catch(() => null);

    if (!account) {
      return null;
    }

    return {
      userId: account.userId,
      username: account.username,
      name: account.name || undefined,
      passwordHash: account.passwordHash || undefined,
    };
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
        revalidateSeconds: this.getPaymentAwareCacheTtlSeconds(),
      });
    } catch (error) {
      const serviceError = normalizeGoogleSheetsError(error);

      return buildFallbackDashboardData({
        period,
        status: "error",
        message: serviceError.message,
        cachedAt,
        revalidateSeconds: this.getPaymentAwareCacheTtlSeconds(),
      });
    }
  }

  async getCashFlowData(period = getCurrentPeriod()): Promise<CashFlowData> {
    const cachedAt = new Date().toISOString();

    try {
      this.assertConfigured();
      assertValidPeriod(period);
      const ledgerPeriods = getCashFlowLedgerPeriods(period);
      const [transactions, feeIncomeByPeriod, operatingCostTransactions] =
        await Promise.all([
          this.readCashFlowTransactions(),
          this.readFeeIncomeByPeriod(ledgerPeriods),
          this.readFeeCalculatorOperatingCostTransactions(ledgerPeriods),
        ]);
      const realManualTransactions = transactions.filter(
        (transaction) => transaction.scenario === "real",
      );
      const draftManualTransactions = transactions.filter(
        (transaction) => transaction.scenario === "draft",
      );
      const realCashFlowTransactions = [
        ...realManualTransactions,
        ...operatingCostTransactions,
      ];
      const draftCashFlowTransactions = [
        ...draftManualTransactions,
        ...operatingCostTransactions,
      ];
      const expectedFeeIncome = feeIncomeByPeriod.get(period) ?? 0;

      return buildCashFlowData({
        period,
        transactions: realCashFlowTransactions,
        draftTransactions: draftCashFlowTransactions,
        feeIncomeByPeriod,
        status:
          realCashFlowTransactions.length === 0 &&
          draftCashFlowTransactions.length === 0 &&
          expectedFeeIncome === 0
            ? "empty"
            : "ready",
        message:
          realCashFlowTransactions.length === 0 &&
          draftCashFlowTransactions.length === 0 &&
          expectedFeeIncome === 0
            ? "Google Sheets conectado, sin movimientos ni cuotas calculadas."
            : "Cash Flow real y borrador obtenidos desde Google Sheets y calculador de cuota.",
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
      const lastColumn = toColumnName(playerDirectoryHeaders.length - 1);

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetPrefix}!A:${lastColumn}`,
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
    let headers = normalizeWritableHeaders(headerRow, playerDirectoryHeaders);
    headers = await this.ensureWritableHeaders(
      spreadsheetId,
      sheetPrefix,
      headers,
      playerDirectoryHeaders,
    );
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
    const sheetPrefix = getSheetPrefix(playersRange);
    let headers = normalizeWritableHeaders(headerRow, playerDirectoryHeaders);
    headers = await this.ensureWritableHeaders(
      spreadsheetId,
      sheetPrefix,
      headers,
      playerDirectoryHeaders,
    );
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
      const [data] = await this.buildFeeCalculatorDataForPeriods([period], cachedAt);

      return data;
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

  private async buildFeeCalculatorDataForPeriods(
    periods: string[],
    cachedAt = new Date().toISOString(),
  ) {
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
    const status = players.length === 0 && costs.length === 0 ? "empty" : "ready";
    const message =
      players.length === 0 && costs.length === 0
        ? "Google Sheets conectado, sin costos del calculador cargados."
        : "Calculador de cuota obtenido desde Google Sheets.";

    return periods.map((period) =>
      buildFeeCalculatorData({
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
        revalidateSeconds: this.config.cacheTtlSeconds,
      }),
    );
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
        range: `${sheetPrefix}!A:${toColumnName(feeCalculatorCostHeaders.length - 1)}`,
        valueInputOption: "RAW",
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
    const headers = appendMissingWritableHeaders(
      normalizeWritableHeaders(headerRow, feeCalculatorCostHeaders),
      feeCalculatorCostHeaders,
    );
    const normalizedHeaderRow = headerRow.map((header) =>
      normalizeHeader(String(header)),
    );

    if (headers.join("|") !== normalizedHeaderRow.join("|")) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: feeCalculatorSpreadsheetId,
        range: `${sheetPrefix}!A1:${toColumnName(headers.length - 1)}1`,
        valueInputOption: "RAW",
        requestBody: {
          values: [headers],
        },
      });
    }

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
        valueInputOption: "RAW",
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
        valueInputOption: "RAW",
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
      const lastColumn = toColumnName(feeCalculatorActualHeaders.length - 1);

      await sheets.spreadsheets.values.update({
        spreadsheetId: feeCalculatorSpreadsheetId,
        range: `${sheetPrefix}!A:${lastColumn}`,
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
    let headers = normalizeWritableHeaders(headerRow, feeCalculatorActualHeaders);
    headers = await this.ensureWritableHeaders(
      feeCalculatorSpreadsheetId,
      sheetPrefix,
      headers,
      feeCalculatorActualHeaders,
    );
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
    const targetPlayerKeys = buildPlayerLookupKeys(
      playerStatus.playerId,
      playerStatus.playerName,
    );
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
            const rowPlayerKeys = buildPlayerLookupKeys(rowPlayerId, rowPlayerName);

            return (
              rowPeriod === playerStatus.period &&
              lookupSetsIntersect(rowPlayerKeys, targetPlayerKeys)
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
      const spreadsheetId = this.getAppSpreadsheetId();
      const clubSpreadsheetId = this.getClubSpreadsheetId();

      return await unstable_cache(
        async () => this.buildCachedPlayerProfile(playerId, year),
        [
          "google-sheets-player-profile",
          spreadsheetId,
          clubSpreadsheetId,
          this.config.matchesSpreadsheetId ?? "",
          this.config.playersRange,
          this.config.feesRange,
          this.config.formResponsesRange,
          this.config.feeCalculatorCostsRange,
          this.config.feeCalculatorActualsRange,
          this.config.feeCalculatorPlayerStatusesRange,
          this.config.matchesRange,
          this.config.expensesRange,
          this.config.refundPolicyRange,
          "form-responses-cache",
          String(this.config.formResponsesCacheTtlSeconds),
          playerId,
          String(year),
        ],
        {
          revalidate: this.getPaymentAwareCacheTtlSeconds(),
          tags: [
            "google-sheets",
            "google-sheets:player-profile",
            "google-sheets:dashboard",
            "google-sheets:players",
            "google-sheets:fee-calculator",
          ],
        },
      )();
    } catch {
      return null;
    }
  }

  private async buildCachedPlayerProfile(playerId: string, year: number) {
    const { players, fees } = await this.readDashboardRecords();
    const lookupKeys = buildPlayerLookupKeys(playerId);
    const player =
      players.find((candidate) => playerMatchesLookup(candidate, lookupKeys)) ??
      buildPlayerFromFees(playerId, fees, lookupKeys);

    if (!player) {
      return null;
    }

    const feeCalculatorData = await this.readPlayerProfileFeeCalculatorData(year);
    const playerProfileLookupKeys = buildPlayerLookupKeys(player.id, player.name);
    const playerCalculations: FeePlayerCalculation[] = [];
    const matchSummaries = new Map<string, PlayerMonthMatchSummary>();
    const quotaDefinitions = new Map<
      string,
      { status: "defined" | "undefined"; reason: string }
    >();

    for (const periodData of feeCalculatorData) {
      quotaDefinitions.set(periodData.period, {
        status: periodData.summary.quotaStatus,
        reason: periodData.summary.quotaStatusReasons.join(" "),
      });

      const calculation = periodData.playerCalculations.find((candidate) =>
        feePlayerCalculationMatchesLookup(candidate, playerProfileLookupKeys),
      );

      if (!calculation) {
        continue;
      }

      const matchSummary = periodData.matchSummaries.find((candidate) =>
        feePlayerMatchSummaryMatchesLookup(candidate, playerProfileLookupKeys),
      );

      playerCalculations.push(calculation);
      matchSummaries.set(
        periodData.period,
        buildPlayerMonthMatchSummary(
          periodData.previousPeriod,
          calculation,
          matchSummary,
        ),
      );
    }

    return buildPlayerProfile(
      player,
      fees,
      year,
      playerCalculations,
      matchSummaries,
      quotaDefinitions,
    );
  }

  private async readPlayerProfileFeeCalculatorData(year: number) {
    try {
      return await this.buildFeeCalculatorDataForPeriods(buildYearPeriods(year));
    } catch {
      return [];
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

  async getFixtureMatchScheduleOverrides(): Promise<FixtureMatchScheduleOverride[]> {
    this.assertConfigured();

    const rows = await this.readOptionalValuesFromSpreadsheet(
      this.getAppSpreadsheetId(),
      this.config.fixtureOverridesRange,
    );

    return mapRowsToFixtureMatchScheduleOverrides(rows);
  }

  async updateFixtureMatchSchedule(input: UpdateFixtureMatchScheduleInput) {
    this.assertConfigured();

    const spreadsheetId = this.getAppSpreadsheetId();
    const sheetPrefix = getSheetPrefix(this.config.fixtureOverridesRange);
    const rows = await this.readOptionalValuesFromSpreadsheet(
      spreadsheetId,
      this.config.fixtureOverridesRange,
    );
    const [headerRow = [], ...dataRows] = rows;
    let headers = normalizeWritableHeaders(headerRow, fixtureOverrideHeaders);

    await this.ensureSheetForRange(this.config.fixtureOverridesRange, spreadsheetId);
    headers = await this.ensureWritableHeaders(
      spreadsheetId,
      sheetPrefix,
      headers,
      fixtureOverrideHeaders,
    );

    const override: FixtureMatchScheduleOverride = {
      dateTime: input.dateTime,
      goalScorers: input.goalScorers ?? [],
      localScore: input.localScore,
      localPenaltyScore: input.localPenaltyScore,
      matchId: input.matchId,
      updatedAt: new Date().toISOString(),
      updatedByName: input.updatedByName,
      updatedByUserId: input.updatedByUserId,
      visitorPenaltyScore: input.visitorPenaltyScore,
      visitorScore: input.visitorScore,
    };
    const row = buildFixtureOverrideWritableRow(headers, override);
    const matchIdIndex = findHeaderIndex(headers, ["match_id", "partido_id", "id"]);
    const targetRowIndex =
      matchIdIndex >= 0
        ? dataRows.findIndex(
            (candidate) => String(candidate[matchIdIndex] ?? "").trim() === input.matchId,
          )
        : -1;
    const sheets = this.createSheetsClient();

    if (targetRowIndex >= 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetPrefix}!A${targetRowIndex + 2}:${toColumnName(headers.length - 1)}${targetRowIndex + 2}`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [row],
        },
      });
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: this.config.fixtureOverridesRange,
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: {
          values: [row],
        },
      });
    }

    invalidateFixtureCache();
    invalidatePlayerOfMatchCache();
  }

  async getPlayerOfMatchData(
    voterUserId: string,
    voterPlayerId?: string,
  ): Promise<PlayerOfMatchData> {
    const cachedAt = new Date().toISOString();

    try {
      this.assertConfigured();

      const [
        sheetMatches,
        fixtureMatches,
        votes,
        accountProfiles,
        playerRows,
        overrides,
        fixtureOverrides,
      ] = await Promise.all([
        this.readPlayerOfMatchMatches(),
        getLeagueClubMatchesForYear().catch(() => []),
        this.readPlayerOfMatchVotes(),
        this.readAccountProfiles().catch(() => []),
        this.readCachedPlayerDirectoryRows().catch(() => []),
        this.readPlayerOfMatchOverrides(),
        this.getFixtureMatchScheduleOverrides(),
      ]);
      const adjustedFixtureMatches = applyFixtureMatchScheduleOverrides(
        fixtureMatches,
        fixtureOverrides,
      );
      const matches = applyPlayerOfMatchOverrides(
        mergePlayerOfMatchMatches(sheetMatches, adjustedFixtureMatches),
        overrides,
      );
      const players = mapRowsToPlayers(playerRows).filter(
        (player) => !isDroppedPlayer(player),
      );
      const currentProfile = accountProfiles.find(
        (profile) => profile.userId === voterUserId,
      );
      const currentPlayerLookupKeys = buildPlayerLookupKeys(
        voterPlayerId,
        voterUserId,
        currentProfile?.name,
        currentProfile?.username,
      );
      const currentPlayer = players.find((player) =>
        playerMatchesLookup(player, currentPlayerLookupKeys),
      );
      const voterLookupKeys = buildPlayerLookupKeys(
        voterUserId,
        voterPlayerId,
        currentProfile?.name,
        currentProfile?.username,
        currentPlayer?.id,
        currentPlayer?.name,
        currentPlayer?.email,
        currentPlayer?.phone,
      );
      const voterVotes = votes.filter((vote) =>
        isPlayerOfMatchVoteFromVoter(vote, voterLookupKeys),
      );

      return buildPlayerOfMatchData({
        accountProfiles,
        cachedAt,
        currentPlayerId: voterPlayerId,
        currentUserId: voterUserId,
        matches,
        players,
        revalidateSeconds: this.config.cacheTtlSeconds,
        status: matches.length === 0 ? "empty" : "ready",
        votes,
        voterVotes,
      });
    } catch (error) {
      const serviceError = normalizeGoogleSheetsError(error);

      return buildPlayerOfMatchData({
        accountProfiles: [],
        cachedAt,
        currentPlayerId: voterPlayerId,
        currentUserId: voterUserId,
        matches: [],
        message: serviceError.message,
        players: [],
        revalidateSeconds: this.config.cacheTtlSeconds,
        status: "error",
        votes: [],
        voterVotes: [],
      });
    }
  }

  async submitPlayerOfMatchVote(input: SubmitPlayerOfMatchVoteInput): Promise<void> {
    this.assertConfigured();

    const [sheetMatches, fixtureMatches, votes, overrides, fixtureOverrides] =
      await Promise.all([
        this.readPlayerOfMatchMatches(),
        getLeagueClubMatchesForYear().catch(() => []),
        this.readPlayerOfMatchVotes(),
        this.readPlayerOfMatchOverrides(),
        this.getFixtureMatchScheduleOverrides(),
      ]);
    const adjustedFixtureMatches = applyFixtureMatchScheduleOverrides(
      fixtureMatches,
      fixtureOverrides,
    );
    const matches = applyPlayerOfMatchOverrides(
      mergePlayerOfMatchMatches(sheetMatches, adjustedFixtureMatches),
      overrides,
    );
    const match = matches.find((candidate) => candidate.id === input.matchId);

    if (!match) {
      throw new DataServiceError(
        "No se encontro el partido para votar.",
        "CONFIGURATION_ERROR",
      );
    }

    if (!isPlayerOfMatchVotingOpen(match)) {
      throw new DataServiceError(
        "La votacion de este partido todavia no esta abierta o ya cerro.",
        "CONFIGURATION_ERROR",
      );
    }

    const voterLookupKeys = buildPlayerLookupKeys(
      input.voterUserId,
      input.voterPlayerId,
      input.voterName,
    );

    if (
      votes.some(
        (vote) =>
          vote.matchId === match.id &&
          isPlayerOfMatchVoteFromVoter(vote, voterLookupKeys),
      )
    ) {
      throw new DataServiceError(
        "Ya votaste a este partido con este usuario.",
        "CONFIGURATION_ERROR",
      );
    }

    const firstVotePlayerName = findMatchPlayerName(
      match.players,
      input.firstVotePlayerName,
    );
    const secondVotePlayerName = findMatchPlayerName(
      match.players,
      input.secondVotePlayerName,
    );

    if (!firstVotePlayerName || !secondVotePlayerName) {
      throw new DataServiceError(
        "Solo se puede votar a jugadores que participaron en ese partido.",
        "CONFIGURATION_ERROR",
      );
    }

    if (
      normalizeClubPlayerName(firstVotePlayerName) ===
      normalizeClubPlayerName(secondVotePlayerName)
    ) {
      throw new DataServiceError("Elegí dos jugadores distintos.", "CONFIGURATION_ERROR");
    }

    const firstVoteLookupKeys = buildPlayerLookupKeys(firstVotePlayerName);
    const secondVoteLookupKeys = buildPlayerLookupKeys(secondVotePlayerName);

    if (
      lookupSetsIntersect(voterLookupKeys, firstVoteLookupKeys) ||
      lookupSetsIntersect(voterLookupKeys, secondVoteLookupKeys)
    ) {
      throw new DataServiceError("No podés votarte a vos mismo.", "CONFIGURATION_ERROR");
    }

    const spreadsheetId = this.getAppSpreadsheetId();

    await this.ensureSheetForRange(this.config.playerOfMatchVotesRange, spreadsheetId);
    await this.appendRowsWithHeaders(
      this.config.playerOfMatchVotesRange,
      playerOfMatchVoteHeaders,
      buildPlayerOfMatchVoteWritableRow(playerOfMatchVoteHeaders, {
        id: createId("player-of-match-vote"),
        matchId: match.id,
        matchDate: match.date,
        rival: match.rival,
        voterUserId: input.voterUserId,
        voterPlayerId: input.voterPlayerId,
        voterName: input.voterName,
        firstVotePlayerName,
        secondVotePlayerName,
        createdAt: new Date().toISOString(),
      }),
      spreadsheetId,
    );
    invalidatePlayerOfMatchCache();
  }

  async updatePlayerOfMatchMatch(input: UpdatePlayerOfMatchMatchInput): Promise<void> {
    this.assertConfigured();

    const spreadsheetId = this.getAppSpreadsheetId();
    const [sheetMatches, fixtureMatches, overrides] = await Promise.all([
      this.readPlayerOfMatchMatches(),
      getLeagueClubMatchesForYear().catch(() => []),
      this.readPlayerOfMatchOverrides(),
    ]);
    const matches = applyPlayerOfMatchOverrides(
      mergePlayerOfMatchMatches(sheetMatches, fixtureMatches),
      overrides,
    );
    const match = matches.find((candidate) => candidate.id === input.matchId);

    if (!match) {
      throw new DataServiceError(
        "No se encontro el partido para editar.",
        "CONFIGURATION_ERROR",
      );
    }

    if (!isEditablePlayerOfMatchRecord(match) || input.sourceType !== "friendly") {
      throw new DataServiceError(
        "Solo se pueden editar partidos amistosos cargados desde el formulario.",
        "CONFIGURATION_ERROR",
      );
    }

    const normalizedPlayers = uniquePlayerNames(input.players);

    if (normalizedPlayers.length < 2) {
      throw new DataServiceError(
        "Cargá al menos dos jugadores para habilitar la votacion.",
        "CONFIGURATION_ERROR",
      );
    }

    const override: PlayerOfMatchOverrideRecord = {
      matchId: input.matchId,
      date: input.date,
      rival: input.rival.trim(),
      sourceType: input.sourceType,
      players: normalizedPlayers,
      updatedByUserId: input.updatedByUserId,
      updatedByName: input.updatedByName,
      updatedAt: new Date().toISOString(),
    };
    const sheets = this.createSheetsClient();
    const sheetPrefix = getSheetPrefix(this.config.playerOfMatchOverridesRange);
    const rows = await this.readOptionalValuesFromSpreadsheet(
      spreadsheetId,
      this.config.playerOfMatchOverridesRange,
    );

    await this.ensureSheetForRange(
      this.config.playerOfMatchOverridesRange,
      spreadsheetId,
    );

    if (rows.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetPrefix}!A:${toColumnName(playerOfMatchOverrideHeaders.length - 1)}`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [
            playerOfMatchOverrideHeaders,
            buildPlayerOfMatchOverrideWritableRow(playerOfMatchOverrideHeaders, override),
          ],
        },
      });
      invalidatePlayerOfMatchCache();
      return;
    }

    const [headerRow = [], ...dataRows] = rows;
    let headers = normalizeWritableHeaders(headerRow, playerOfMatchOverrideHeaders);
    headers = await this.ensureWritableHeaders(
      spreadsheetId,
      sheetPrefix,
      headers,
      playerOfMatchOverrideHeaders,
    );
    const matchIdIndex = findHeaderIndex(headers, ["partido_id", "match_id"]);
    const targetRowIndex =
      matchIdIndex >= 0
        ? dataRows.findIndex(
            (row) => String(row[matchIdIndex] ?? "").trim() === input.matchId,
          )
        : -1;

    if (targetRowIndex >= 0) {
      const spreadsheetRow = targetRowIndex + 2;

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetPrefix}!A${spreadsheetRow}:${toColumnName(headers.length - 1)}${spreadsheetRow}`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [buildPlayerOfMatchOverrideWritableRow(headers, override)],
        },
      });
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${sheetPrefix}!A:${toColumnName(headers.length - 1)}`,
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: {
          values: [buildPlayerOfMatchOverrideWritableRow(headers, override)],
        },
      });
    }

    invalidatePlayerOfMatchCache();
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

  async getNotifications() {
    this.assertConfigured();

    const rows = await this.readValuesFromSpreadsheet(
      this.getAppSpreadsheetId(),
      this.config.notificationsRange,
    ).catch(() => []);

    return mapRowsToNotifications(rows);
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

    const spreadsheetId = this.getAppSpreadsheetId();
    const sheetPrefix = getSheetPrefix(this.config.notificationsRange);
    await this.ensureSheetForRange(this.config.notificationsRange, spreadsheetId);

    const values = await this.readValuesFromSpreadsheet(
      spreadsheetId,
      this.config.notificationsRange,
    );
    const isEmptySheet = values.length === 0;
    const [headerRow = []] = values;
    let headers = normalizeWritableHeaders(headerRow, notificationHeaders);
    const sheets = this.createSheetsClient();

    if (isEmptySheet) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetPrefix}!A1:${toColumnName(headers.length - 1)}1`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [headers],
        },
      });
    }

    headers = isEmptySheet
      ? headers
      : await this.ensureWritableHeaders(
          spreadsheetId,
          sheetPrefix,
          headers,
          notificationHeaders,
        );

    const row = buildNotificationWritableRow(headers, {
      id: createId("notification"),
      createdAt: new Date().toISOString(),
      input,
    });

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: this.config.notificationsRange,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [row],
      },
    });
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

  async getReminderJobs(): Promise<ReminderJob[]> {
    this.assertConfigured();

    const rows = await this.readValuesFromSpreadsheet(
      this.getAppSpreadsheetId(),
      this.config.remindersRange,
    ).catch(() => []);

    return mapRowsToReminderJobs(rows);
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

  async updateReminderJobStatus(input: UpdateReminderJobStatusInput): Promise<void> {
    this.assertConfigured();

    const spreadsheetId = this.getAppSpreadsheetId();
    const sheetPrefix = getSheetPrefix(this.config.remindersRange);
    const values = await this.readValuesFromSpreadsheet(
      spreadsheetId,
      this.config.remindersRange,
    ).catch(() => []);
    const [headerRow = [], ...dataRows] = values;
    const headers = headerRow.map((header) => normalizeHeader(String(header)));
    const idIndex = findHeaderIndex(headers, ["id", "reminder_id"]);
    const statusIndex = findHeaderIndex(headers, ["status", "estado_recordatorio"]);
    const sentAtIndex = findHeaderIndex(headers, ["sent_at", "enviado_el"]);
    const errorIndex = findHeaderIndex(headers, ["error", "motivo_error"]);

    if (idIndex < 0 || statusIndex < 0) {
      throw new DataServiceError(
        "La hoja Recordatorios no tiene columnas id/status.",
        "CONFIGURATION_ERROR",
      );
    }

    const targetRowIndex = dataRows.findIndex(
      (row) => String(row[idIndex] ?? "").trim() === input.reminderId,
    );

    if (targetRowIndex < 0) {
      throw new DataServiceError(
        "No se encontro el recordatorio a actualizar.",
        "CONFIGURATION_ERROR",
      );
    }

    const spreadsheetRow = targetRowIndex + 2;
    const now = new Date().toISOString();
    const data: Array<{ range: string; values: string[][] }> = [
      {
        range: `${sheetPrefix}!${toColumnName(statusIndex)}${spreadsheetRow}`,
        values: [[input.status]],
      },
    ];

    if (sentAtIndex >= 0 && input.status === "sent") {
      data.push({
        range: `${sheetPrefix}!${toColumnName(sentAtIndex)}${spreadsheetRow}`,
        values: [[input.sentAt ?? now]],
      });
    }

    if (errorIndex >= 0 && typeof input.error === "string") {
      data.push({
        range: `${sheetPrefix}!${toColumnName(errorIndex)}${spreadsheetRow}`,
        values: [[input.error]],
      });
    }

    await this.createSheetsClient().spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data,
      },
    });
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

  async upsertPushSubscription(input: PushSubscriptionInput): Promise<void> {
    this.assertConfigured();

    const spreadsheetId = this.getAppSpreadsheetId();
    const range = this.config.pushSubscriptionsRange;
    const sheetPrefix = getSheetPrefix(range);
    const rows = await this.readOptionalValuesFromSpreadsheet(spreadsheetId, range);
    const sheets = this.createSheetsClient();
    const now = new Date().toISOString();

    await this.ensureSheetForRange(range, spreadsheetId);

    if (rows.length === 0) {
      const subscription = buildPushSubscriptionRecord(input, now);

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetPrefix}!A1:${toColumnName(pushSubscriptionHeaders.length - 1)}2`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [
            pushSubscriptionHeaders,
            buildPushSubscriptionWritableRow(pushSubscriptionHeaders, subscription),
          ],
        },
      });
      invalidatePushSubscriptionCache();
      return;
    }

    const [headerRow = [], ...dataRows] = rows;
    let headers = normalizeWritableHeaders(headerRow, pushSubscriptionHeaders);
    headers = await this.ensureWritableHeaders(
      spreadsheetId,
      sheetPrefix,
      headers,
      pushSubscriptionHeaders,
    );
    const endpointIndex = findHeaderIndex(headers, ["endpoint"]);
    const targetRowIndex =
      endpointIndex >= 0
        ? dataRows.findIndex(
            (row) => String(row[endpointIndex] ?? "").trim() === input.endpoint,
          )
        : -1;

    if (targetRowIndex >= 0) {
      const existing = mapRowsToPushSubscriptions([headers, dataRows[targetRowIndex]])[0];
      const subscription = buildPushSubscriptionRecord(
        input,
        existing?.createdAt ?? now,
        existing?.id,
        now,
      );
      const spreadsheetRow = targetRowIndex + 2;

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetPrefix}!A${spreadsheetRow}:${toColumnName(headers.length - 1)}${spreadsheetRow}`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [buildPushSubscriptionWritableRow(headers, subscription)],
        },
      });
      invalidatePushSubscriptionCache();
      return;
    }

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [
          buildPushSubscriptionWritableRow(
            headers,
            buildPushSubscriptionRecord(input, now),
          ),
        ],
      },
    });
    invalidatePushSubscriptionCache();
  }

  async deletePushSubscription(endpoint: string, userId?: string): Promise<void> {
    this.assertConfigured();

    const spreadsheetId = this.getAppSpreadsheetId();
    const range = this.config.pushSubscriptionsRange;
    const rows = await this.readOptionalValuesFromSpreadsheet(spreadsheetId, range);

    if (rows.length === 0) {
      return;
    }

    const [headerRow = [], ...dataRows] = rows;
    const headers = normalizeWritableHeaders(headerRow, pushSubscriptionHeaders);
    const endpointIndex = findHeaderIndex(headers, ["endpoint"]);
    const userIdIndex = findHeaderIndex(headers, ["user_id", "usuario_id"]);
    const activeIndex = findHeaderIndex(headers, ["activo", "active"]);
    const updatedAtIndex = findHeaderIndex(headers, [
      "actualizado_en",
      "updated_at",
      "updated",
    ]);

    if (endpointIndex < 0 || activeIndex < 0) {
      return;
    }

    const targetRowIndex = dataRows.findIndex((row) => {
      const endpointMatches = String(row[endpointIndex] ?? "").trim() === endpoint;
      const userMatches =
        !userId || userIdIndex < 0 || String(row[userIdIndex] ?? "").trim() === userId;

      return endpointMatches && userMatches;
    });

    if (targetRowIndex < 0) {
      return;
    }

    const spreadsheetRow = targetRowIndex + 2;
    const data = [
      {
        range: `${getSheetPrefix(range)}!${toColumnName(activeIndex)}${spreadsheetRow}`,
        values: [["false"]],
      },
    ];

    if (updatedAtIndex >= 0) {
      data.push({
        range: `${getSheetPrefix(range)}!${toColumnName(updatedAtIndex)}${spreadsheetRow}`,
        values: [[new Date().toISOString()]],
      });
    }

    await this.createSheetsClient().spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data,
      },
    });
    invalidatePushSubscriptionCache();
  }

  async getPushSubscriptionsForUser(userId: string): Promise<PushSubscriptionRecord[]> {
    this.assertConfigured();

    return this.readPushSubscriptions().then((subscriptions) =>
      subscriptions.filter(
        (subscription) => subscription.active && subscription.userId === userId,
      ),
    );
  }

  async getPushSubscriptions(): Promise<PushSubscriptionRecord[]> {
    this.assertConfigured();

    return this.readPushSubscriptions().then((subscriptions) =>
      subscriptions.filter((subscription) => subscription.active),
    );
  }

  async getPushSubscriptionsForPlayer(
    playerId: string,
  ): Promise<PushSubscriptionRecord[]> {
    this.assertConfigured();

    return this.readPushSubscriptions().then((subscriptions) =>
      subscriptions.filter(
        (subscription) => subscription.active && subscription.playerId === playerId,
      ),
    );
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
    const revalidateSeconds = this.getPaymentAwareCacheTtlSeconds();

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
        "form-responses-cache",
        String(this.config.formResponsesCacheTtlSeconds),
      ],
      {
        revalidate: revalidateSeconds,
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
      async () => this.readOptionalValues(this.config.cashFlowRange),
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

  private async readCachedAccountProfileRows() {
    const spreadsheetId = this.getAppSpreadsheetId();

    return unstable_cache(
      async () =>
        this.readOptionalValuesFromSpreadsheet(
          spreadsheetId,
          this.config.accountProfilesRange,
        ),
      ["google-sheets-accounts", spreadsheetId, this.config.accountProfilesRange],
      {
        revalidate: this.config.cacheTtlSeconds,
        tags: ["google-sheets", "google-sheets:accounts"],
      },
    )();
  }

  private async readAccountProfiles() {
    return mapRowsToAccountProfiles(await this.readCachedAccountProfileRows());
  }

  private async findAccountProfile(userId: string, username: string) {
    const profiles = await this.readAccountProfiles();

    return profiles.find(
      (profile) => profile.userId === userId || profile.username === username,
    );
  }

  private async findPlayerRecordForUser(user: AuthUser) {
    const lookupKeys = buildPlayerLookupKeys(user.playerId, user.id, user.name);
    const players = mapRowsToPlayers(await this.readCachedPlayerDirectoryRows());

    return players.find((player) => playerMatchesLookup(player, lookupKeys)) ?? null;
  }

  private async findPlayerDirectoryItemForUser(user: AuthUser) {
    const lookupKeys = buildPlayerLookupKeys(user.playerId, user.id, user.name);
    const players = mapRowsToPlayerDirectoryItems(
      await this.readCachedPlayerDirectoryRows(),
    );

    return (
      players.find((player) =>
        lookupSetsIntersect(
          buildPlayerLookupKeys(player.id, player.name, player.email, player.phone),
          lookupKeys,
        ),
      ) ?? null
    );
  }

  private async upsertAccountProfile(profile: AccountProfileRecord) {
    const spreadsheetId = this.getAppSpreadsheetId();
    const range = this.config.accountProfilesRange;
    const sheetPrefix = getSheetPrefix(range);
    const rows = await this.readOptionalValuesFromSpreadsheet(spreadsheetId, range);
    const sheets = this.createSheetsClient();

    await this.ensureSheetForRange(range, spreadsheetId);

    if (rows.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetPrefix}!A1:${toColumnName(accountProfileHeaders.length - 1)}2`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [
            accountProfileHeaders,
            buildAccountProfileWritableRow(accountProfileHeaders, profile),
          ],
        },
      });
      return;
    }

    const [headerRow = [], ...dataRows] = rows;
    let headers = normalizeWritableHeaders(headerRow, accountProfileHeaders);
    headers = await this.ensureWritableHeaders(
      spreadsheetId,
      sheetPrefix,
      headers,
      accountProfileHeaders,
    );
    const userIdIndex = findHeaderIndex(headers, ["user_id", "usuario_id"]);
    const usernameIndex = findHeaderIndex(headers, ["username", "usuario"]);
    const targetRowIndex = dataRows.findIndex((row) => {
      const rowUserId = userIdIndex >= 0 ? String(row[userIdIndex] ?? "").trim() : "";
      const rowUsername =
        usernameIndex >= 0 ? String(row[usernameIndex] ?? "").trim() : "";

      return rowUserId === profile.userId || rowUsername === profile.username;
    });

    if (targetRowIndex >= 0) {
      const spreadsheetRow = targetRowIndex + 2;

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetPrefix}!A${spreadsheetRow}:${toColumnName(headers.length - 1)}${spreadsheetRow}`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [buildAccountProfileWritableRow(headers, profile)],
        },
      });
      return;
    }

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [buildAccountProfileWritableRow(headers, profile)],
      },
    });
  }

  private async upsertPlayerAttendanceSnapshot(snapshot: PlayerAttendanceSnapshotRecord) {
    const spreadsheetId = this.getAppSpreadsheetId();
    const range = this.config.playerAttendanceSnapshotsRange;
    const sheetPrefix = getSheetPrefix(range);
    const rows = await this.readOptionalValuesFromSpreadsheet(spreadsheetId, range);
    const sheets = this.createSheetsClient();

    await this.ensureSheetForRange(range, spreadsheetId);

    if (rows.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetPrefix}!A:${toColumnName(playerAttendanceSnapshotHeaders.length - 1)}`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [
            playerAttendanceSnapshotHeaders,
            buildPlayerAttendanceSnapshotWritableRow(
              playerAttendanceSnapshotHeaders,
              snapshot,
            ),
          ],
        },
      });
      invalidateAccountCache();
      return;
    }

    const [headerRow = [], ...dataRows] = rows;
    let headers = normalizeWritableHeaders(headerRow, playerAttendanceSnapshotHeaders);
    headers = await this.ensureWritableHeaders(
      spreadsheetId,
      sheetPrefix,
      headers,
      playerAttendanceSnapshotHeaders,
    );
    const snapshots = mapRowsToPlayerAttendanceSnapshots([headers, ...dataRows]);
    const targetRowIndex = snapshots.findIndex(
      (item) =>
        item.playerId === snapshot.playerId && item.seasonYear === snapshot.seasonYear,
    );
    const existing = targetRowIndex >= 0 ? snapshots[targetRowIndex] : undefined;

    if (existing && hasSamePlayerAttendanceSnapshot(existing, snapshot)) {
      return;
    }

    if (targetRowIndex >= 0) {
      const spreadsheetRow = targetRowIndex + 2;

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetPrefix}!A${spreadsheetRow}:${toColumnName(headers.length - 1)}${spreadsheetRow}`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [buildPlayerAttendanceSnapshotWritableRow(headers, snapshot)],
        },
      });
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: {
          values: [buildPlayerAttendanceSnapshotWritableRow(headers, snapshot)],
        },
      });
    }

    invalidateAccountCache();
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

  private async readPushSubscriptions(): Promise<PushSubscriptionRecord[]> {
    const spreadsheetId = this.getAppSpreadsheetId();
    const rows = await this.readOptionalValuesFromSpreadsheet(
      spreadsheetId,
      this.config.pushSubscriptionsRange,
    );

    return mapRowsToPushSubscriptions(rows);
  }

  private async readPlayerOfMatchMatches(): Promise<MatchRecord[]> {
    const spreadsheetId = this.config.matchesSpreadsheetId;

    if (!spreadsheetId) {
      return [];
    }

    return unstable_cache(
      async () =>
        mapRowsToMatches(
          await this.readOptionalValuesFromSpreadsheet(
            spreadsheetId,
            this.config.matchesRange,
          ),
        ),
      ["google-sheets-player-of-match-matches", spreadsheetId, this.config.matchesRange],
      {
        revalidate: this.config.cacheTtlSeconds,
        tags: ["google-sheets", "google-sheets:player-of-match"],
      },
    )();
  }

  private async readPlayerOfMatchVotes(): Promise<PlayerOfMatchVote[]> {
    const spreadsheetId = this.getAppSpreadsheetId();

    return unstable_cache(
      async () =>
        mapRowsToPlayerOfMatchVotes(
          await this.readOptionalValuesFromSpreadsheet(
            spreadsheetId,
            this.config.playerOfMatchVotesRange,
          ),
        ),
      [
        "google-sheets-player-of-match-votes",
        spreadsheetId,
        this.config.playerOfMatchVotesRange,
      ],
      {
        revalidate: this.config.cacheTtlSeconds,
        tags: ["google-sheets", "google-sheets:player-of-match"],
      },
    )();
  }

  private async readPlayerOfMatchOverrides(): Promise<PlayerOfMatchOverrideRecord[]> {
    const spreadsheetId = this.getAppSpreadsheetId();

    return unstable_cache(
      async () =>
        mapRowsToPlayerOfMatchOverrides(
          await this.readOptionalValuesFromSpreadsheet(
            spreadsheetId,
            this.config.playerOfMatchOverridesRange,
          ),
        ),
      [
        "google-sheets-player-of-match-overrides",
        spreadsheetId,
        this.config.playerOfMatchOverridesRange,
      ],
      {
        revalidate: this.config.cacheTtlSeconds,
        tags: ["google-sheets", "google-sheets:player-of-match"],
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
        "google-sheets-fee-calculator-rows",
        spreadsheetId,
        feeCalculatorSpreadsheetId,
        clubSpreadsheetId,
        matchesSpreadsheetId ?? "",
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
      dateTimeRenderOption: "FORMATTED_STRING",
      valueRenderOption: "FORMATTED_VALUE",
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
  }

  private async readCashFlowTransactions(): Promise<CashFlowTransactionRecord[]> {
    const rows = await this.readCachedCashFlowRows();

    return mapRowsToCashFlowTransactions(rows);
  }

  private async readFeeIncomeByPeriod(periods: string[]) {
    const uniquePeriods = Array.from(new Set(periods));
    const playerDirectory = await this.getPlayersData().catch(() => null);
    const activePlayersFromDirectory =
      playerDirectory?.players.filter((player) => player.status === "active").length ?? 0;
    const entries = await Promise.all(
      uniquePeriods.map(async (period) => {
        const data = await this.getFeeCalculatorData(period);
        const total = calculateExpectedFeeIncomeForCashFlow(
          data,
          activePlayersFromDirectory,
        );

        return [period, total] as const;
      }),
    );

    return new Map(entries);
  }

  private async readFeeCalculatorOperatingCostTransactions(periods: string[]) {
    const targetPeriods = new Set(periods);
    const sourcePeriods = Array.from(
      new Set([...periods, ...periods.map(getPreviousPeriod)]),
    ).sort();
    const { costsRows, actualsRows, matchRows } = await this.readFeeCalculatorRows();
    const costs = mapRowsToFeeCalculatorCosts(costsRows);
    const actuals = mapRowsToFeeCalculatorActuals(actualsRows);
    const matches = mapRowsToMatches(matchRows);
    const effectiveActuals = sourcePeriods.reduce(
      (mergedActuals, sourcePeriod) =>
        mergeInferredFeeCalculatorActuals(costs, mergedActuals, matches, sourcePeriod),
      actuals,
    );

    return buildFeeCalculatorOperatingCostCashFlowTransactions({
      costs,
      actuals: effectiveActuals,
      sourcePeriods,
      targetPeriods,
    });
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
        "No se encontro el jugador en el ABM Jugadores.",
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
      dni: pick(record, ["dni", "documento", "document_number", "numero_documento"]),
      birthDate:
        parseDate(
          pick(record, [
            "fecha_nacimiento",
            "nacimiento",
            "birth_date",
            "date_of_birth",
            "cumpleanos",
          ]),
        ) ?? "",
      position: pick(record, ["posicion", "position", "puesto"]),
      secondPosition: pick(record, [
        "segunda_posicion",
        "posicion_secundaria",
        "second_position",
        "secondary_position",
        "segundo_puesto",
      ]),
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
        dni: pick(record, ["dni", "documento", "document_number", "numero_documento"]),
        birthDate:
          parseDate(
            pick(record, [
              "fecha_nacimiento",
              "nacimiento",
              "birth_date",
              "date_of_birth",
              "cumpleanos",
            ]),
          ) ?? "",
        position: pick(record, ["posicion", "position", "puesto"]),
        secondPosition: pick(record, [
          "segunda_posicion",
          "posicion_secundaria",
          "second_position",
          "secondary_position",
          "segundo_puesto",
        ]),
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

function mapRowsToAccountProfiles(rows: unknown[][]): AccountProfileRecord[] {
  return rowsToRecords(rows)
    .map((record) => {
      const userId = pick(record, ["user_id", "usuario_id"]);
      const username = pick(record, ["username", "usuario"]);

      if (!userId || !username) {
        return null;
      }

      return {
        userId,
        username,
        role: normalizeRoleValue(pick(record, ["rol", "role"])),
        name: pick(record, ["nombre", "name"]),
        email: pick(record, ["email", "correo", "mail"]),
        phone: pick(record, ["telefono", "phone", "whatsapp", "celular"]),
        profilePhotoDataUrl: pick(record, [
          "foto_perfil",
          "profile_photo",
          "profile_photo_data_url",
        ]),
        passwordHash: pick(record, ["password_hash", "hash_password"]),
        passwordUpdatedAt:
          parseDateTime(
            pick(record, ["password_actualizado_en", "password_updated_at"]),
          ) ?? "",
        updatedAt: parseDateTime(pick(record, ["actualizado_en", "updated_at"])) ?? "",
      } satisfies AccountProfileRecord;
    })
    .filter((profile): profile is AccountProfileRecord => Boolean(profile));
}

function mapRowsToPlayerAttendanceSnapshots(
  rows: unknown[][],
): PlayerAttendanceSnapshotRecord[] {
  return rowsToRecords(rows)
    .map((record) => {
      const playerId = pick(record, ["jugador_id", "player_id", "id_jugador"]);
      const seasonYear = Number(pick(record, ["temporada", "season_year", "year"]));

      if (!playerId || !Number.isFinite(seasonYear)) {
        return null;
      }

      return {
        id: pick(record, ["id", "snapshot_id"]) || `attendance-${seasonYear}-${playerId}`,
        playerId,
        playerName: pick(record, ["jugador", "player", "nombre"]),
        seasonYear,
        seasonStartDate:
          parseDate(pick(record, ["fecha_inicio", "season_start_date"])) ||
          PLAYER_PROFILE_SEASON_START_DATE,
        totalMatches: parseNumericValue(
          pick(record, ["partidos_totales", "total_matches", "matches"]),
        ),
        attendedMatches: parseNumericValue(
          pick(record, ["partidos_asistidos", "attended_matches", "presentes"]),
        ),
        attendanceRate:
          Number(
            String(
              pick(record, ["porcentaje_asistencia", "attendance_rate", "attendance"]),
            ).replace(",", "."),
          ) || 0,
        bestStreak: parseNumericValue(
          pick(record, ["mejor_racha", "best_streak", "racha_historica", "record_racha"]),
        ),
        currentStreak: parseNumericValue(
          pick(record, ["racha_actual", "current_streak", "streak"]),
        ),
        lastAttendanceDate:
          parseDate(pick(record, ["ultima_asistencia_fecha", "last_attendance_date"])) ||
          "",
        lastAttendanceRival: pick(record, [
          "ultima_asistencia_rival",
          "last_attendance_rival",
        ]),
        calculatedAt:
          parseDateTime(pick(record, ["calculado_en", "calculated_at"])) ?? "",
        updatedAt: parseDateTime(pick(record, ["actualizado_en", "updated_at"])) ?? "",
      } satisfies PlayerAttendanceSnapshotRecord;
    })
    .filter((snapshot): snapshot is PlayerAttendanceSnapshotRecord => Boolean(snapshot));
}

function buildAccountProfile(
  user: AuthUser,
  account?: AccountProfileRecord,
  player?: PlayerRecord | null,
  attendance?: PlayerAttendanceSummary,
  mvpWins = 0,
): AccountProfile {
  return {
    userId: user.id,
    username: user.username,
    role: user.role,
    name: account?.name || player?.name || user.name,
    email: account?.email ?? "",
    phone: account?.phone || player?.phone || "",
    profilePhotoDataUrl: account?.profilePhotoDataUrl ?? "",
    player: player
      ? {
          id: player.id,
          name: player.name,
          birthDate: player.birthDate,
          category: player.category,
          dni: player.dni,
          position: player.position,
          secondPosition: player.secondPosition,
          status: player.status,
          mvpWins,
          attendance: attendance ?? createEmptyPlayerAttendanceSummary(),
        }
      : undefined,
    updatedAt: account?.updatedAt ?? "",
    passwordUpdatedAt: account?.passwordUpdatedAt ?? "",
  };
}

function buildAccountProfileFromInput(
  input: UpdateAccountProfileInput,
  existing?: AccountProfileRecord,
): AccountProfileRecord {
  return {
    userId: input.userId,
    username: input.username,
    role: input.role,
    name: input.name.trim(),
    email: input.email?.trim() ?? "",
    phone: input.phone?.trim() ?? "",
    profilePhotoDataUrl: input.profilePhotoDataUrl?.trim() ?? "",
    passwordHash: existing?.passwordHash ?? "",
    passwordUpdatedAt: existing?.passwordUpdatedAt ?? "",
    updatedAt: new Date().toISOString(),
  };
}

function buildPlayerAttendanceSummary(
  player: PlayerRecord,
  matches: MatchRecord[],
): PlayerAttendanceSummary {
  const seasonStartDate = PLAYER_PROFILE_SEASON_START_DATE;
  const seasonYear = Number(seasonStartDate.slice(0, 4));
  const today = getArgentinaTodayIsoDate();
  const normalizedPlayerName = normalizeClubPlayerName(player.name);
  const seasonMatches = matches.filter(
    (match) => match.date >= seasonStartDate && match.date <= today,
  );
  const attendanceMatches = seasonMatches.filter((match) => match.players.length > 0);
  const hasAttendance = (match: MatchRecord) =>
    match.players.some((name) => normalizeClubPlayerName(name) === normalizedPlayerName);
  const attendedMatches = attendanceMatches.filter(hasAttendance);
  const currentStreak = [...attendanceMatches]
    .sort((left, right) => right.date.localeCompare(left.date))
    .reduce(
      (streak, match) => {
        if (streak.done) {
          return streak;
        }

        const attended = hasAttendance(match);

        return attended
          ? { count: streak.count + 1, done: false }
          : { ...streak, done: true };
      },
      { count: 0, done: false },
    ).count;
  const bestStreak = [...attendanceMatches]
    .sort((left, right) => left.date.localeCompare(right.date))
    .reduce(
      (streak, match) => {
        if (!hasAttendance(match)) {
          return { best: streak.best, current: 0 };
        }

        const current = streak.current + 1;

        return {
          best: Math.max(streak.best, current),
          current,
        };
      },
      { best: 0, current: 0 },
    ).best;
  const lastAttendance = [...attendedMatches].sort((left, right) =>
    right.date.localeCompare(left.date),
  )[0];

  return {
    attendedMatches: attendedMatches.length,
    attendanceRate:
      attendanceMatches.length > 0
        ? attendedMatches.length / attendanceMatches.length
        : 0,
    bestStreak,
    calculatedAt: new Date().toISOString(),
    currentStreak,
    lastAttendanceDate: lastAttendance?.date ?? "",
    lastAttendanceRival: lastAttendance?.rival ?? "",
    seasonStartDate,
    seasonYear,
    totalMatches: attendanceMatches.length,
  };
}

function createEmptyPlayerAttendanceSummary(): PlayerAttendanceSummary {
  return {
    attendedMatches: 0,
    attendanceRate: 0,
    bestStreak: 0,
    calculatedAt: new Date().toISOString(),
    currentStreak: 0,
    lastAttendanceDate: "",
    lastAttendanceRival: "",
    seasonStartDate: PLAYER_PROFILE_SEASON_START_DATE,
    seasonYear: Number(PLAYER_PROFILE_SEASON_START_DATE.slice(0, 4)),
    totalMatches: 0,
  };
}

function countPlayerOfMatchWins(player: PlayerRecord, matches: PlayerOfMatchMatch[]) {
  const playerKey = normalizeClubPlayerName(player.name);

  return matches.filter((match) => {
    const winner = match.results.find((result) => result.rank === 1);

    return (
      match.votingStatus === "closed" &&
      winner &&
      normalizeClubPlayerName(winner.playerName) === playerKey
    );
  }).length;
}

function buildPlayerAttendanceSnapshotWritableRow(
  headers: string[],
  snapshot: PlayerAttendanceSnapshotRecord,
) {
  const values: Record<string, string> = {
    id: snapshot.id,
    jugador_id: snapshot.playerId,
    player_id: snapshot.playerId,
    id_jugador: snapshot.playerId,
    jugador: snapshot.playerName,
    player: snapshot.playerName,
    nombre: snapshot.playerName,
    temporada: String(snapshot.seasonYear),
    season_year: String(snapshot.seasonYear),
    year: String(snapshot.seasonYear),
    fecha_inicio: snapshot.seasonStartDate,
    season_start_date: snapshot.seasonStartDate,
    partidos_totales: String(snapshot.totalMatches),
    total_matches: String(snapshot.totalMatches),
    matches: String(snapshot.totalMatches),
    partidos_asistidos: String(snapshot.attendedMatches),
    attended_matches: String(snapshot.attendedMatches),
    presentes: String(snapshot.attendedMatches),
    porcentaje_asistencia: String(snapshot.attendanceRate),
    attendance_rate: String(snapshot.attendanceRate),
    attendance: String(snapshot.attendanceRate),
    mejor_racha: String(snapshot.bestStreak),
    best_streak: String(snapshot.bestStreak),
    racha_historica: String(snapshot.bestStreak),
    record_racha: String(snapshot.bestStreak),
    racha_actual: String(snapshot.currentStreak),
    current_streak: String(snapshot.currentStreak),
    streak: String(snapshot.currentStreak),
    ultima_asistencia_fecha: snapshot.lastAttendanceDate,
    last_attendance_date: snapshot.lastAttendanceDate,
    ultima_asistencia_rival: snapshot.lastAttendanceRival,
    last_attendance_rival: snapshot.lastAttendanceRival,
    calculado_en: snapshot.calculatedAt,
    calculated_at: snapshot.calculatedAt,
    actualizado_en: snapshot.updatedAt,
    updated_at: snapshot.updatedAt,
  };

  return headers.map((header) => values[normalizeHeader(header)] ?? "");
}

function hasSamePlayerAttendanceSnapshot(
  left: PlayerAttendanceSnapshotRecord,
  right: PlayerAttendanceSnapshotRecord,
) {
  return (
    left.attendedMatches === right.attendedMatches &&
    left.attendanceRate === right.attendanceRate &&
    left.bestStreak === right.bestStreak &&
    left.currentStreak === right.currentStreak &&
    left.lastAttendanceDate === right.lastAttendanceDate &&
    left.lastAttendanceRival === right.lastAttendanceRival &&
    left.seasonStartDate === right.seasonStartDate &&
    left.seasonYear === right.seasonYear &&
    left.totalMatches === right.totalMatches
  );
}

function buildAccountProfileWritableRow(
  headers: string[],
  profile: AccountProfileRecord,
) {
  const values: Record<string, string> = {
    actualizado_en: profile.updatedAt,
    email: profile.email,
    foto_perfil: profile.profilePhotoDataUrl,
    nombre: profile.name,
    password_actualizado_en: profile.passwordUpdatedAt,
    password_hash: profile.passwordHash,
    phone: profile.phone,
    profile_photo: profile.profilePhotoDataUrl,
    profile_photo_data_url: profile.profilePhotoDataUrl,
    rol: profile.role,
    role: profile.role,
    telefono: profile.phone,
    updated_at: profile.updatedAt,
    user_id: profile.userId,
    username: profile.username,
    usuario: profile.username,
    usuario_id: profile.userId,
  };

  return headers.map((header) => values[normalizeHeader(header)] ?? "");
}

function normalizeRoleValue(value: string): AuthUser["role"] {
  return value === "admin" ||
    value === "treasurer" ||
    value === "coach" ||
    value === "player"
    ? value
    : "player";
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
    dni: input.dni?.trim() ?? existing?.dni ?? "",
    birthDate: input.birthDate
      ? (parseDate(input.birthDate) ?? existing?.birthDate ?? "")
      : (existing?.birthDate ?? ""),
    position: input.position?.trim() ?? existing?.position ?? "",
    secondPosition: input.secondPosition?.trim() ?? existing?.secondPosition ?? "",
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
    dni: player.dni,
    documento: player.dni,
    document_number: player.dni,
    numero_documento: player.dni,
    fecha_nacimiento: player.birthDate,
    nacimiento: player.birthDate,
    birth_date: player.birthDate,
    date_of_birth: player.birthDate,
    cumpleanos: player.birthDate,
    posicion: player.position,
    position: player.position,
    puesto: player.position,
    segunda_posicion: player.secondPosition,
    posicion_secundaria: player.secondPosition,
    second_position: player.secondPosition,
    secondary_position: player.secondPosition,
    segundo_puesto: player.secondPosition,
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

  return headers.map((header) => values[normalizeHeader(header)] ?? "");
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
      const scenario = normalizeCashFlowScenario(
        pick(record, ["escenario", "scenario", "tipo_escenario"]),
      );

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
        scenario,
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
      assignedPlayerIds: parseAssignedPlayerIds(
        pick(record, [
          "jugadores_asignados",
          "assigned_player_ids",
          "jugadores_del_costo",
          "aplica_a",
        ]),
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
      const actualAmountValue = pick(record, [
        "monto_real",
        "importe_real",
        "actual_amount",
        "total_real",
        "monto_pagado",
      ]);

      if (!costId) {
        return null;
      }

      const actual: FeeCalculatorActual = {
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
      };

      if (actualAmountValue) {
        actual.actualAmount = Math.max(parseMoney(actualAmountValue), 0);
      }

      return actual;
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
  const seenIds = new Set<string>();

  return rowsToRecords(rows)
    .map<MatchRecord | null>((record) => {
      const date = parseClubDateTime(
        pick(record, [
          "fecha",
          "fecha_partido",
          "fecha_del_partido",
          "fecha_y_hora",
          "fecha_hora",
          "date",
          "dia",
          "dia_partido",
          "dia_del_partido",
        ]),
      );
      const loadedAt =
        parseClubDateTime(
          pick(record, [
            "marca_temporal",
            "timestamp",
            "created_at",
            "creado_en",
            "fecha_carga",
          ]),
        ) ?? date;
      const rival = pick(record, ["rival", "oponente", "contrario"]) || "Rival";
      const sourceType = parsePlayerOfMatchCompetition(
        pick(record, [
          "competencia",
          "competition",
          "tipo_competencia",
          "tipo_de_competencia",
          "torneo_copa_amistoso",
          "tipo",
        ]),
      );
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
        "jugadores_que_jugaron",
        "jugadores_que_jugaron_el_partido",
        "jugadores_que_asistieron",
        "jugadores_presentes",
        "jugadores_del_partido",
        "jugadores",
        "presentes",
        "players",
        "ingresaron",
        "jugaron",
        "asistieron",
      ]);
      const players = splitPlayerNames(rawPlayers);

      if (!date || players.length === 0) {
        return null;
      }

      const rawId = pick(record, ["id", "partido_id", "match_id"]);

      const match: MatchRecord = {
        id: createUniqueMatchId(rawId || createMatchId(date, rival), seenIds),
        date,
        period: getPeriodFromDate(date) ?? getCurrentPeriod(),
        rival,
        players,
        venue,
        coachAttended,
        loadedAt: loadedAt ?? date,
      };

      if (sourceType) {
        match.sourceType = sourceType;
      }

      return match;
    })
    .filter((match): match is MatchRecord => Boolean(match))
    .sort((left, right) => left.date.localeCompare(right.date));
}

function mergePlayerOfMatchMatches(
  sheetMatches: MatchRecord[],
  fixtureMatches: LeagueFixtureMatch[],
) {
  const matchedSheetIds = new Set<string>();
  const officialMatches = fixtureMatches
    .filter((match) => match.dateIso && match.isClubMatch && !match.involvesBye)
    .map((fixtureMatch) => {
      const sheetMatch = findSheetMatchForFixture(
        sheetMatches,
        fixtureMatch,
        matchedSheetIds,
      );

      if (sheetMatch) {
        matchedSheetIds.add(sheetMatch.id);
      }

      const rival = getFixtureRival(fixtureMatch);
      const date = fixtureMatch.dateIso ?? sheetMatch?.date ?? "";

      return {
        id: sheetMatch?.id ?? createFixturePlayerOfMatchId(fixtureMatch),
        date,
        period: getPeriodFromDate(date) ?? getCurrentPeriod(),
        rival,
        sourceType: fixtureMatch.competitionKind,
        sourceLabel: getPlayerOfMatchSourceLabel(fixtureMatch.competitionKind),
        resultLabel: getFixtureResultLabel(fixtureMatch),
        canEdit: false,
        localTeam: fixtureMatch.localTeam,
        visitorTeam: fixtureMatch.visitorTeam,
        players: sheetMatch?.players ?? [],
        venue: sheetMatch?.venue ?? "",
        coachAttended: sheetMatch?.coachAttended ?? false,
        loadedAt: sheetMatch?.loadedAt ?? date,
      } satisfies MatchRecord;
    });
  const formOnlyMatches = sheetMatches
    .filter((match) => !matchedSheetIds.has(match.id))
    .map((match) => enrichFormOnlyPlayerOfMatch(match));

  return [...officialMatches, ...formOnlyMatches].sort((left, right) =>
    left.date.localeCompare(right.date),
  );
}

function findSheetMatchForFixture(
  sheetMatches: MatchRecord[],
  fixtureMatch: LeagueFixtureMatch,
  matchedSheetIds: Set<string>,
) {
  const date = fixtureMatch.dateIso;

  if (!date) {
    return undefined;
  }

  const fixtureRivalKey = normalizeClubPlayerName(getFixtureRival(fixtureMatch));
  const candidates = sheetMatches.filter(
    (match) =>
      match.date === date &&
      !matchedSheetIds.has(match.id) &&
      !isFriendlyMatchRecord(match) &&
      isCompatiblePlayerOfMatchCompetition(match, fixtureMatch.competitionKind),
  );
  const exactMatch = candidates.find((match) =>
    areComparableRivals(normalizeClubPlayerName(match.rival), fixtureRivalKey),
  );

  return exactMatch ?? (candidates.length === 1 ? candidates[0] : undefined);
}

function enrichFormOnlyPlayerOfMatch(match: MatchRecord): MatchRecord {
  const sourceType: LeagueCompetitionKind =
    match.sourceType ?? (isFriendlyMatchRecord(match) ? "friendly" : "league");
  const rival = sourceType === "friendly" ? cleanFriendlyRival(match.rival) : match.rival;

  return {
    ...match,
    rival,
    sourceType,
    sourceLabel: getPlayerOfMatchSourceLabel(sourceType),
    resultLabel:
      match.resultLabel ??
      (sourceType === "friendly" ? "Sin resultado oficial" : "Pendiente"),
    canEdit: sourceType === "friendly",
  };
}

function isFriendlyMatchRecord(match: MatchRecord) {
  return (
    match.sourceType === "friendly" ||
    /^amistoso\b/i.test(removeFriendlyAccents(match.rival))
  );
}

function isEditablePlayerOfMatchRecord(match: MatchRecord) {
  return Boolean(match.canEdit && match.sourceType === "friendly");
}

function isCompatiblePlayerOfMatchCompetition(
  match: MatchRecord,
  fixtureCompetitionKind: LeagueCompetitionKind,
) {
  return !match.sourceType || match.sourceType === fixtureCompetitionKind;
}

function parsePlayerOfMatchCompetition(value: string): LeagueCompetitionKind | undefined {
  const normalized = normalizeText(value);

  if (!normalized) {
    return undefined;
  }

  if (normalized.includes("amistoso") || normalized === "friendly") {
    return "friendly";
  }

  if (normalized.includes("copa") || normalized === "cup") {
    return "cup";
  }

  if (
    normalized.includes("torneo") ||
    normalized.includes("liga") ||
    normalized === "league"
  ) {
    return "league";
  }

  return undefined;
}

function applyPlayerOfMatchOverrides(
  matches: MatchRecord[],
  overrides: PlayerOfMatchOverrideRecord[],
) {
  if (overrides.length === 0) {
    return matches;
  }

  const overridesByMatchId = new Map(
    overrides.map((override) => [override.matchId, override]),
  );

  return matches
    .map((match) => {
      const override = overridesByMatchId.get(match.id);

      if (!override || !isEditablePlayerOfMatchRecord(match)) {
        return match;
      }

      return {
        ...match,
        date: override.date,
        period: getPeriodFromDate(override.date) ?? match.period,
        rival: cleanFriendlyRival(override.rival),
        sourceType: "friendly",
        sourceLabel: getPlayerOfMatchSourceLabel("friendly"),
        resultLabel: "Sin resultado oficial",
        players: override.players,
        canEdit: true,
        loadedAt: override.updatedAt || match.loadedAt,
      } satisfies MatchRecord;
    })
    .sort((left, right) => left.date.localeCompare(right.date));
}

function cleanFriendlyRival(value: string) {
  return value.replace(/^\s*amistoso\s*[:\-]?\s*/i, "").trim() || "Rival amistoso";
}

function removeFriendlyAccents(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function areComparableRivals(left: string, right: string) {
  return (
    left === right ||
    (left.length >= 4 && right.includes(left)) ||
    (right.length >= 4 && left.includes(right))
  );
}

function getFixtureRival(match: LeagueFixtureMatch) {
  return match.localTeam === APP_TEAM_NAME ? match.visitorTeam : match.localTeam;
}

function getPlayerOfMatchSourceLabel(kind: LeagueCompetitionKind) {
  return {
    cup: "Copa",
    friendly: "Amistoso",
    league: "Liga",
  }[kind];
}

function getFixtureResultLabel(match: LeagueFixtureMatch) {
  if (
    match.status === "played" &&
    typeof match.localScore === "number" &&
    typeof match.visitorScore === "number"
  ) {
    return `${match.localTeam} ${match.localScore}-${match.visitorScore} ${match.visitorTeam}`;
  }

  if (match.status === "without-result") {
    return "Sin resultado publicado";
  }

  return "Pendiente";
}

function createFixturePlayerOfMatchId(match: LeagueFixtureMatch) {
  return `fixture-${match.id}`;
}

function mapRowsToPlayerOfMatchOverrides(
  rows: unknown[][],
): PlayerOfMatchOverrideRecord[] {
  return rowsToRecords(rows)
    .map<PlayerOfMatchOverrideRecord | null>((record) => {
      const matchId = pick(record, ["partido_id", "match_id"]);
      const date = parseClubDateTime(pick(record, ["fecha", "date", "dia"]));
      const rival = pick(record, ["rival", "oponente", "contrario"]);
      const sourceType =
        parsePlayerOfMatchCompetition(
          pick(record, ["competencia", "competition", "tipo_competencia"]),
        ) ?? "friendly";
      const players = uniquePlayerNames(
        splitPlayerNames(pick(record, ["jugadores", "players", "participantes"])),
      );

      if (!matchId || !date || !rival || sourceType !== "friendly") {
        return null;
      }

      return {
        matchId,
        date,
        rival,
        sourceType,
        players,
        updatedByUserId: pick(record, [
          "actualizado_por_user_id",
          "updated_by_user_id",
          "user_id",
        ]),
        updatedByName: pick(record, ["actualizado_por", "updated_by", "usuario"]),
        updatedAt:
          parseDateTime(pick(record, ["actualizado_en", "updated_at", "timestamp"])) ??
          "",
      } satisfies PlayerOfMatchOverrideRecord;
    })
    .filter((override): override is PlayerOfMatchOverrideRecord => Boolean(override));
}

function mapRowsToFixtureMatchScheduleOverrides(
  rows: unknown[][],
): FixtureMatchScheduleOverride[] {
  return rowsToRecords(rows)
    .map<FixtureMatchScheduleOverride | null>((record) => {
      const matchId = pick(record, ["match_id", "partido_id", "id"]);
      const dateTime = normalizeFixtureOverrideDateTime(
        pick(record, ["fecha_hora", "datetime", "date_time", "fecha"]),
      );
      const localScore = parseOptionalScore(
        pick(record, ["goles_local", "local_score", "resultado_local"]),
      );
      const visitorScore = parseOptionalScore(
        pick(record, ["goles_visitante", "visitor_score", "resultado_visitante"]),
      );
      const localPenaltyScore = parseOptionalScore(
        pick(record, [
          "penales_local",
          "local_penalty_score",
          "local_penalties",
          "penales_lng",
        ]),
      );
      const visitorPenaltyScore = parseOptionalScore(
        pick(record, [
          "penales_visitante",
          "visitor_penalty_score",
          "visitor_penalties",
          "penales_rival",
        ]),
      );

      if (!matchId || !dateTime) {
        return null;
      }

      return {
        dateTime,
        goalScorers: parseFixtureGoalScorers(
          pick(record, ["goleadores_lng", "goleadores", "goal_scorers"]),
        ),
        localScore,
        localPenaltyScore,
        matchId,
        updatedAt:
          parseDateTime(pick(record, ["actualizado_en", "updated_at", "timestamp"])) ??
          "",
        updatedByName: pick(record, ["actualizado_por", "updated_by", "usuario"]),
        updatedByUserId: pick(record, [
          "actualizado_por_user_id",
          "updated_by_user_id",
          "user_id",
        ]),
        visitorPenaltyScore,
        visitorScore,
      };
    })
    .filter((override): override is FixtureMatchScheduleOverride => Boolean(override));
}

function parseOptionalScore(value: string) {
  const normalized = value.trim();

  if (!normalized) {
    return undefined;
  }

  const parsed = Number(normalized.replace(",", "."));

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function formatOptionalScore(value?: number) {
  return typeof value === "number" ? String(value) : "";
}

function parseFixtureGoalScorers(value: string) {
  return value
    .split(/\n|,/)
    .map((scorer) => scorer.trim())
    .filter(Boolean);
}

function buildManualGoalEvents(goalScorers: string[]): LeagueGoalEvent[] {
  return goalScorers.map((playerName) => ({
    playerName,
    teamName: APP_TEAM_NAME,
  }));
}

function formatManualGoalLabels(goalScorers: string[]) {
  return goalScorers.map((playerName) => `${APP_TEAM_NAME}: ${playerName}`);
}

function applyFixtureMatchScheduleOverrides(
  matches: LeagueFixtureMatch[],
  overrides: FixtureMatchScheduleOverride[],
) {
  const overridesByMatchId = new Map(
    overrides.map((override) => [override.matchId, override]),
  );

  return matches.map((match) => {
    const override = overridesByMatchId.get(match.id);

    if (!override) {
      return match;
    }

    const { dateIso, time } = splitFixtureOverrideDateTime(override.dateTime);
    const nextDateIso = dateIso ?? match.dateIso;
    const hasOfficialScore =
      typeof match.localScore === "number" && typeof match.visitorScore === "number";
    const hasManualScore =
      typeof override.localScore === "number" &&
      typeof override.visitorScore === "number";
    const hasManualPenalties =
      typeof override.localPenaltyScore === "number" &&
      typeof override.visitorPenaltyScore === "number";
    const manualGoalEvents = buildManualGoalEvents(override.goalScorers);

    return {
      ...match,
      dateIso: nextDateIso,
      goalEvents: [...match.goalEvents, ...manualGoalEvents],
      goals: [...match.goals, ...formatManualGoalLabels(override.goalScorers)],
      localScore:
        !hasOfficialScore && hasManualScore ? override.localScore : match.localScore,
      localPenaltyScore: hasManualPenalties
        ? override.localPenaltyScore
        : match.localPenaltyScore,
      manualGoalScorers: override.goalScorers,
      resultOverrideUpdatedAt:
        hasManualScore || hasManualPenalties || override.goalScorers.length > 0
          ? override.updatedAt
          : undefined,
      roundDate: dateIso ? formatFixtureRoundDate(dateIso) : match.roundDate,
      scheduleOverrideUpdatedAt: override.updatedAt,
      status:
        !hasOfficialScore && hasManualScore
          ? "played"
          : getScheduleAdjustedStatus(match, nextDateIso),
      time: time ?? match.time,
      visitorScore:
        !hasOfficialScore && hasManualScore ? override.visitorScore : match.visitorScore,
      visitorPenaltyScore: hasManualPenalties
        ? override.visitorPenaltyScore
        : match.visitorPenaltyScore,
    };
  });
}

function mapRowsToPlayerOfMatchVotes(rows: unknown[][]): PlayerOfMatchVote[] {
  return rowsToRecords(rows)
    .map<PlayerOfMatchVote | null>((record, index) => {
      const matchId = pick(record, ["partido_id", "match_id"]);
      const voterUserId = pick(record, ["votante_user_id", "user_id", "usuario_id"]);
      const firstVotePlayerName = pick(record, [
        "primer_voto_jugador",
        "primer_voto",
        "first_vote_player_name",
      ]);
      const secondVotePlayerName = pick(record, [
        "segundo_voto_jugador",
        "segundo_voto",
        "second_vote_player_name",
      ]);

      if (!matchId || !voterUserId || !firstVotePlayerName || !secondVotePlayerName) {
        return null;
      }

      return {
        id: pick(record, ["id", "voto_id"]) || `player-of-match-vote-${index + 1}`,
        matchId,
        matchDate: parseDate(pick(record, ["fecha_partido", "match_date"])) ?? "",
        rival: pick(record, ["rival", "oponente", "contrario"]),
        voterUserId,
        voterPlayerId: pick(record, [
          "votante_player_id",
          "votante_jugador_id",
          "player_id",
        ]),
        voterName: pick(record, ["votante_nombre", "votante", "user_name"]),
        firstVotePlayerName,
        secondVotePlayerName,
        createdAt:
          parseDateTime(pick(record, ["creado_en", "created_at", "timestamp"])) ?? "",
      } satisfies PlayerOfMatchVote;
    })
    .filter((vote): vote is PlayerOfMatchVote => Boolean(vote));
}

function isPlayerOfMatchVoteFromVoter(
  vote: PlayerOfMatchVote,
  voterLookupKeys: Set<string>,
) {
  return lookupSetsIntersect(
    buildPlayerLookupKeys(vote.voterUserId, vote.voterPlayerId, vote.voterName),
    voterLookupKeys,
  );
}

function buildPlayerOfMatchData({
  accountProfiles,
  cachedAt,
  currentPlayerId,
  currentUserId,
  matches,
  message,
  players,
  revalidateSeconds,
  status,
  votes,
  voterVotes,
}: {
  accountProfiles: AccountProfileRecord[];
  cachedAt: string;
  currentPlayerId?: string;
  currentUserId: string;
  matches: MatchRecord[];
  message?: string;
  players: PlayerRecord[];
  revalidateSeconds: number;
  status: PlayerOfMatchData["source"]["status"];
  votes: PlayerOfMatchVote[];
  voterVotes: PlayerOfMatchVote[];
}): PlayerOfMatchData {
  const votesByMatchId = new Map(voterVotes.map((vote) => [vote.matchId, vote]));
  const playerPhotoMap = buildPlayerOfMatchPhotoMap(matches, accountProfiles);
  const formattedMatches = [...matches]
    .sort((left, right) => right.date.localeCompare(left.date))
    .map<PlayerOfMatchMatch>((match) => {
      const votingWindow = getPlayerOfMatchVotingWindow(match);
      const matchVotes = votes.filter((vote) => vote.matchId === match.id);
      const sourceType = match.sourceType ?? "league";

      return {
        id: match.id,
        title: `MVP vs ${match.rival}`,
        date: match.date,
        period: match.period,
        rival: match.rival,
        sourceType,
        sourceLabel: match.sourceLabel ?? getPlayerOfMatchSourceLabel(sourceType),
        resultLabel: match.resultLabel ?? "Pendiente",
        players: match.players,
        results: buildPlayerOfMatchResults(match, matchVotes, playerPhotoMap),
        totalVotes: matchVotes.length * 2,
        totalVoters: matchVotes.length,
        canEdit: isEditablePlayerOfMatchRecord(match),
        userVote: votesByMatchId.get(match.id),
        votingEndsAt: votingWindow.endsAt,
        votingStartsAt: votingWindow.startsAt,
        votingStatus: votingWindow.status,
      };
    });
  const rankings = buildPlayerOfMatchRankings({
    accountProfiles,
    currentPlayerId,
    currentUserId,
    formattedMatches,
    matches,
    players,
  });

  return {
    matches: formattedMatches,
    rankings,
    emptyState: {
      title:
        status === "error"
          ? "No se pudo cargar la votacion"
          : "Todavia no hay partidos para votar",
      description:
        status === "error"
          ? (message ?? "Revisá la conexión con Google Sheets.")
          : "Cuando el fixture o el formulario de partidos tengan fecha, rival y jugadores, van a aparecer aca.",
    },
    source: {
      provider: "google-sheets",
      status,
      message:
        message ??
        (formattedMatches.length > 0
          ? "Partidos, fixture y votos obtenidos correctamente."
          : "Google Sheets conectado, sin partidos cargados para votar."),
      cachedAt,
      revalidateSeconds,
    },
  };
}

function buildPlayerOfMatchRankings({
  accountProfiles,
  currentPlayerId,
  currentUserId,
  formattedMatches,
  matches,
  players,
}: {
  accountProfiles: AccountProfileRecord[];
  currentPlayerId?: string;
  currentUserId: string;
  formattedMatches: PlayerOfMatchMatch[];
  matches: MatchRecord[];
  players: PlayerRecord[];
}): PlayerOfMatchRankings {
  const playerNames = [
    ...players.map((player) => player.name),
    ...matches.flatMap((match) => match.players),
  ];
  const photoMap = buildPlayerPhotoMap(playerNames, accountProfiles);
  const playersByNameKey = new Map(
    players.map((player) => [normalizeClubPlayerName(player.name), player]),
  );
  const rankingNames = new Map<string, string>();

  playerNames.forEach((name) => {
    const key = normalizeClubPlayerName(name);

    if (key && !rankingNames.has(key)) {
      rankingNames.set(key, name);
    }
  });

  const mvpRows = [...rankingNames.entries()].map(([key, playerName]) => ({
    firstPlaces: 0,
    photoDataUrl: photoMap.get(key),
    playerId: playersByNameKey.get(key)?.id,
    playerName,
    rank: 0,
    secondPlaces: 0,
    thirdPlaces: 0,
    totalPodiums: 0,
  }));
  const mvpRowsByKey = new Map(
    mvpRows.map((row) => [normalizeClubPlayerName(row.playerName), row]),
  );

  formattedMatches
    .filter((match) => match.votingStatus === "closed" && match.totalVotes > 0)
    .forEach((match) => {
      match.results
        .filter((result) => result.rank <= 3 && result.points > 0)
        .forEach((result) => {
          const key = normalizeClubPlayerName(result.playerName);
          const row = mvpRowsByKey.get(key);

          if (!row) {
            return;
          }

          if (result.rank === 1) {
            row.firstPlaces += 1;
          } else if (result.rank === 2) {
            row.secondPlaces += 1;
          } else if (result.rank === 3) {
            row.thirdPlaces += 1;
          }

          row.totalPodiums += 1;
        });
    });

  const mvp = mvpRows
    .filter((row) => row.totalPodiums > 0)
    .sort(
      (left, right) =>
        right.totalPodiums - left.totalPodiums ||
        right.firstPlaces - left.firstPlaces ||
        right.secondPlaces - left.secondPlaces ||
        right.thirdPlaces - left.thirdPlaces ||
        left.playerName.localeCompare(right.playerName, "es"),
    )
    .map((row, index) => ({ ...row, rank: index + 1 }));
  const attendanceSummaries = players.map((player) => ({
    player,
    summary: buildPlayerAttendanceSummary(player, matches),
  }));
  const streaks = attendanceSummaries
    .map(({ player, summary }) => ({
      currentStreak: summary.currentStreak,
      lastAttendanceDate: summary.lastAttendanceDate,
      lastAttendanceRival: summary.lastAttendanceRival,
      photoDataUrl: photoMap.get(normalizeClubPlayerName(player.name)),
      playerId: player.id,
      playerName: player.name,
      rank: 0,
    }))
    .sort(
      (left, right) =>
        right.currentStreak - left.currentStreak ||
        right.lastAttendanceDate.localeCompare(left.lastAttendanceDate) ||
        left.playerName.localeCompare(right.playerName, "es"),
    )
    .map((row, index) => ({ ...row, rank: index + 1 }));
  const historicalStreaks = attendanceSummaries
    .map(({ player, summary }) => ({
      bestStreak: summary.bestStreak,
      photoDataUrl: photoMap.get(normalizeClubPlayerName(player.name)),
      playerId: player.id,
      playerName: player.name,
      rank: 0,
    }))
    .filter((row) => row.bestStreak > 0)
    .sort(
      (left, right) =>
        right.bestStreak - left.bestStreak ||
        left.playerName.localeCompare(right.playerName, "es"),
    )
    .map((row, index) => ({ ...row, rank: index + 1 }));
  const attendance = attendanceSummaries
    .map(({ player, summary }) => ({
      attendanceRate: summary.attendanceRate,
      attendedMatches: summary.attendedMatches,
      photoDataUrl: photoMap.get(normalizeClubPlayerName(player.name)),
      playerId: player.id,
      playerName: player.name,
      rank: 0,
      totalMatches: summary.totalMatches,
    }))
    .sort(
      (left, right) =>
        right.attendanceRate - left.attendanceRate ||
        right.attendedMatches - left.attendedMatches ||
        right.totalMatches - left.totalMatches ||
        left.playerName.localeCompare(right.playerName, "es"),
    )
    .map((row, index) => ({ ...row, rank: index + 1 }));
  const currentProfile = accountProfiles.find(
    (profile) => profile.userId === currentUserId,
  );
  const currentLookupKeys = buildPlayerLookupKeys(
    currentPlayerId,
    currentUserId,
    currentProfile?.name,
    currentProfile?.username,
  );
  const currentPlayer = players.find((player) =>
    playerMatchesLookup(player, currentLookupKeys),
  );
  const currentStreak = currentPlayer
    ? streaks.find((row) => row.playerId === currentPlayer.id)
    : undefined;
  const currentAttendance = currentPlayer
    ? attendance.find((row) => row.playerId === currentPlayer.id)
    : undefined;

  return {
    attendance,
    currentPlayer:
      currentPlayer && currentAttendance
        ? {
            attendanceRank: currentAttendance.rank,
            attendanceRate: currentAttendance.attendanceRate,
            attendedMatches: currentAttendance.attendedMatches,
            bestStreak:
              historicalStreaks.find((row) => row.playerId === currentPlayer.id)
                ?.bestStreak ?? 0,
            currentStreak: currentStreak?.currentStreak ?? 0,
            photoDataUrl:
              currentStreak?.photoDataUrl ??
              photoMap.get(normalizeClubPlayerName(currentPlayer.name)),
            playerId: currentPlayer.id,
            playerName: currentPlayer.name,
            streakRank: currentStreak?.rank,
            totalMatches: currentAttendance.totalMatches,
          }
        : undefined,
    historicalStreaks,
    mvp,
    streaks,
  };
}

function buildPlayerOfMatchResults(
  match: MatchRecord,
  votes: PlayerOfMatchVote[],
  playerPhotoMap: Map<string, string>,
) {
  const pointCounts = new Map<string, number>();
  const voteCounts = new Map<string, number>();
  const playerNamesByKey = new Map<string, string>();

  match.players.forEach((player) => {
    const key = normalizeClubPlayerName(player);

    pointCounts.set(key, 0);
    voteCounts.set(key, 0);
    playerNamesByKey.set(key, player);
  });

  votes.forEach((vote) => {
    [
      { playerName: vote.firstVotePlayerName, points: 2 },
      { playerName: vote.secondVotePlayerName, points: 1 },
    ].forEach(({ playerName, points }) => {
      const key = normalizeClubPlayerName(playerName);

      if (!voteCounts.has(key)) {
        return;
      }

      pointCounts.set(key, (pointCounts.get(key) ?? 0) + points);
      voteCounts.set(key, (voteCounts.get(key) ?? 0) + 1);
    });
  });

  return [...voteCounts.entries()]
    .map(([key, votesCount]) => ({
      playerName: playerNamesByKey.get(key) ?? key,
      photoDataUrl: playerPhotoMap.get(key),
      points: pointCounts.get(key) ?? 0,
      rank: 0,
      votes: votesCount,
    }))
    .sort((left, right) => {
      if (right.points !== left.points) {
        return right.points - left.points;
      }

      if (right.votes !== left.votes) {
        return right.votes - left.votes;
      }

      return left.playerName.localeCompare(right.playerName, "es");
    })
    .map((result, index) => ({
      ...result,
      rank: index + 1,
    }));
}

function buildPlayerOfMatchPhotoMap(
  matches: MatchRecord[],
  accountProfiles: AccountProfileRecord[],
) {
  return buildPlayerPhotoMap(
    matches.flatMap((match) => match.players),
    accountProfiles,
  );
}

function buildPlayerPhotoMap(
  playerNames: string[],
  accountProfiles: AccountProfileRecord[],
) {
  const playerKeys = new Set(playerNames.map(normalizeClubPlayerName).filter(Boolean));
  const photos = new Map<string, string>();

  accountProfiles.forEach((profile) => {
    if (!profile.profilePhotoDataUrl) {
      return;
    }

    const candidates = [
      profile.name,
      profile.userId,
      profile.username,
      createClubPlayerId(profile.name),
      createClubPlayerId(profile.userId),
      createClubPlayerId(profile.username),
    ].flatMap((value) => [
      normalizeClubPlayerName(value),
      normalizeClubPlayerName(value.replace(/[-_]+/g, " ")),
    ]);

    candidates.forEach((candidate) => {
      if (playerKeys.has(candidate) && !photos.has(candidate)) {
        photos.set(candidate, profile.profilePhotoDataUrl);
      }
    });
  });

  return photos;
}

function getPlayerOfMatchVotingWindow(match: MatchRecord) {
  const startsAtDate = parseVotingStartDate(match.loadedAt) ?? new Date();
  const safeStartDate = !Number.isNaN(startsAtDate.getTime()) ? startsAtDate : new Date();
  const endsAtDate = getArgentinaMidnightAfterDays(
    safeStartDate,
    PLAYER_OF_MATCH_VOTING_WINDOW_DAYS,
  );
  const now = Date.now();
  const hasEnoughPlayers = match.players.length >= 2;
  const status: PlayerOfMatchMatch["votingStatus"] =
    !hasEnoughPlayers || now < safeStartDate.getTime()
      ? "scheduled"
      : now <= endsAtDate.getTime()
        ? "open"
        : "closed";

  return {
    endsAt: endsAtDate.toISOString(),
    isOpen: status === "open",
    startsAt: safeStartDate.toISOString(),
    status,
  };
}

function parseVotingStartDate(value: string) {
  if (!value) {
    return undefined;
  }

  const date = value.includes("T")
    ? new Date(value)
    : new Date(`${value}T00:00:00-03:00`);

  return Number.isNaN(date.getTime()) ? undefined : date;
}

function getArgentinaMidnightAfterDays(date: Date, days: number) {
  const dateIso = getArgentinaDateIso(date);
  const [year, month, day] = dateIso.split("-").map(Number);
  const nextDate = new Date(Date.UTC(year, month - 1, day + days, 12));
  const nextDateIso = getArgentinaDateIso(nextDate);

  return new Date(`${nextDateIso}T00:00:00-03:00`);
}

function getArgentinaDateIso(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));

  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

function isPlayerOfMatchVotingOpen(match: MatchRecord) {
  return getPlayerOfMatchVotingWindow(match).isOpen;
}

function buildPlayerOfMatchVoteWritableRow(headers: string[], vote: PlayerOfMatchVote) {
  const values: Record<string, string> = {
    creado_en: vote.createdAt,
    fecha_partido: vote.matchDate,
    first_vote_player_name: vote.firstVotePlayerName,
    id: vote.id,
    match_date: vote.matchDate,
    match_id: vote.matchId,
    partido_id: vote.matchId,
    primer_voto_jugador: vote.firstVotePlayerName,
    rival: vote.rival,
    second_vote_player_name: vote.secondVotePlayerName,
    segundo_voto_jugador: vote.secondVotePlayerName,
    user_id: vote.voterUserId,
    user_name: vote.voterName,
    votante: vote.voterName,
    votante_jugador_id: vote.voterPlayerId ?? "",
    votante_nombre: vote.voterName,
    votante_player_id: vote.voterPlayerId ?? "",
    votante_user_id: vote.voterUserId,
  };

  return headers.map((header) => values[normalizeHeader(header)] ?? "");
}

function buildPlayerOfMatchOverrideWritableRow(
  headers: string[],
  override: PlayerOfMatchOverrideRecord,
) {
  const playersText = override.players.join("\n");
  const values: Record<string, string> = {
    actualizacion: override.updatedAt,
    actualizado_en: override.updatedAt,
    actualizado_por: override.updatedByName,
    actualizado_por_user_id: override.updatedByUserId,
    competencia: getPlayerOfMatchSourceLabel(override.sourceType),
    competition: override.sourceType,
    date: override.date,
    fecha: override.date,
    jugadores: playersText,
    match_id: override.matchId,
    participantes: playersText,
    partido_id: override.matchId,
    players: playersText,
    rival: override.rival,
    tipo_competencia: getPlayerOfMatchSourceLabel(override.sourceType),
    updated_at: override.updatedAt,
    updated_by: override.updatedByName,
    updated_by_user_id: override.updatedByUserId,
  };

  return headers.map((header) => values[normalizeHeader(header)] ?? "");
}

function buildFixtureOverrideWritableRow(
  headers: string[],
  override: FixtureMatchScheduleOverride,
) {
  const goalScorersText = override.goalScorers.join("\n");
  const values: Record<string, string> = {
    actualizado_en: override.updatedAt,
    actualizado_por: override.updatedByName,
    actualizado_por_user_id: override.updatedByUserId,
    date_time: override.dateTime,
    datetime: override.dateTime,
    fecha: override.dateTime,
    fecha_hora: override.dateTime,
    goal_scorers: goalScorersText,
    goles_local: formatOptionalScore(override.localScore),
    goles_visitante: formatOptionalScore(override.visitorScore),
    goleadores: goalScorersText,
    goleadores_lng: goalScorersText,
    id: override.matchId,
    local_penalties: formatOptionalScore(override.localPenaltyScore),
    local_penalty_score: formatOptionalScore(override.localPenaltyScore),
    local_score: formatOptionalScore(override.localScore),
    match_id: override.matchId,
    partido_id: override.matchId,
    penales_lng: formatOptionalScore(override.localPenaltyScore),
    penales_local: formatOptionalScore(override.localPenaltyScore),
    penales_rival: formatOptionalScore(override.visitorPenaltyScore),
    penales_visitante: formatOptionalScore(override.visitorPenaltyScore),
    resultado_local: formatOptionalScore(override.localScore),
    resultado_visitante: formatOptionalScore(override.visitorScore),
    timestamp: override.updatedAt,
    updated_at: override.updatedAt,
    updated_by: override.updatedByName,
    updated_by_user_id: override.updatedByUserId,
    user_id: override.updatedByUserId,
    usuario: override.updatedByName,
    visitor_penalties: formatOptionalScore(override.visitorPenaltyScore),
    visitor_penalty_score: formatOptionalScore(override.visitorPenaltyScore),
    visitor_score: formatOptionalScore(override.visitorScore),
  };

  return headers.map((header) => values[normalizeHeader(header)] ?? "");
}

function normalizeFixtureOverrideDateTime(value: string) {
  if (!value) {
    return "";
  }

  const parsed = parseClubDateTime(value);

  return parsed ? parsed.slice(0, 16) : "";
}

function splitFixtureOverrideDateTime(value: string) {
  const normalized = normalizeFixtureOverrideDateTime(value);

  if (!normalized) {
    return {
      dateIso: undefined,
      time: undefined,
    };
  }

  const [dateIso, time] = normalized.split("T");

  return {
    dateIso,
    time,
  };
}

function getScheduleAdjustedStatus(
  match: LeagueFixtureMatch,
  dateIso?: string,
): LeagueMatchStatus {
  if (match.status === "played" || !dateIso) {
    return match.status;
  }

  return new Date(`${dateIso}T23:59:59-03:00`) < new Date()
    ? "without-result"
    : "pending";
}

function formatFixtureRoundDate(dateIso: string) {
  const date = new Date(`${dateIso}T12:00:00-03:00`);

  if (Number.isNaN(date.getTime())) {
    return dateIso;
  }

  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "long",
    timeZone: "America/Argentina/Buenos_Aires",
    weekday: "long",
  })
    .format(date)
    .replace(",", "");
}

function findMatchPlayerName(players: string[], value: string) {
  const normalizedValue = normalizeClubPlayerName(value);

  return players.find((player) => normalizeClubPlayerName(player) === normalizedValue);
}

function createMatchId(date: string, rival: string) {
  const rivalId = createClubPlayerId(rival) || "rival";

  return `match-${date}-${rivalId}`;
}

function createUniqueMatchId(baseId: string, seenIds: Set<string>) {
  let id = baseId;
  let suffix = 2;

  while (seenIds.has(id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }

  seenIds.add(id);
  return id;
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
  const historyStartPeriod = getFeeCalculatorHistoryStartPeriod(
    activeCosts,
    actuals,
    previousPeriod,
  );
  const actualPeriods = buildPeriodRange(
    getPreviousPeriod(historyStartPeriod),
    previousPeriod,
  );
  const effectiveActuals = actualPeriods.reduce(
    (mergedActuals, actualPeriod) =>
      mergeInferredFeeCalculatorActuals(
        activeCosts,
        mergedActuals,
        matches,
        actualPeriod,
      ),
    actuals,
  );
  const adjustments = buildFeeCalculatorAdjustments(
    activeCosts,
    effectiveActuals,
    previousPeriod,
  );
  const previousQuotaWithAdjustmentsAndRefundsByPlayer =
    buildQuotaWithAdjustmentsAndRefundsByPlayerForPeriod({
      period: previousPeriod,
      players,
      costs: activeCosts,
      actuals: effectiveActuals,
      playerStatuses,
      refundPolicy,
      matches,
    });
  const previousPeriodMatches = matches.filter(
    (match) => match.period === previousPeriod,
  );
  const quotaDefinition = getFeeCalculatorQuotaDefinition({
    activeCosts,
    actuals,
    currentPeriod: period,
    effectiveActuals,
    previousPeriod,
    previousPeriodMatches,
  });
  const totalMatchesPreviousPeriod = previousPeriodMatches.length;
  const totalLocalMatchesPreviousPeriod =
    previousPeriodMatches.filter(isLocalMatch).length;
  const coachHoursPreviousPeriod =
    previousPeriodMatches.filter((match) => match.coachAttended).length * 3;
  const plannedCurrentQuota = calculateBaseQuotaForPeriod(
    activeCosts,
    effectiveActuals,
    period,
    "forecast",
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
  const baseQuota = Math.max(plannedCurrentQuota + previousCostVariance, 0);
  const calculations = activePlayers.map((player) => {
    const wasInactivePreviousPeriod = wasPlayerInactiveForPeriod(
      player,
      playerStatuses,
      previousPeriod,
    );
    const plannedCurrentQuota = calculatePlayerBaseQuotaForPeriod(
      activeCosts,
      effectiveActuals,
      period,
      "forecast",
      player,
    );
    const previousCostVariance = wasInactivePreviousPeriod
      ? 0
      : calculatePlayerCostVarianceForPeriod(
          activeCosts,
          effectiveActuals,
          previousPeriod,
          player,
        );
    const baseQuota = Math.max(plannedCurrentQuota + previousCostVariance, 0);
    const previousBaseQuota = calculatePlayerAppBaseQuotaForPeriod(
      activeCosts,
      effectiveActuals,
      previousPeriod,
      player,
    );

    return buildPlayerFeeCalculation({
      player,
      period,
      previousPeriod,
      baseQuota,
      plannedCurrentQuota,
      previousBaseQuota,
      previousQuotaWithAdjustmentsAndRefunds:
        getPlayerQuotaValue(previousQuotaWithAdjustmentsAndRefundsByPlayer, player) ??
        previousBaseQuota,
      previousCostVariance,
      matches,
      refundPolicy,
      expenseCredits,
      totalMatchesPreviousPeriod,
      skipPreviousPeriodEffects: wasInactivePreviousPeriod,
    });
  });

  return {
    period,
    previousPeriod,
    costs,
    actuals: effectiveActuals,
    adjustments,
    players: calculatorPlayers,
    refundPolicy,
    playerCalculations: calculations,
    matchSummaries: calculations.map((calculation) =>
      buildFeePlayerMatchSummary(calculation, previousPeriodMatches),
    ),
    summary: {
      period,
      previousPeriod,
      quotaStatus: quotaDefinition.status,
      quotaStatusReasons: quotaDefinition.reasons,
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
  previousQuotaWithAdjustmentsAndRefunds,
  previousCostVariance,
  matches,
  refundPolicy,
  expenseCredits,
  totalMatchesPreviousPeriod,
  skipPreviousPeriodEffects,
}: {
  player: PlayerRecord;
  period: string;
  previousPeriod: string;
  baseQuota: number;
  plannedCurrentQuota: number;
  previousBaseQuota: number;
  previousQuotaWithAdjustmentsAndRefunds: number;
  previousCostVariance: number;
  matches: MatchRecord[];
  refundPolicy: FeeRefundPolicyRule[];
  expenseCredits: Array<PlayerExpenseCredit & { period: string }>;
  totalMatchesPreviousPeriod: number;
  skipPreviousPeriodEffects?: boolean;
}): FeePlayerCalculation {
  const normalizedPlayerName = normalizeClubPlayerName(player.name);
  const playerMatches = getPlayerMatchesForPeriod(player, matches, previousPeriod);
  const playedMatches = playerMatches.length;
  const attendanceRate =
    totalMatchesPreviousPeriod > 0 ? playedMatches / totalMatchesPreviousPeriod : 0;
  const effectiveBaseQuota = skipPreviousPeriodEffects ? plannedCurrentQuota : baseQuota;
  const effectivePreviousQuota = skipPreviousPeriodEffects
    ? 0
    : previousQuotaWithAdjustmentsAndRefunds;
  const refundPercent =
    effectivePreviousQuota > 0
      ? findRefundPercent(refundPolicy, attendanceRate * 100)
      : 0;
  const refundAmount = effectivePreviousQuota * (refundPercent / 100);
  const expenseCredit = skipPreviousPeriodEffects
    ? 0
    : expenseCredits
        .filter(
          (credit) =>
            credit.period === previousPeriod &&
            normalizeClubPlayerName(credit.playerName) === normalizedPlayerName,
        )
        .reduce((total, credit) => total + credit.amount, 0);
  const quotaWithAdjustmentsAndRefunds = Math.max(effectiveBaseQuota - refundAmount, 0);
  const finalQuota = Math.max(quotaWithAdjustmentsAndRefunds - expenseCredit, 0);

  return {
    playerId: player.id,
    playerName: player.name,
    currentPeriod: period,
    previousPeriod,
    baseQuota: effectiveBaseQuota,
    plannedCurrentQuota,
    previousBaseQuota: skipPreviousPeriodEffects ? 0 : previousBaseQuota,
    previousQuotaWithAdjustmentsAndRefunds: effectivePreviousQuota,
    previousCostVariance: skipPreviousPeriodEffects ? 0 : previousCostVariance,
    refundPercent,
    refundAmount,
    quotaWithAdjustmentsAndRefunds,
    expenseCredit,
    finalQuota,
    attendanceRate,
    playedMatches,
    totalMatches: totalMatchesPreviousPeriod,
    matches: playerMatches,
  };
}

function buildQuotaWithAdjustmentsAndRefundsByPlayerForPeriod({
  period,
  players,
  costs,
  actuals,
  playerStatuses,
  refundPolicy,
  matches,
}: {
  period: string;
  players: PlayerRecord[];
  costs: FeeCalculatorCost[];
  actuals: FeeCalculatorActual[];
  playerStatuses: FeeCalculatorPlayerStatusRecord[];
  refundPolicy: FeeRefundPolicyRule[];
  matches: MatchRecord[];
}) {
  const historyStartPeriod = getFeeCalculatorHistoryStartPeriod(costs, actuals, period);
  const quotasByPeriod = new Map<string, Map<string, number>>();

  for (const calculationPeriod of buildPeriodRange(historyStartPeriod, period)) {
    const previousPeriod = getPreviousPeriod(calculationPeriod);
    const activePlayers = getActivePlayersForPeriod(
      players,
      playerStatuses,
      calculationPeriod,
    );
    const previousQuotaByPlayer = quotasByPeriod.get(previousPeriod);
    const periodMatches = matches.filter((match) => match.period === previousPeriod);
    const totalMatches = periodMatches.length;
    const quotasByPlayer = new Map<string, number>();

    for (const player of activePlayers) {
      const wasInactivePreviousPeriod = wasPlayerInactiveForPeriod(
        player,
        playerStatuses,
        previousPeriod,
      );
      const baseQuota = wasInactivePreviousPeriod
        ? calculatePlayerBaseQuotaForPeriod(
            costs,
            actuals,
            calculationPeriod,
            "forecast",
            player,
          )
        : calculatePlayerAppBaseQuotaForPeriod(costs, actuals, calculationPeriod, player);
      const fallbackPreviousBaseQuota = calculatePlayerAppBaseQuotaForPeriod(
        costs,
        actuals,
        previousPeriod,
        player,
      );
      const previousQuotaWithAdjustmentsAndRefunds = wasInactivePreviousPeriod
        ? 0
        : (getPlayerQuotaValue(previousQuotaByPlayer, player) ??
          fallbackPreviousBaseQuota);
      const playerMatches = getPlayerMatchesForPeriod(player, matches, previousPeriod);
      const attendanceRate = totalMatches > 0 ? playerMatches.length / totalMatches : 0;
      const refundPercent =
        previousQuotaWithAdjustmentsAndRefunds > 0
          ? findRefundPercent(refundPolicy, attendanceRate * 100)
          : 0;
      const refundAmount = previousQuotaWithAdjustmentsAndRefunds * (refundPercent / 100);

      setPlayerQuotaValue(quotasByPlayer, player, Math.max(baseQuota - refundAmount, 0));
    }

    quotasByPeriod.set(calculationPeriod, quotasByPlayer);
  }

  return quotasByPeriod.get(period) ?? new Map<string, number>();
}

function getPlayerMatchesForPeriod(
  player: PlayerRecord,
  matches: MatchRecord[],
  period: string,
) {
  const normalizedPlayerName = normalizeClubPlayerName(player.name);

  return matches
    .filter(
      (match) =>
        match.period === period &&
        match.players.some(
          (name) => normalizeClubPlayerName(name) === normalizedPlayerName,
        ),
    )
    .map<FeeMatchDetail>((match) => ({
      date: match.date,
      rival: match.rival,
    }));
}

function getPlayerQuotaValue(
  quotasByPlayer: Map<string, number> | undefined,
  player: PlayerRecord,
) {
  if (!quotasByPlayer) {
    return undefined;
  }

  return (
    quotasByPlayer.get(player.id) ??
    quotasByPlayer.get(normalizeClubPlayerName(player.name))
  );
}

function setPlayerQuotaValue(
  quotasByPlayer: Map<string, number>,
  player: PlayerRecord,
  value: number,
) {
  quotasByPlayer.set(player.id, value);

  const normalizedPlayerName = normalizeClubPlayerName(player.name);

  if (normalizedPlayerName) {
    quotasByPlayer.set(normalizedPlayerName, value);
  }
}

function buildFeePlayerMatchSummary(
  calculation: FeePlayerCalculation,
  periodMatches: MatchRecord[],
): FeePlayerMatchSummary {
  const normalizedPlayerName = normalizeClubPlayerName(calculation.playerName);
  const presentMatches: FeeMatchDetail[] = [];
  const absentMatches: FeeMatchDetail[] = [];

  for (const match of periodMatches) {
    const attended = match.players.some(
      (name) => normalizeClubPlayerName(name) === normalizedPlayerName,
    );
    const detail = {
      date: match.date,
      rival: match.rival,
    };

    if (attended) {
      presentMatches.push(detail);
    } else {
      absentMatches.push(detail);
    }
  }

  return {
    playerId: calculation.playerId,
    playerName: calculation.playerName,
    period: calculation.previousPeriod,
    playedMatches: presentMatches.length,
    totalMatches: periodMatches.length,
    attendanceRate:
      periodMatches.length > 0 ? presentMatches.length / periodMatches.length : 0,
    matches: presentMatches,
    absentMatches,
  };
}

function mapPlayerToFeeCalculatorPlayer(
  player: PlayerRecord,
  statusMap: Map<string, PlayerDirectoryStatus>,
): FeeCalculatorPlayer {
  const status = getFeeCalculatorPlayerStatus(player, statusMap);

  return {
    id: player.id,
    name: player.name,
    category: player.category,
    status,
  };
}

function getFeeCalculatorPlayerStatus(
  player: PlayerRecord,
  statusMap: Map<string, PlayerDirectoryStatus>,
) {
  const lookupKeys = buildPlayerLookupKeys(
    player.id,
    player.name,
    player.email,
    player.phone,
  );

  for (const key of lookupKeys) {
    const status = statusMap.get(key);

    if (status) {
      return status;
    }
  }

  return "active";
}

function buildFeeCalculatorPlayerStatusMap(
  playerStatuses: FeeCalculatorPlayerStatusRecord[],
  period: string,
) {
  return playerStatuses
    .filter((status) => status.period === period)
    .reduce<Map<string, PlayerDirectoryStatus>>((map, status) => {
      map.set(status.playerId, status.status);

      for (const key of buildPlayerLookupKeys(status.playerId, status.playerName)) {
        map.set(key, status.status);
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
    .flatMap((record, index): AppNotification[] => {
      if (isNotificationHeaderRecord(record)) {
        return [];
      }

      return [
        {
          id: pick(record, ["id", "notification_id"]) || `notification-${index + 1}`,
          createdAt:
            parseDateTime(pick(record, ["created_at", "fecha", "timestamp"])) ??
            new Date().toISOString(),
          title: pick(record, ["title", "titulo"]) || "Notificacion",
          message: pick(record, ["message", "mensaje", "description"]) || "-",
          type: normalizeNotificationType(pick(record, ["type", "tipo"])),
          status: normalizeNotificationStatus(pick(record, ["status", "estado"])),
          targetRole: normalizeTargetRole(
            pick(record, ["target_role", "rol", "audience"]),
          ),
          targetUserId:
            pick(record, ["target_user_id", "user_id", "usuario_id"]) || undefined,
          targetPlayerId:
            pick(record, ["target_player_id", "player_id", "jugador_id"]) || undefined,
          referenceId:
            pick(record, ["reference_id", "referencia_id", "entity_id"]) || undefined,
          url: pick(record, ["url", "href", "link"]) || undefined,
          readAt: parseDateTime(pick(record, ["read_at", "leido_el"])),
        },
      ];
    })
    .sort(compareByCreatedAtDesc);
}

function isNotificationHeaderRecord(record: SheetRecord) {
  const id = normalizeHeader(pick(record, ["id", "notification_id"]));
  const createdAt = normalizeHeader(pick(record, ["created_at", "fecha", "timestamp"]));
  const title = normalizeHeader(pick(record, ["title", "titulo"]));
  const message = normalizeHeader(pick(record, ["message", "mensaje", "description"]));

  return (
    id === "id" &&
    (createdAt === "created_at" || title === "title" || message === "message")
  );
}

function buildNotificationWritableRow(
  headers: string[],
  {
    createdAt,
    id,
    input,
  }: {
    createdAt: string;
    id: string;
    input: CreateNotificationInput;
  },
) {
  const values: Record<string, string> = {
    id,
    notification_id: id,
    created_at: createdAt,
    fecha: createdAt,
    timestamp: createdAt,
    title: input.title,
    titulo: input.title,
    message: input.message,
    mensaje: input.message,
    description: input.message,
    type: input.type ?? "info",
    tipo: input.type ?? "info",
    status: "unread",
    estado: "unread",
    target_role: input.targetRole ?? "all",
    rol: input.targetRole ?? "all",
    audience: input.targetRole ?? "all",
    target_user_id: input.targetUserId ?? "",
    user_id: input.targetUserId ?? "",
    usuario_id: input.targetUserId ?? "",
    target_player_id: input.targetPlayerId ?? "",
    player_id: input.targetPlayerId ?? "",
    jugador_id: input.targetPlayerId ?? "",
    reference_id: input.referenceId ?? "",
    referencia_id: input.referenceId ?? "",
    entity_id: input.referenceId ?? "",
    url: input.url ?? "",
    href: input.url ?? "",
    link: input.url ?? "",
    read_at: "",
    leido_el: "",
  };

  return headers.map((header) => values[header] ?? "");
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

function mapRowsToPushSubscriptions(rows: unknown[][]): PushSubscriptionRecord[] {
  return rowsToRecords(rows)
    .map((record, index): PushSubscriptionRecord | null => {
      const endpoint = pick(record, ["endpoint"]).trim();
      const p256dh = pick(record, ["p256dh", "public_key"]).trim();
      const auth = pick(record, ["auth", "auth_secret"]).trim();
      const userId = pick(record, ["user_id", "usuario_id"]).trim();

      if (!endpoint || !p256dh || !auth || !userId) {
        return null;
      }

      return {
        id: pick(record, ["id", "subscription_id"]) || `push-${index + 1}`,
        userId,
        playerId: pick(record, ["player_id", "jugador_id"]) || undefined,
        endpoint,
        keys: {
          auth,
          p256dh,
        },
        userAgent: pick(record, ["user_agent", "navegador"]) || undefined,
        active: parseLooseBoolean(pick(record, ["activo", "active"]), true),
        createdAt:
          parseDateTime(pick(record, ["creado_en", "created_at", "created"])) ??
          new Date().toISOString(),
        updatedAt:
          parseDateTime(
            pick(record, ["actualizado_en", "updated_at", "updated", "modificado"]),
          ) ?? new Date().toISOString(),
      };
    })
    .filter((subscription): subscription is PushSubscriptionRecord =>
      Boolean(subscription),
    );
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

function buildPushSubscriptionRecord(
  input: PushSubscriptionInput,
  createdAt: string,
  id = createId("push"),
  updatedAt = createdAt,
): PushSubscriptionRecord {
  return {
    id,
    userId: input.userId,
    playerId: input.playerId,
    endpoint: input.endpoint,
    keys: input.keys,
    userAgent: input.userAgent,
    active: true,
    createdAt,
    updatedAt,
  };
}

function buildPushSubscriptionWritableRow(
  headers: string[],
  subscription: PushSubscriptionRecord,
) {
  const values: Record<string, string> = {
    id: subscription.id,
    subscription_id: subscription.id,
    user_id: subscription.userId,
    usuario_id: subscription.userId,
    player_id: subscription.playerId ?? "",
    jugador_id: subscription.playerId ?? "",
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    public_key: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    auth_secret: subscription.keys.auth,
    user_agent: subscription.userAgent ?? "",
    navegador: subscription.userAgent ?? "",
    activo: subscription.active ? "true" : "false",
    active: subscription.active ? "true" : "false",
    creado_en: subscription.createdAt,
    created_at: subscription.createdAt,
    actualizado_en: subscription.updatedAt,
    updated_at: subscription.updatedAt,
  };

  return headers.map((header) => values[header] ?? "");
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
    { key: "scenario", header: "Escenario" },
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
    scenario: transaction.scenario === "draft" ? "Borrador" : "Real",
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

function calculateExpectedFeeIncomeForCashFlow(
  data: FeeCalculatorData,
  activePlayersFromDirectory: number,
) {
  const calculatedTotal = data.playerCalculations.reduce(
    (sum, calculation) => sum + calculation.finalQuota,
    0,
  );
  const calculatedPlayers = data.playerCalculations.length;
  const adjustedQuota = data.summary.baseQuota;
  const activePlayersFromCalculator =
    data.players.filter((player) => player.status === "active").length ||
    data.summary.players;
  const expectedPlayers = Math.max(
    activePlayersFromCalculator,
    activePlayersFromDirectory,
    data.summary.players,
  );

  if (adjustedQuota > 0 && expectedPlayers > calculatedPlayers) {
    return calculatedTotal + (expectedPlayers - calculatedPlayers) * adjustedQuota;
  }

  return calculatedTotal;
}

function buildCashFlowData({
  period,
  transactions,
  draftTransactions,
  feeIncomeByPeriod,
  status,
  message,
  cachedAt,
  revalidateSeconds,
}: {
  period: string;
  transactions: CashFlowTransactionRecord[];
  draftTransactions: CashFlowTransactionRecord[];
  feeIncomeByPeriod: Map<string, number>;
  status: CashFlowData["source"]["status"];
  message: string;
  cachedAt: string;
  revalidateSeconds: number;
}): CashFlowData {
  const realScenario = buildCashFlowScenarioData({
    period,
    scenario: "real",
    transactions,
    feeIncomeByPeriod,
  });
  const draftScenario = buildCashFlowScenarioData({
    period,
    scenario: "draft",
    transactions: draftTransactions,
    feeIncomeByPeriod,
  });

  return {
    ...realScenario,
    period,
    draft: draftScenario,
    source: {
      provider: "google-sheets",
      status,
      message,
      cachedAt,
      revalidateSeconds,
    },
  };
}

function buildCashFlowScenarioData({
  period,
  scenario,
  transactions,
  feeIncomeByPeriod,
}: {
  period: string;
  scenario: CashFlowScenario;
  transactions: CashFlowTransactionRecord[];
  feeIncomeByPeriod: Map<string, number>;
}): CashFlowScenarioData {
  const projectionPeriods = getCashFlowProjectionPeriods(period);
  const annualPeriods = getYearPeriods(period);
  const chartPeriods = Array.from(
    new Set([...projectionPeriods, ...annualPeriods]),
  ).sort();
  const ledgerPeriods = getCashFlowLedgerPeriods(period);
  const expandedTransactions = expandCashFlowTransactions(transactions, ledgerPeriods);
  const feeTransactions = buildFeeIncomeTransactions(feeIncomeByPeriod);
  const projectedTransactions = [...expandedTransactions, ...feeTransactions];
  const monthlySeries = buildCashFlowMonthlySeries(projectedTransactions, chartPeriods);
  const monthlyOpeningBalance = calculateCashFlowOpeningBalance(
    projectedTransactions,
    projectionPeriods[0] ?? period,
  );
  const annualOpeningBalance = calculateCashFlowOpeningBalance(
    projectedTransactions,
    annualPeriods[0] ?? period,
  );
  const currentManualTransactions = expandedTransactions.filter(
    (transaction) => transaction.period === period,
  );
  const expectedFeeIncome = feeIncomeByPeriod.get(period) ?? 0;
  const additionalIncome = sumCashFlow(currentManualTransactions, "income");
  const currentIncome = expectedFeeIncome + additionalIncome;
  const currentExpenses = sumCashFlow(currentManualTransactions, "expense");
  const currentBalance = currentIncome - currentExpenses;
  const currentOpeningBalance = calculateCashFlowOpeningBalance(
    projectedTransactions,
    period,
  );
  const currentCashBalance = currentOpeningBalance + currentBalance;
  const isDraft = scenario === "draft";

  return {
    scenario,
    metrics: buildCashFlowMetrics({
      currentIncome,
      currentExpenses,
      currentBalance,
      currentCashBalance,
      currentPeriod: period,
      expectedFeeIncome,
      additionalIncome,
    }),
    charts: {
      monthly: buildCashFlowMonthlyChart(
        projectedTransactions,
        period,
        monthlySeries,
        projectionPeriods,
        monthlyOpeningBalance,
      ),
      annual: buildCashFlowMonthlyChart(
        projectedTransactions,
        period,
        monthlySeries,
        annualPeriods,
        annualOpeningBalance,
      ),
      monthlySeries,
      conceptBreakdown: buildCashFlowConceptBreakdown(projectedTransactions, period),
      matrixRows: buildCashFlowMatrixRows(projectedTransactions, annualPeriods),
    },
    transactions,
    expectedFeeIncome,
    additionalIncome,
    additionalExpenses: currentExpenses,
    emptyState: {
      title: isDraft ? "Cash Flow borrador" : "Cash Flow",
      description: isDraft
        ? "Escenario hipotetico para probar ingresos y gastos sin tocar el cashflow real."
        : "Vista financiera de cuotas esperadas, ingresos, gastos, balance y saldo.",
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
  const realScenario = buildFallbackCashFlowScenarioData(period, "real");
  const draftScenario = buildFallbackCashFlowScenarioData(period, "draft");

  return {
    ...realScenario,
    period,
    draft: draftScenario,
    source: {
      provider: "google-sheets",
      status,
      message,
      cachedAt,
      revalidateSeconds,
    },
  };
}

function buildFallbackCashFlowScenarioData(
  period: string,
  scenario: CashFlowScenario,
): CashFlowScenarioData {
  return {
    scenario,
    metrics: buildCashFlowMetrics({
      currentIncome: 0,
      currentExpenses: 0,
      currentBalance: 0,
      currentCashBalance: 0,
      currentPeriod: period,
      expectedFeeIncome: 0,
      additionalIncome: 0,
    }),
    charts: {
      monthly: buildCashFlowMonthlyChart([], period, []),
      annual: buildCashFlowMonthlyChart([], period, [], getYearPeriods(period)),
      monthlySeries: [],
      conceptBreakdown: [],
      matrixRows: [],
    },
    transactions: [],
    expectedFeeIncome: 0,
    additionalIncome: 0,
    additionalExpenses: 0,
    emptyState: {
      title:
        scenario === "draft" ? "Cash Flow borrador sin datos" : "Cash Flow sin datos",
      description:
        scenario === "draft"
          ? "Crea movimientos hipoteticos para armar una proyeccion borrador."
          : "Configura la hoja CashFlow para ver informacion financiera.",
    },
  };
}

function buildCashFlowMetrics({
  currentIncome,
  currentExpenses,
  currentBalance,
  currentCashBalance,
  currentPeriod,
  expectedFeeIncome,
  additionalIncome,
}: {
  currentIncome: number;
  currentExpenses: number;
  currentBalance: number;
  currentCashBalance: number;
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
      value: formatCurrency(currentCashBalance),
      detail: `Saldo final de ${formatPeriodLabel(currentPeriod)}`,
      tone: currentCashBalance < 0 ? "danger" : "neutral",
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
  periods = getCashFlowProjectionPeriods(selectedPeriod),
  openingCashBalance = 0,
): CashFlowMonthlyPoint[] {
  const expenseSeriesKeys = new Set(expenseSeries.map((series) => series.key));
  const hasOtherExpenses = expenseSeriesKeys.has(otherExpensesKey);
  let cashBalance = openingCashBalance;

  return periods.map((period) => {
    const periodTransactions = transactions.filter(
      (transaction) => transaction.period === period,
    );
    const feeIncome = periodTransactions
      .filter(
        (transaction) =>
          transaction.source === "fee-calculator" && transaction.type === "income",
      )
      .reduce((total, transaction) => total + transaction.amount, 0);
    const additionalIncome = sumCashFlow(periodTransactions, "income") - feeIncome;
    const ingresos = sumCashFlow(periodTransactions, "income");
    const gastos = sumCashFlow(periodTransactions, "expense");
    const balance = ingresos - gastos;
    const openingCashBalance = cashBalance;
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
          expenseValues[targetKey] += transaction.amount;
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
      openingCashBalance,
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
        transaction.source === "fee-calculator" && transaction.type === "income"
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

function buildCashFlowMatrixRows(
  transactions: CashFlowTransactionRecord[],
  periods: string[],
): CashFlowMatrixRow[] {
  const valuesByKey = transactions.reduce<
    Map<
      string,
      {
        concept: string;
        type: CashFlowTransactionType;
        values: Record<string, number>;
      }
    >
  >((rows, transaction) => {
    if (!periods.includes(transaction.period)) {
      return rows;
    }

    const concept =
      transaction.source === "fee-calculator" && transaction.type === "income"
        ? "Cuotas jugadores"
        : transaction.concept;
    const key = `${transaction.type}:${normalizeHeader(concept) || "sin_concepto"}`;
    const current = rows.get(key) ?? {
      concept,
      type: transaction.type,
      values: Object.fromEntries(periods.map((period) => [period, 0])),
    };

    current.values[transaction.period] =
      (current.values[transaction.period] ?? 0) + transaction.amount;
    rows.set(key, current);

    return rows;
  }, new Map());

  return Array.from(valuesByKey.values()).sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === "income" ? -1 : 1;
    }

    if (left.concept === "Cuotas jugadores") {
      return -1;
    }

    if (right.concept === "Cuotas jugadores") {
      return 1;
    }

    const leftTotal = periods.reduce(
      (total, period) => total + (left.values[period] ?? 0),
      0,
    );
    const rightTotal = periods.reduce(
      (total, period) => total + (right.values[period] ?? 0),
      0,
    );

    return rightTotal - leftTotal || left.concept.localeCompare(right.concept, "es");
  });
}

function getCashFlowExpenseKey(concept: string) {
  return `expense_${normalizeHeader(concept) || "sin_concepto"}`;
}

function calculateCashFlowOpeningBalance(
  transactions: CashFlowTransactionRecord[],
  firstPeriod: string,
) {
  return transactions
    .filter((transaction) => transaction.period < firstPeriod)
    .reduce((total, transaction) => {
      return (
        total + (transaction.type === "income" ? transaction.amount : -transaction.amount)
      );
    }, 0);
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
      scenario: "real",
    }));
}

function buildFeeCalculatorOperatingCostCashFlowTransactions({
  costs,
  actuals,
  sourcePeriods,
  targetPeriods,
}: {
  costs: FeeCalculatorCost[];
  actuals: FeeCalculatorActual[];
  sourcePeriods: string[];
  targetPeriods: Set<string>;
}): CashFlowTransactionRecord[] {
  return sourcePeriods
    .flatMap((sourcePeriod) =>
      costs
        .filter((cost) => isCostActiveForPeriod(cost, sourcePeriod))
        .flatMap((cost) => {
          const autoActualKind = getAutoActualCostKind(cost);

          if (autoActualKind !== "court" && autoActualKind !== "coach") {
            return [];
          }

          const actualUnits = findActualUnitsForCost(cost, costs, actuals, sourcePeriod);

          if (typeof actualUnits !== "number" || actualUnits <= 0) {
            return [];
          }

          const paymentPeriod =
            autoActualKind === "coach"
              ? addMonthsToPeriod(sourcePeriod, 1)
              : sourcePeriod;

          if (!targetPeriods.has(paymentPeriod)) {
            return [];
          }

          const amount =
            findActualAmountForCost(cost, costs, actuals, sourcePeriod) ??
            cost.amount * actualUnits;

          if (amount <= 0) {
            return [];
          }

          const concept = autoActualKind === "coach" ? "Horas DT reales" : "Cancha real";
          const unitLabel = autoActualKind === "coach" ? "horas" : "canchas";
          const paymentRule =
            autoActualKind === "coach"
              ? "Pago a mes vencido."
              : "Pago en el mes del partido.";

          return {
            id: `fee-calculator-operating-${autoActualKind}-${cost.id}-${sourcePeriod}`,
            date: `${paymentPeriod}-01`,
            period: paymentPeriod,
            type: "expense",
            concept,
            amount,
            repeatsMonthly: false,
            startPeriod: paymentPeriod,
            endPeriod: paymentPeriod,
            notes: `${paymentRule} ${formatPeriodLabel(sourcePeriod)}: ${formatInteger(actualUnits)} ${unitLabel}. Monto real: ${formatCurrency(amount)}.`,
            active: true,
            source: "fee-calculator",
            scenario: "real",
          } satisfies CashFlowTransactionRecord;
        }),
    )
    .sort((left, right) => {
      const dateComparison = (left.date ?? "").localeCompare(right.date ?? "");

      return dateComparison || left.concept.localeCompare(right.concept, "es");
    });
}

function getCashFlowProjectionPeriods(period: string) {
  return Array.from(new Set([...getLastPeriods(12), period])).sort();
}

function getCashFlowChartPeriods(period: string) {
  return Array.from(
    new Set([...getCashFlowProjectionPeriods(period), ...getYearPeriods(period)]),
  ).sort();
}

function getCashFlowLedgerPeriods(period: string) {
  const chartPeriods = getCashFlowChartPeriods(period);
  const firstChartPeriod = chartPeriods[0] ?? period;
  const historyEndPeriod = getPreviousPeriod(firstChartPeriod);
  const historyStartPeriod = addMonthsToPeriod(firstChartPeriod, -12);
  const historyPeriods =
    historyStartPeriod <= historyEndPeriod
      ? getPeriodsBetween(historyStartPeriod, historyEndPeriod)
      : [];

  return Array.from(new Set([...historyPeriods, ...chartPeriods])).sort();
}

function getYearPeriods(period: string) {
  const [year] = period.split("-");

  return Array.from({ length: 12 }, (_, index) => {
    return `${year}-${String(index + 1).padStart(2, "0")}`;
  });
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
          dni: "",
          birthDate: "",
          position: "",
          secondPosition: "",
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

function buildPlayerFromFees(
  playerId: string,
  fees: FeeRecord[],
  lookupKeys = buildPlayerLookupKeys(playerId),
): PlayerRecord | null {
  const fee = fees.find((candidate) =>
    lookupSetsIntersect(buildPlayerLookupKeys(candidate.playerId), lookupKeys),
  );

  if (!fee) {
    return null;
  }

  return {
    id: fee.playerId,
    name: fee.playerId,
    category: "Sin categoria",
    dni: "",
    birthDate: "",
    position: "",
    secondPosition: "",
    phone: "-",
    email: "",
    monthlyFee: 0,
    observations: "-",
    status: "",
  };
}

function playerMatchesLookup(player: PlayerRecord, lookupKeys: Set<string>) {
  return lookupSetsIntersect(
    buildPlayerLookupKeys(player.id, player.name, player.email, player.phone),
    lookupKeys,
  );
}

function buildPlayerProfile(
  player: PlayerRecord,
  fees: FeeRecord[],
  year: number,
  feeCalculations: FeePlayerCalculation[] = [],
  matchSummaries = new Map<string, PlayerMonthMatchSummary>(),
  quotaDefinitions = new Map<
    string,
    { status: "defined" | "undefined"; reason: string }
  >(),
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
    months: buildYearMonths(
      playerFees,
      year,
      feeCalculations,
      matchSummaries,
      quotaDefinitions,
    ),
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

function buildYearMonths(
  fees: FeeRecord[],
  year: number,
  feeCalculations: FeePlayerCalculation[] = [],
  matchSummaries = new Map<string, PlayerMonthMatchSummary>(),
  quotaDefinitions = new Map<
    string,
    { status: "defined" | "undefined"; reason: string }
  >(),
): PlayerYearMonth[] {
  return Array.from({ length: 12 }, (_, index) => {
    const period = `${year}-${String(index + 1).padStart(2, "0")}`;
    const fee = fees.find((candidate) => candidate.period === period);
    const calculation = feeCalculations.find(
      (candidate) => candidate.currentPeriod === period,
    );
    const amountValue =
      calculation?.finalQuota ?? (fee?.amount && fee.amount > 0 ? fee.amount : 0);
    const amountSource = calculation
      ? "calculator"
      : fee?.amount && fee.amount > 0
        ? "payments"
        : "none";
    const quotaDefinition = quotaDefinitions.get(period);
    const quotaStatus =
      quotaDefinition?.status ??
      (amountSource === "calculator" || amountSource === "payments"
        ? "defined"
        : "undefined");
    const quotaStatusReason =
      quotaDefinition?.reason ||
      (quotaStatus === "undefined" ? "Falta definir la cuota de este mes." : "");

    return {
      period,
      label: formatFullMonthLabel(period),
      status: fee?.status === "paid" ? "paid" : "unpaid",
      quotaStatus,
      quotaStatusReason,
      amount: amountValue > 0 ? formatCurrency(amountValue) : "-",
      amountValue,
      amountSource,
      dueDate: fee?.dueDate ? formatDate(fee.dueDate) : formatDate(`${period}-10`),
      paidAt: fee?.paidAt ? formatDate(fee.paidAt) : "-",
      matchSummary: matchSummaries.get(period),
    };
  });
}

function buildPlayerMonthMatchSummary(
  evaluatedPeriod: string,
  calculation: FeePlayerCalculation,
  summary?: FeePlayerMatchSummary,
): PlayerMonthMatchSummary {
  return {
    evaluatedPeriod,
    totalMatches: summary?.totalMatches ?? calculation.totalMatches,
    playedMatches: summary?.playedMatches ?? calculation.playedMatches,
    attendanceRate: summary?.attendanceRate ?? calculation.attendanceRate,
    presentMatches: (summary?.matches ?? calculation.matches).map((match) => ({
      ...match,
      attended: true,
    })),
    absentMatches: (summary?.absentMatches ?? []).map((match) => ({
      ...match,
      attended: false,
    })),
  };
}

function feePlayerCalculationMatchesLookup(
  calculation: FeePlayerCalculation,
  lookupKeys: Set<string>,
) {
  return lookupSetsIntersect(
    buildPlayerLookupKeys(calculation.playerId, calculation.playerName),
    lookupKeys,
  );
}

function feePlayerMatchSummaryMatchesLookup(
  summary: FeePlayerMatchSummary,
  lookupKeys: Set<string>,
) {
  return lookupSetsIntersect(
    buildPlayerLookupKeys(summary.playerId, summary.playerName),
    lookupKeys,
  );
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

function buildPlayerLookupKeys(...values: Array<string | undefined | null>) {
  const keys = new Set<string>();

  for (const value of values) {
    addPlayerLookupKeys(keys, value);
  }

  return keys;
}

function addPlayerLookupKeys(keys: Set<string>, value?: string | null) {
  const rawValue = String(value ?? "").trim();

  if (!rawValue) {
    return;
  }

  addPlayerLookupKeyVariants(keys, rawValue);

  try {
    const decodedValue = decodeURIComponent(rawValue);

    if (decodedValue !== rawValue) {
      addPlayerLookupKeyVariants(keys, decodedValue);
    }
  } catch {
    // The value can already be a plain ID instead of a URL-encoded segment.
  }
}

function addPlayerLookupKeyVariants(keys: Set<string>, value: string) {
  const trimmedValue = value.trim();
  const normalizedName = normalizeClubPlayerName(trimmedValue);
  const headerKey = normalizeHeader(trimmedValue);

  for (const key of [
    trimmedValue,
    trimmedValue.toLowerCase(),
    trimmedValue.replace(/_/g, "-"),
    trimmedValue.replace(/-/g, "_"),
    normalizedName,
    normalizeHeader(normalizedName),
    createClubPlayerId(normalizedName),
    headerKey,
    headerKey.replace(/_/g, "-"),
  ]) {
    if (key) {
      keys.add(key);
    }
  }
}

function lookupSetsIntersect(first: Set<string>, second: Set<string>) {
  for (const key of first) {
    if (second.has(key)) {
      return true;
    }
  }

  return false;
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
    assignedPlayerIds: normalizeAssignedPlayerIds(input.assignedPlayerIds),
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
    scenario: input.scenario ?? "real",
  };
}

function normalizeFeeCalculatorActualInput(
  input: UpdateFeeCalculatorActualInput,
): Omit<FeeCalculatorActual, "id" | "updatedAt"> {
  return {
    costId: input.costId.trim(),
    period: input.period,
    actualUnits: Math.max(Number(input.actualUnits), 0),
    actualAmount:
      typeof input.actualAmount === "number" && Number.isFinite(input.actualAmount)
        ? Math.max(input.actualAmount, 0)
        : undefined,
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
    escenario: transaction.scenario,
    scenario: transaction.scenario,
    tipo_escenario: transaction.scenario,
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
    jugadores_asignados:
      cost.assignedPlayerIds.length > 0
        ? cost.assignedPlayerIds.join(", ")
        : "todos_activos",
    assigned_player_ids: cost.assignedPlayerIds.join(", "),
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
    monto_real: actual.actualAmount ?? "",
    importe_real: actual.actualAmount ?? "",
    actual_amount: actual.actualAmount ?? "",
    total_real: actual.actualAmount ?? "",
    monto_pagado: actual.actualAmount ?? "",
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

function appendMissingWritableHeaders(headers: string[], fallback: string[]) {
  const nextHeaders = [...headers];

  for (const header of fallback) {
    if (!nextHeaders.includes(header)) {
      nextHeaders.push(header);
    }
  }

  return nextHeaders;
}

function splitPlayerNames(value: string) {
  return value
    .split(/[,;\n]/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function uniquePlayerNames(players: string[]) {
  const seen = new Set<string>();

  return players.filter((player) => {
    const key = normalizeClubPlayerName(player);

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function parseAssignedPlayerIds(value: string) {
  const normalized = normalizeText(value);

  if (
    !normalized ||
    ["todos", "todos activos", "todos_activos", "all", "all_active"].includes(normalized)
  ) {
    return [];
  }

  return normalizeAssignedPlayerIds(splitPlayerNames(value));
}

function normalizeAssignedPlayerIds(values: string[] = []) {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter(Boolean)
        .filter((value) => {
          const normalized = normalizeText(value);

          return ![
            "todos",
            "todos activos",
            "todos_activos",
            "all",
            "all_active",
          ].includes(normalized);
        }),
    ),
  );
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

function calculatePlayerAppBaseQuotaForPeriod(
  costs: FeeCalculatorCost[],
  actuals: FeeCalculatorActual[],
  period: string,
  player: PlayerRecord,
) {
  const previousPeriod = getPreviousPeriod(period);
  const plannedQuota = calculatePlayerBaseQuotaForPeriod(
    costs,
    actuals,
    period,
    "forecast",
    player,
  );
  const previousPlannedQuota = calculatePlayerBaseQuotaForPeriod(
    costs,
    actuals,
    previousPeriod,
    "forecast",
    player,
  );
  const previousActualQuota = calculatePlayerBaseQuotaForPeriod(
    costs,
    actuals,
    previousPeriod,
    "actual",
    player,
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

      const splitBetween = getCostSplitBetween(cost);
      const forecastUnits = cost.forecastUnits;
      const unitDifference = actualUnits - forecastUnits;
      const forecastAmount = cost.amount * forecastUnits;
      const actualAmount =
        findActualAmountForCost(cost, costs, actuals, period) ??
        cost.amount * actualUnits;
      const forecastShare = forecastAmount / splitBetween;
      const actualShare = actualAmount / splitBetween;
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
        forecastAmount,
        actualAmount,
        splitBetween,
        forecastShare,
        actualShare,
        variance,
      } satisfies FeeCalculatorAdjustment;
    })
    .filter((adjustment): adjustment is FeeCalculatorAdjustment => Boolean(adjustment))
    .sort((left, right) => left.name.localeCompare(right.name, "es"));
}

function getFeeCalculatorQuotaDefinition({
  activeCosts,
  actuals,
  currentPeriod,
  effectiveActuals,
  previousPeriod,
  previousPeriodMatches,
}: {
  activeCosts: FeeCalculatorCost[];
  actuals: FeeCalculatorActual[];
  currentPeriod: string;
  effectiveActuals: FeeCalculatorActual[];
  previousPeriod: string;
  previousPeriodMatches: MatchRecord[];
}): { status: "defined" | "undefined"; reasons: string[] } {
  const reasons: string[] = [];
  const currentCosts = activeCosts.filter((cost) =>
    isCostActiveForPeriod(cost, currentPeriod),
  );

  if (currentCosts.length === 0) {
    reasons.push("Faltan gastos definidos para este mes.");
  }

  const previousCosts = activeCosts.filter((cost) =>
    isCostActiveForPeriod(cost, previousPeriod),
  );

  if (previousCosts.length === 0) {
    return {
      status: reasons.length > 0 ? "undefined" : "defined",
      reasons,
    };
  }

  const requiredActualKinds = [
    { kind: "court" as const, label: "cancha" },
    { kind: "coach" as const, label: "DT" },
  ];

  for (const required of requiredActualKinds) {
    const cost = previousCosts.find(
      (candidate) => getAutoActualCostKind(candidate) === required.kind,
    );

    if (!cost) {
      reasons.push(`Falta el costo de ${required.label} del mes anterior.`);
      continue;
    }

    const explicitActual = findActualForCost(cost, activeCosts, actuals, previousPeriod);
    const effectiveActual = findActualForCost(
      cost,
      activeCosts,
      effectiveActuals,
      previousPeriod,
    );
    const canUseInferredActual = previousPeriodMatches.length > 0 && effectiveActual;

    if (!explicitActual && !canUseInferredActual) {
      reasons.push(`Falta cargar el ajuste real de ${required.label}.`);
    }
  }

  return {
    status: reasons.length > 0 ? "undefined" : "defined",
    reasons,
  };
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
  const total =
    mode === "actual" && typeof actualUnits === "number"
      ? (findActualAmountForCost(cost, costs, actuals, period) ?? cost.amount * units)
      : cost.amount * units;

  return total / getCostSplitBetween(cost);
}

function calculatePlayerCostVarianceForPeriod(
  costs: FeeCalculatorCost[],
  actuals: FeeCalculatorActual[],
  period: string,
  player: PlayerRecord,
) {
  return costs
    .filter((cost) => isCostActiveForPeriod(cost, period))
    .reduce((total, cost) => {
      const actualUnits = findActualUnitsForCost(cost, costs, actuals, period);

      if (typeof actualUnits !== "number") {
        return total;
      }

      const actualShare = calculatePlayerCostShare(
        cost,
        costs,
        actuals,
        period,
        "actual",
        player,
      );
      const forecastShare = calculatePlayerCostShare(
        cost,
        costs,
        actuals,
        period,
        "forecast",
        player,
      );

      return total + actualShare - forecastShare;
    }, 0);
}

function calculatePlayerBaseQuotaForPeriod(
  costs: FeeCalculatorCost[],
  actuals: FeeCalculatorActual[],
  period: string,
  mode: "forecast" | "actual",
  player: PlayerRecord,
) {
  return costs
    .filter((cost) => isCostActiveForPeriod(cost, period))
    .reduce(
      (total, cost) =>
        total + calculatePlayerCostShare(cost, costs, actuals, period, mode, player),
      0,
    );
}

function calculatePlayerCostShare(
  cost: FeeCalculatorCost,
  costs: FeeCalculatorCost[],
  actuals: FeeCalculatorActual[],
  period: string,
  mode: "forecast" | "actual",
  player: PlayerRecord,
) {
  if (!isCostAssignedToPlayer(cost, player)) {
    return 0;
  }

  const actualUnits = findActualUnitsForCost(cost, costs, actuals, period);
  const units =
    mode === "actual" && typeof actualUnits === "number"
      ? actualUnits
      : cost.forecastUnits;
  const total =
    mode === "actual" && typeof actualUnits === "number"
      ? (findActualAmountForCost(cost, costs, actuals, period) ?? cost.amount * units)
      : cost.amount * units;

  return total / getCostSplitBetween(cost);
}

function getCostSplitBetween(cost: FeeCalculatorCost) {
  return Math.max(cost.splitBetween, 1);
}

function isCostAssignedToPlayer(cost: FeeCalculatorCost, player: PlayerRecord) {
  if (cost.assignedPlayerIds.length === 0) {
    return true;
  }

  const lookupKeys = buildPlayerLookupKeys(
    player.id,
    player.name,
    player.email,
    player.phone,
  );

  return cost.assignedPlayerIds.some((assignedPlayerId) =>
    lookupSetsIntersect(lookupKeys, buildPlayerLookupKeys(assignedPlayerId)),
  );
}

function getActivePlayersForPeriod(
  players: PlayerRecord[],
  playerStatuses: FeeCalculatorPlayerStatusRecord[],
  period: string,
) {
  const playerStatusMap = buildFeeCalculatorPlayerStatusMap(playerStatuses, period);

  return players.filter(
    (player) =>
      mapPlayerToFeeCalculatorPlayer(player, playerStatusMap).status === "active",
  );
}

function wasPlayerInactiveForPeriod(
  player: PlayerRecord,
  playerStatuses: FeeCalculatorPlayerStatusRecord[],
  period: string,
) {
  const playerStatusMap = buildFeeCalculatorPlayerStatusMap(playerStatuses, period);

  return mapPlayerToFeeCalculatorPlayer(player, playerStatusMap).status === "inactive";
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
      actualAmount: cost.amount * inferredUnits,
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
  return findActualForCost(cost, costs, actuals, period)?.actualUnits;
}

function findActualAmountForCost(
  cost: FeeCalculatorCost,
  costs: FeeCalculatorCost[],
  actuals: FeeCalculatorActual[],
  period: string,
) {
  const actual = findActualForCost(cost, costs, actuals, period);

  if (!actual) {
    return undefined;
  }

  if (typeof actual.actualAmount === "number" && Number.isFinite(actual.actualAmount)) {
    return Math.max(actual.actualAmount, 0);
  }

  return cost.amount * actual.actualUnits;
}

function findActualForCost(
  cost: FeeCalculatorCost,
  costs: FeeCalculatorCost[],
  actuals: FeeCalculatorActual[],
  period: string,
) {
  const exactActual = actuals.find(
    (actual) => actual.costId === cost.id && actual.period === period,
  );

  if (exactActual) {
    return exactActual;
  }

  if (!getAutoActualCostKind(cost)) {
    return undefined;
  }

  return actuals.find((actual) => {
    if (actual.period !== period || actual.costId === cost.id) {
      return false;
    }

    const actualCost = costs.find((candidate) => candidate.id === actual.costId);

    return isCompatibleAutoActualCost(cost, actualCost);
  });
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

function getFeeCalculatorHistoryStartPeriod(
  costs: FeeCalculatorCost[],
  actuals: FeeCalculatorActual[],
  targetPeriod: string,
) {
  const dataPeriods = [
    ...costs.map((cost) => cost.startPeriod),
    ...actuals.map((actual) => actual.period),
  ]
    .filter((period) => period <= targetPeriod)
    .sort();

  return dataPeriods[0] ?? targetPeriod;
}

function buildPeriodRange(startPeriod: string, endPeriod: string) {
  const [startYear, startMonth] = startPeriod.split("-").map(Number);
  const [endYear, endMonth] = endPeriod.split("-").map(Number);
  const cursor = new Date(startYear, startMonth - 1, 1);
  const end = new Date(endYear, endMonth - 1, 1);
  const periods: string[] = [];

  while (cursor <= end && periods.length < 240) {
    periods.push(getCurrentPeriod(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return periods.length > 0 ? periods : [endPeriod];
}

function buildYearPeriods(year: number) {
  return Array.from(
    { length: 12 },
    (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`,
  );
}

function unquoteSheetTitle(title: string) {
  return title.replace(/^'|'$/g, "");
}

function monthNameToNumber(value: string) {
  const month = normalizeText(value);

  if (/^\d{1,2}$/.test(month)) {
    const parsed = Number(month);

    return parsed >= 1 && parsed <= 12 ? parsed : undefined;
  }

  const months = [
    ["enero", "ene", "january", "jan"],
    ["febrero", "feb", "february"],
    ["marzo", "mar", "march"],
    ["abril", "abr", "april", "apr"],
    ["mayo", "may"],
    ["junio", "jun", "june"],
    ["julio", "jul", "july"],
    ["agosto", "ago", "august", "aug"],
    ["septiembre", "setiembre", "sep", "september"],
    ["octubre", "oct", "october"],
    ["noviembre", "nov", "november"],
    ["diciembre", "dic", "december", "dec"],
  ];
  const index = months.findIndex((aliases) =>
    aliases.some((candidate) => month.startsWith(candidate)),
  );

  return index >= 0 ? index + 1 : undefined;
}

function parseClubDateTime(value: string) {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  const isoDateTime = trimmed.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::\d{2})?)?/,
  );

  if (isoDateTime) {
    const [, year, month, day, hour, minute] = isoDateTime;
    const date = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;

    return hour && minute ? `${date}T${hour.padStart(2, "0")}:${minute}` : date;
  }

  const match = trimmed
    .trim()
    .match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?)?/);

  if (match) {
    const [, day, month, rawYear, hour, minute] = match;
    const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
    const date = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;

    return hour && minute ? `${date}T${hour.padStart(2, "0")}:${minute}` : date;
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

function normalizeCashFlowScenario(value: string): CashFlowScenario {
  const scenario = normalizeText(value);

  if (
    [
      "draft",
      "borrador",
      "hipotetico",
      "hipotetica",
      "proyeccion",
      "simulacion",
    ].includes(scenario)
  ) {
    return "draft";
  }

  return "real";
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

function parseNumericValue(value: string) {
  const parsed = Number(String(value || "").replace(",", "."));

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
  const trimmed = String(value ?? "").trim();

  if (!trimmed) {
    return undefined;
  }

  const exactPeriod = trimmed.match(/^(\d{4})[-/](\d{1,2})$/);

  if (exactPeriod) {
    const [, year, month] = exactPeriod;

    return `${year}-${month.padStart(2, "0")}`;
  }

  const isoDatePeriod = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);

  if (isoDatePeriod) {
    const [, year, month] = isoDatePeriod;

    return `${year}-${month.padStart(2, "0")}`;
  }

  const numericDatePeriod = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);

  if (numericDatePeriod) {
    const [, first, second, rawYear] = numericDatePeriod;
    const firstNumber = Number(first);
    const secondNumber = Number(second);
    const year = normalizeYear(rawYear);
    const month = firstNumber > 12 || secondNumber > 1 ? secondNumber : firstNumber;

    if (year && month >= 1 && month <= 12) {
      return `${year}-${String(month).padStart(2, "0")}`;
    }
  }

  const monthYear = trimmed.match(/^(\d{1,2})[-/](\d{4})$/);

  if (monthYear) {
    const [, month, year] = monthYear;

    return `${year}-${month.padStart(2, "0")}`;
  }

  const normalized = normalizeText(trimmed)
    .replace(/\bde\b/g, " ")
    .replace(/[.,/_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const namedMonth = normalized.match(
    /(?:^|\s)([a-z]+)\.?\s+(\d{2,4})(?:\s|$)|(?:^|\s)(\d{2,4})\s+([a-z]+)\.?(?:\s|$)/,
  );

  if (namedMonth) {
    const rawMonth = namedMonth[1] ?? namedMonth[4] ?? "";
    const rawYear = namedMonth[2] ?? namedMonth[3] ?? "";
    const month = monthNameToNumber(rawMonth);
    const year = normalizeYear(rawYear);

    if (month && year) {
      return `${year}-${String(month).padStart(2, "0")}`;
    }
  }

  const numericSerial = Number(trimmed);

  if (/^\d+(\.\d+)?$/.test(trimmed) && numericSerial > 20000 && numericSerial < 80000) {
    const serialDate = new Date(Date.UTC(1899, 11, 30 + Math.floor(numericSerial)));

    return `${serialDate.getUTCFullYear()}-${String(serialDate.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  const parsedDate = parseDate(trimmed);

  return getPeriodFromDate(parsedDate);
}

function normalizeYear(value: string) {
  if (!/^\d{2,4}$/.test(value)) {
    return undefined;
  }

  return value.length === 2 ? `20${value}` : value;
}

function getCurrentPeriod(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getPeriodFromDate(value?: string) {
  if (!value) {
    return undefined;
  }

  const normalized = parseClubDateTime(value);

  if (!normalized) {
    return undefined;
  }

  const date = new Date(normalized.includes("T") ? normalized : `${normalized}T00:00:00`);

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

  if (role === "admin" || role === "treasurer" || role === "coach" || role === "player") {
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

  if (role === "admin" || role === "treasurer" || role === "coach" || role === "player") {
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

function parseCacheTtl(value?: string, fallback = DEFAULT_CACHE_TTL_SECONDS) {
  const parsed = Number(value ?? fallback);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
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

function getArgentinaTodayIsoDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
  }).formatToParts(new Date());
  const values = new Map(parts.map((part) => [part.type, part.value]));

  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function invalidateDashboardCache() {
  revalidateGoogleSheetsTag("google-sheets");
  revalidateGoogleSheetsTag("google-sheets:dashboard");
  revalidateGoogleSheetsTag("google-sheets:player-profile");
}

function invalidateSettingsCache() {
  revalidateGoogleSheetsTag("google-sheets");
  revalidateGoogleSheetsTag("google-sheets:settings");
}

function invalidateAccountCache() {
  revalidateGoogleSheetsTag("google-sheets");
  revalidateGoogleSheetsTag("google-sheets:accounts");
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
  revalidateGoogleSheetsTag("google-sheets:player-profile");
  revalidateGoogleSheetsTag("google-sheets:cash-flow");
}

function invalidateFeeCalculatorCache() {
  revalidateGoogleSheetsTag("google-sheets");
  revalidateGoogleSheetsTag("google-sheets:fee-calculator");
  revalidateGoogleSheetsTag("google-sheets:player-profile");
  revalidateGoogleSheetsTag("google-sheets:cash-flow");
}

function invalidateCashFlowCache() {
  revalidateGoogleSheetsTag("google-sheets");
  revalidateGoogleSheetsTag("google-sheets:cash-flow");
}

function invalidatePushSubscriptionCache() {
  revalidateGoogleSheetsTag("google-sheets");
  revalidateGoogleSheetsTag("google-sheets:push-subscriptions");
}

function invalidatePlayerOfMatchCache() {
  revalidateGoogleSheetsTag("google-sheets");
  revalidateGoogleSheetsTag("google-sheets:player-of-match");
}

function invalidateFixtureCache() {
  revalidateGoogleSheetsTag("google-sheets");
  revalidateGoogleSheetsTag("google-sheets:fixture");
}
