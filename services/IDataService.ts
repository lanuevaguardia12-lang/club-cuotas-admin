import type {
  AccountAuthOverride,
  AccountUser,
  AccountProfileData,
  CreateAccountUserInput,
  CreateFanAccountInput,
  UpdateAccountPasswordInput,
  UpdateAccountProfileInput,
} from "@/types/account";
import type { AuthUser } from "@/types/auth";
import type {
  CashFlowData,
  DashboardData,
  PlayerProfile,
  UpsertCashFlowTransactionInput,
  UpdatePlayerFeeStatusInput,
} from "@/types/dashboard";
import type { CoachRecordsData } from "@/types/coach-records";
import type { ExportData, ExportDataset } from "@/types/export";
import type {
  FeeCalculatorData,
  UpdateFeeCalculatorActualInput,
  UpdateFeeCalculatorPlayerStatusInput,
  UpdateFeeRefundPolicyInput,
  UpsertFeeCalculatorCostInput,
} from "@/types/fee-calculator";
import type {
  FixtureMatchScheduleOverride,
  UpdateFixtureMatchScheduleInput,
} from "@/types/fixture";
import type {
  CreateAuditEventInput,
  CreateNotificationInput,
  AppNotification,
  CreateReminderJobInput,
  PremiumData,
  PushSubscriptionInput,
  PushSubscriptionRecord,
  ReminderJob,
  UpdateReminderJobStatusInput,
  UpsertPaymentRecordInput,
} from "@/types/premium";
import type {
  PlayerOfMatchData,
  SubmitPlayerOfMatchVoteInput,
  UpdatePlayerOfMatchMatchInput,
} from "@/types/player-of-match";
import type { PlayerDirectoryData, UpsertPlayerInput } from "@/types/players";
import type { AppSettingsData, UpdateAppSettingsInput } from "@/types/settings";
import type { TeamsData, UpsertTeamProfileInput } from "@/types/teams";

export interface IDataService {
  getAppSettings(): Promise<AppSettingsData>;
  updateAppSettings(input: UpdateAppSettingsInput): Promise<void>;
  getAccountProfile(user: AuthUser): Promise<AccountProfileData>;
  updateAccountProfile(input: UpdateAccountProfileInput): Promise<void>;
  updateAccountPassword(input: UpdateAccountPasswordInput): Promise<void>;
  createAccountUser(input: CreateAccountUserInput): Promise<void>;
  createFanAccount(input: CreateFanAccountInput): Promise<void>;
  getAccountUsers(): Promise<AccountUser[]>;
  getAccountAuthOverride(
    userId: string,
    username: string,
  ): Promise<AccountAuthOverride | null>;
  getAccountAuthByUsername(username: string): Promise<AccountAuthOverride | null>;
  getDashboardData(period?: string): Promise<DashboardData>;
  getCashFlowData(period?: string): Promise<CashFlowData>;
  getCoachRecordsData(period?: string): Promise<CoachRecordsData>;
  upsertCashFlowTransaction(input: UpsertCashFlowTransactionInput): Promise<void>;
  deleteCashFlowTransaction(transactionId: string): Promise<void>;
  getPlayersData(): Promise<PlayerDirectoryData>;
  upsertPlayer(input: UpsertPlayerInput): Promise<void>;
  replacePlayers(players: UpsertPlayerInput[]): Promise<void>;
  deletePlayer(playerId: string): Promise<void>;
  getTeamsData(): Promise<TeamsData>;
  upsertTeamProfile(input: UpsertTeamProfileInput): Promise<void>;
  getFeeCalculatorData(period?: string): Promise<FeeCalculatorData>;
  upsertFeeCalculatorCost(input: UpsertFeeCalculatorCostInput): Promise<void>;
  deleteFeeCalculatorCost(costId: string): Promise<void>;
  resetFeeCalculatorCosts(): Promise<void>;
  updateFeeCalculatorActual(input: UpdateFeeCalculatorActualInput): Promise<void>;
  updateFeeCalculatorPlayerStatus(
    input: UpdateFeeCalculatorPlayerStatusInput,
  ): Promise<void>;
  updateFeeRefundPolicy(input: UpdateFeeRefundPolicyInput): Promise<void>;
  getExportData(dataset: ExportDataset): Promise<ExportData>;
  getPlayerProfile(playerId: string, year?: number): Promise<PlayerProfile | null>;
  updatePlayerFeeStatus(input: UpdatePlayerFeeStatusInput): Promise<void>;
  getFixtureMatchScheduleOverrides(): Promise<FixtureMatchScheduleOverride[]>;
  updateFixtureMatchSchedule(input: UpdateFixtureMatchScheduleInput): Promise<void>;
  getPlayerOfMatchData(
    voterUserId: string,
    voterPlayerId?: string,
  ): Promise<PlayerOfMatchData>;
  submitPlayerOfMatchVote(input: SubmitPlayerOfMatchVoteInput): Promise<void>;
  updatePlayerOfMatchMatch(input: UpdatePlayerOfMatchMatchInput): Promise<void>;
  getPremiumData(): Promise<PremiumData>;
  getNotifications(): Promise<AppNotification[]>;
  recordAuditEvent(input: CreateAuditEventInput): Promise<void>;
  createNotification(input: CreateNotificationInput): Promise<void>;
  markNotificationRead(notificationId: string): Promise<void>;
  markNotificationsRead(notificationIds: string[]): Promise<void>;
  getReminderJobs(): Promise<ReminderJob[]>;
  createReminderJob(input: CreateReminderJobInput): Promise<void>;
  updateReminderJobStatus(input: UpdateReminderJobStatusInput): Promise<void>;
  upsertPaymentRecord(input: UpsertPaymentRecordInput): Promise<void>;
  upsertPushSubscription(input: PushSubscriptionInput): Promise<void>;
  deletePushSubscription(endpoint: string, userId?: string): Promise<void>;
  getPushSubscriptions(): Promise<PushSubscriptionRecord[]>;
  getPushSubscriptionsForUser(userId: string): Promise<PushSubscriptionRecord[]>;
  getPushSubscriptionsForPlayer(playerId: string): Promise<PushSubscriptionRecord[]>;
}
