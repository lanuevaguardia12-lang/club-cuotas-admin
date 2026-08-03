export type DataSourceProvider = "google-sheets" | "postgresql";
export type DataSourceStatus = "ready" | "empty" | "error";

export interface DashboardMetric {
  id: string;
  title: string;
  value: string;
  detail: string;
  tone: "neutral" | "success" | "warning" | "danger";
}

export interface ChartDatum {
  label: string;
  value: number;
}

export interface MonthlyCollectionPoint {
  period: string;
  label: string;
  ingresos: number;
  cobradas: number;
  pendientes: number;
  morosas: number;
}

export interface AnnualComparisonPoint {
  year: string;
  ingresos: number;
  cobradas: number;
  pendientes: number;
  morosas: number;
}

export interface PlayerLifecyclePoint {
  period: string;
  label: string;
  activos: number;
  nuevos: number;
  bajas: number;
}

export interface DelinquencyTrendPoint {
  period: string;
  label: string;
  morosos: number;
  total: number;
  porcentaje: number;
}

export interface DashboardChartsData {
  feeStatus: ChartDatum[];
  playerStatus: ChartDatum[];
  monthlyCollections: MonthlyCollectionPoint[];
  annualComparison: AnnualComparisonPoint[];
  playerLifecycle: PlayerLifecyclePoint[];
  delinquencyTrend: DelinquencyTrendPoint[];
}

export type CashFlowTransactionType = "income" | "expense";

export type CashFlowTransactionSource = "manual" | "fee-calculator" | "legacy";

export type CashFlowScenario = "real" | "draft";

export interface CashFlowTransaction {
  id: string;
  date?: string;
  period: string;
  type: CashFlowTransactionType;
  concept: string;
  amount: number;
  repeatsMonthly: boolean;
  startPeriod: string;
  endPeriod: string;
  notes: string;
  active: boolean;
  source: CashFlowTransactionSource;
  scenario: CashFlowScenario;
}

export interface CashFlowMetric {
  id: "income" | "expenses" | "balance" | "cash";
  title: string;
  value: string;
  detail: string;
  tone: DashboardMetric["tone"];
}

export interface CashFlowMonthlyPoint {
  [key: string]: string | number | null;
  period: string;
  label: string;
  feeIncome: number;
  additionalIncome: number;
  ingresos: number;
  gastos: number;
  balance: number;
  openingCashBalance: number;
  cashBalance: number;
  negativeCashBalance: number | null;
}

export interface CashFlowConceptSeries {
  key: string;
  label: string;
  type: CashFlowTransactionType;
  color: string;
}

export interface CashFlowConceptBreakdownPoint {
  concept: string;
  type: CashFlowTransactionType;
  amount: number;
  signedAmount: number;
}

export interface CashFlowMatrixRow {
  concept: string;
  type: CashFlowTransactionType;
  values: Record<string, number>;
}

export interface CashFlowChartsData {
  monthly: CashFlowMonthlyPoint[];
  annual: CashFlowMonthlyPoint[];
  monthlySeries: CashFlowConceptSeries[];
  conceptBreakdown: CashFlowConceptBreakdownPoint[];
  matrixRows: CashFlowMatrixRow[];
}

export interface CashFlowScenarioData {
  scenario: CashFlowScenario;
  metrics: CashFlowMetric[];
  charts: CashFlowChartsData;
  transactions: CashFlowTransaction[];
  expectedFeeIncome: number;
  additionalIncome: number;
  additionalExpenses: number;
  emptyState: {
    title: string;
    description: string;
  };
}

export interface CashFlowData extends CashFlowScenarioData {
  period: string;
  draft: CashFlowScenarioData;
  source: DataSourceState;
}

export interface UpsertCashFlowTransactionInput {
  id?: string;
  date: string;
  period: string;
  type: CashFlowTransactionType;
  concept: string;
  amount: number;
  repeatsMonthly: boolean;
  startPeriod: string;
  endPeriod: string;
  notes?: string;
  scenario?: CashFlowScenario;
}

export type PlayerPaymentStatus = "paid" | "debt" | "pending";
export type PlayerMonthPaymentStatus = "paid" | "unpaid";

export interface PlayerTableRow {
  id: string;
  name: string;
  category: string;
  phone: string;
  fee: string;
  feeAmount: number;
  feePeriod: string;
  feeSource: "calculator" | "payments" | "player" | "none";
  status: PlayerPaymentStatus;
  lastPayment: string;
  lastPaymentDate?: string;
  observations: string;
}

export interface PlayerFeeHistoryItem {
  id: string;
  period: string;
  amount: string;
  status: PlayerPaymentStatus;
  dueDate: string;
  paidAt: string;
}

export interface PlayerMonthMatchDetail {
  date: string;
  rival: string;
  attended: boolean;
}

export interface PlayerMonthMatchSummary {
  evaluatedPeriod: string;
  totalMatches: number;
  playedMatches: number;
  attendanceRate: number;
  presentMatches: PlayerMonthMatchDetail[];
  absentMatches: PlayerMonthMatchDetail[];
}

export interface PlayerYearMonth {
  period: string;
  label: string;
  status: PlayerMonthPaymentStatus;
  amount: string;
  amountValue: number;
  amountSource: "calculator" | "payments" | "none";
  dueDate: string;
  paidAt: string;
  matchSummary?: PlayerMonthMatchSummary;
}

export interface PlayerProfile {
  id: string;
  name: string;
  category: string;
  phone: string;
  observations: string;
  year: number;
  history: PlayerFeeHistoryItem[];
  months: PlayerYearMonth[];
}

export interface UpdatePlayerFeeStatusInput {
  playerId: string;
  period: string;
  status: PlayerMonthPaymentStatus;
}

export interface DataSourceState {
  provider: DataSourceProvider;
  status: DataSourceStatus;
  message: string;
  cachedAt: string;
  revalidateSeconds: number;
}

export interface DashboardData {
  period: string;
  metrics: DashboardMetric[];
  charts: DashboardChartsData;
  players: PlayerTableRow[];
  emptyState: {
    title: string;
    description: string;
  };
  source: DataSourceState;
}
