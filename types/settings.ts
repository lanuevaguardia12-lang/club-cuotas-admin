export interface AppSettings {
  clubName: string;
  logoUrl: string;
  whatsAppMessageTemplate: string;
  monthlyFee: number;
  primaryColor: string;
  darkMode: boolean;
}

export type UpdateAppSettingsInput = AppSettings;

export interface AppSettingsData {
  settings: AppSettings;
  source: {
    provider: "google-sheets" | "postgresql";
    status: "ready" | "empty" | "error";
    message: string;
    cachedAt: string;
    revalidateSeconds: number;
  };
}
