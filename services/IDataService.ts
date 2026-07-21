import type {
  CashFlowData,
  DashboardData,
  PlayerProfile,
  UpsertCashFlowTransactionInput,
  UpdatePlayerFeeStatusInput,
} from "@/types/dashboard";
import type { ExportData, ExportDataset } from "@/types/export";
import type {
  FeeCalculatorData,
  UpdateFeeCalculatorActualInput,
  UpdateFeeCalculatorPlayerStatusInput,
  UpdateFeeRefundPolicyInput,
  UpsertFeeCalculatorCostInput,
} from "@/types/fee-calculator";
import type {
  CreateAuditEventInput,
  CreateNotificationInput,
  CreateReminderJobInput,
  PremiumData,
  UpsertPaymentRecordInput,
} from "@/types/premium";
import type { PlayerDirectoryData, UpsertPlayerInput } from "@/types/players";
import type { AppSettingsData, UpdateAppSettingsInput } from "@/types/settings";

export interface IDataService {
  getAppSettings(): Promise<AppSettingsData>;
  updateAppSettings(input: UpdateAppSettingsInput): Promise<void>;
  getDashboardData(period?: string): Promise<DashboardData>;
  getCashFlowData(period?: string): Promise<CashFlowData>;
  upsertCashFlowTransaction(input: UpsertCashFlowTransactionInput): Promise<void>;
  deleteCashFlowTransaction(transactionId: string): Promise<void>;
  getPlayersData(): Promise<PlayerDirectoryData>;
  upsertPlayer(input: UpsertPlayerInput): Promise<void>;
  replacePlayers(players: UpsertPlayerInput[]): Promise<void>;
  deletePlayer(playerId: string): Promise<void>;
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
  getPremiumData(): Promise<PremiumData>;
  recordAuditEvent(input: CreateAuditEventInput): Promise<void>;
  createNotification(input: CreateNotificationInput): Promise<void>;
  markNotificationRead(notificationId: string): Promise<void>;
  createReminderJob(input: CreateReminderJobInput): Promise<void>;
  upsertPaymentRecord(input: UpsertPaymentRecordInput): Promise<void>;
}
