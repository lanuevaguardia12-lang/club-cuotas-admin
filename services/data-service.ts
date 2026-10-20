import "server-only";

import { cache } from "react";

import { DatabaseService } from "@/services/DatabaseService";
import { GoogleSheetsService } from "@/services/GoogleSheetsService";
import type { IDataService } from "@/services/IDataService";

export const getDataService = cache((): IDataService => {
  const source = process.env.DATA_SOURCE ?? "google-sheets";

  if (source === "database" || source === "postgresql") {
    return new DatabaseService();
  }

  return new GoogleSheetsService();
});
