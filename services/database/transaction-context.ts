import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type postgres from "postgres";

// Directory reads inside a financial transaction must use its connection too.
// Otherwise simultaneous balance operations could exhaust the connection pool
// while waiting for the financial lock and block the operation holding it.
export const financialTransactionContext =
  new AsyncLocalStorage<postgres.TransactionSql>();
