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

export interface CashFlowMetric {
  id: "income" | "expenses" | "balance" | "cash";
  title: string;
  value: string;
  detail: string;
  tone: DashboardMetric["tone"];
}

export interface CashFlowMonthlyPoint {
  period: string;
  label: string;
  ingresos: number;
  gastos: number;
  balance: number;
}

export interface CashFlowAnnualPoint {
  year: string;
  ingresos: number;
  gastos: number;
  balance: number;
}

export interface CashFlowChartsData {
  monthly: CashFlowMonthlyPoint[];
  annual: CashFlowAnnualPoint[];
}

export interface CashFlowData {
  metrics: CashFlowMetric[];
  charts: CashFlowChartsData;
  emptyState: {
    title: string;
    description: string;
  };
  source: DataSourceState;
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

export interface PlayerYearMonth {
  period: string;
  label: string;
  status: PlayerMonthPaymentStatus;
  amount: string;
  dueDate: string;
  paidAt: string;
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
