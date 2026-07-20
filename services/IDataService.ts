import type {
  CashFlowData,
  DashboardData,
  PlayerProfile,
  UpdatePlayerFeeStatusInput,
} from "@/types/dashboard";
import type { ExportData, ExportDataset } from "@/types/export";
import type {
  FeeCalculatorData,
  UpdateFeeCalculatorActualInput,
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
  getCashFlowData(): Promise<CashFlowData>;
  getPlayersData(): Promise<PlayerDirectoryData>;
  upsertPlayer(input: UpsertPlayerInput): Promise<void>;
  deletePlayer(playerId: string): Promise<void>;
  getFeeCalculatorData(period?: string): Promise<FeeCalculatorData>;
  upsertFeeCalculatorCost(input: UpsertFeeCalculatorCostInput): Promise<void>;
  deleteFeeCalculatorCost(costId: string): Promise<void>;
  updateFeeCalculatorActual(input: UpdateFeeCalculatorActualInput): Promise<void>;
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
