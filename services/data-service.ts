import "server-only";

import { DatabaseService } from "@/services/DatabaseService";
import { GoogleSheetsService } from "@/services/GoogleSheetsService";
import type { IDataService } from "@/services/IDataService";

export function getDataService(): IDataService {
  const source = process.env.DATA_SOURCE ?? "google-sheets";

  if (source === "database" || source === "postgresql") {
    return new DatabaseService();
  }

  return new GoogleSheetsService();
}
