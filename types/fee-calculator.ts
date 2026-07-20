import type { DataSourceState } from "@/types/dashboard";

export type FeeCalculatorCostType = "fixed" | "court" | "coach" | "custom";

export interface FeeCalculatorCost {
  id: string;
  name: string;
  type: FeeCalculatorCostType;
  startPeriod: string;
  endPeriod: string;
  amount: number;
  repeatsMonthly: boolean;
  splitBetween: number;
  forecastUnits: number;
  notes: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FeeCalculatorActual {
  id: string;
  costId: string;
  period: string;
  actualUnits: number;
  notes: string;
  updatedAt: string;
}

export interface FeeRefundPolicyRule {
  fromPercent: number;
  toPercent: number;
  refundPercent: number;
}

export interface FeeMatchDetail {
  date: string;
  rival: string;
}

export interface FeePlayerMatchSummary {
  playerId: string;
  playerName: string;
  period: string;
  playedMatches: number;
  totalMatches: number;
  attendanceRate: number;
  matches: FeeMatchDetail[];
}

export interface FeePlayerCalculation {
  playerId: string;
  playerName: string;
  currentPeriod: string;
  previousPeriod: string;
  baseQuota: number;
  plannedCurrentQuota: number;
  previousBaseQuota: number;
  previousCostVariance: number;
  refundPercent: number;
  refundAmount: number;
  expenseCredit: number;
  finalQuota: number;
  attendanceRate: number;
  playedMatches: number;
  totalMatches: number;
  matches: FeeMatchDetail[];
}

export interface FeeCalculatorSummary {
  period: string;
  previousPeriod: string;
  plannedCurrentQuota: number;
  previousBaseQuota: number;
  previousCostVariance: number;
  baseQuota: number;
  activeCosts: number;
  players: number;
  totalMatchesPreviousPeriod: number;
  totalLocalMatchesPreviousPeriod: number;
  coachHoursPreviousPeriod: number;
}

export interface FeeCalculatorData {
  period: string;
  previousPeriod: string;
  costs: FeeCalculatorCost[];
  actuals: FeeCalculatorActual[];
  refundPolicy: FeeRefundPolicyRule[];
  playerCalculations: FeePlayerCalculation[];
  matchSummaries: FeePlayerMatchSummary[];
  summary: FeeCalculatorSummary;
  emptyState: {
    title: string;
    description: string;
  };
  source: DataSourceState;
}

export interface UpsertFeeCalculatorCostInput {
  id?: string;
  name: string;
  type: FeeCalculatorCostType;
  startPeriod: string;
  endPeriod: string;
  amount: number;
  repeatsMonthly: boolean;
  splitBetween: number;
  forecastUnits: number;
  notes?: string;
}

export interface UpdateFeeCalculatorActualInput {
  costId: string;
  period: string;
  actualUnits: number;
  notes?: string;
}

export interface UpdateFeeRefundPolicyInput {
  rules: FeeRefundPolicyRule[];
}
