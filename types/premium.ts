import type { AuthRole } from "@/types/auth";
import type { DataSourceState, PlayerPaymentStatus } from "@/types/dashboard";

export type AuditAction =
  | "auth.login"
  | "auth.logout"
  | "settings.updated"
  | "player.fee_status_updated"
  | "notification.created"
  | "notification.read"
  | "reminder.queued"
  | "reminder.sent"
  | "payment.checkout_created"
  | "payment.webhook_received"
  | "payment.status_updated"
  | "api.request"
  | "system.error";

export type AuditEntityType =
  | "auth"
  | "settings"
  | "player"
  | "team"
  | "fee"
  | "cash-flow"
  | "notification"
  | "reminder"
  | "payment"
  | "api"
  | "system";

export interface AuditActor {
  id: string;
  name: string;
  role: AuthRole | "system" | "api";
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  actor: AuditActor;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  summary: string;
  metadata: Record<string, string | number | boolean | null>;
}

export type AppLogLevel = "info" | "warning" | "error";

export interface AppLogEntry {
  id: string;
  timestamp: string;
  level: AppLogLevel;
  source: string;
  message: string;
  context: Record<string, string | number | boolean | null>;
}

export type NotificationType = "info" | "success" | "warning" | "danger";
export type NotificationStatus = "unread" | "read" | "archived";

export interface AppNotification {
  id: string;
  createdAt: string;
  title: string;
  message: string;
  type: NotificationType;
  status: NotificationStatus;
  targetRole: AuthRole | "all";
  targetUserId?: string;
  targetPlayerId?: string;
  referenceId?: string;
  url?: string;
  readAt?: string;
}

export type ReminderStatus = "queued" | "sent" | "failed" | "skipped";

export interface ReminderJob {
  id: string;
  createdAt: string;
  scheduledFor: string;
  period: string;
  playerId: string;
  playerName: string;
  phone: string;
  paymentStatus: PlayerPaymentStatus;
  message: string;
  status: ReminderStatus;
  sentAt?: string;
  error?: string;
}

export type PaymentProvider = "mercado-pago" | "stripe";
export type PaymentStatus =
  | "created"
  | "pending"
  | "approved"
  | "paid"
  | "rejected"
  | "cancelled"
  | "refunded"
  | "unknown";

export interface PaymentRecord {
  id: string;
  provider: PaymentProvider;
  externalId: string;
  playerId: string;
  playerName: string;
  period: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  checkoutUrl?: string;
  createdAt: string;
  updatedAt: string;
  rawEventType?: string;
}

export interface PushSubscriptionKeys {
  auth: string;
  p256dh: string;
}

export interface PushSubscriptionInput {
  userId: string;
  playerId?: string;
  endpoint: string;
  keys: PushSubscriptionKeys;
  userAgent?: string;
}

export interface PushSubscriptionRecord extends PushSubscriptionInput {
  id: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PremiumSummary {
  unreadNotifications: number;
  queuedReminders: number;
  failedReminders: number;
  pendingPayments: number;
  approvedPayments: number;
  auditEvents: number;
  errorLogs: number;
}

export interface PremiumData {
  summary: PremiumSummary;
  audit: AuditEvent[];
  logs: AppLogEntry[];
  notifications: AppNotification[];
  reminders: ReminderJob[];
  payments: PaymentRecord[];
  source: DataSourceState;
}

export interface CreateAuditEventInput {
  actor: AuditActor;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  summary: string;
  metadata?: AuditEvent["metadata"];
}

export interface CreateNotificationInput {
  title: string;
  message: string;
  type?: NotificationType;
  targetRole?: AuthRole | "all";
  targetUserId?: string;
  targetPlayerId?: string;
  referenceId?: string;
  url?: string;
}

export interface CreateReminderJobInput {
  scheduledFor: string;
  period: string;
  playerId: string;
  playerName: string;
  phone: string;
  paymentStatus: PlayerPaymentStatus;
  message: string;
  status?: ReminderStatus;
  error?: string;
}

export interface UpdateReminderJobStatusInput {
  reminderId: string;
  status: ReminderStatus;
  sentAt?: string;
  error?: string;
}

export interface UpsertPaymentRecordInput {
  provider: PaymentProvider;
  externalId: string;
  playerId?: string;
  playerName?: string;
  period?: string;
  amount?: number;
  currency?: string;
  status: PaymentStatus;
  checkoutUrl?: string;
  rawEventType?: string;
}

export interface CreateCheckoutInput {
  provider: PaymentProvider;
  playerId: string;
  playerName: string;
  period: string;
  amount: number;
  currency?: string;
  payerEmail?: string;
}

export interface CheckoutResult {
  provider: PaymentProvider;
  externalId: string;
  checkoutUrl: string;
  status: PaymentStatus;
}
