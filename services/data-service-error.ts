export type DataServiceErrorCode =
  "CONFIGURATION_ERROR" | "GOOGLE_SHEETS_ERROR" | "UNSUPPORTED_DATA_SOURCE";

export class DataServiceError extends Error {
  constructor(
    message: string,
    readonly code: DataServiceErrorCode,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "DataServiceError";
  }
}
