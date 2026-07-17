import type { AppSettings, UpdateAppSettingsInput } from "@/types/settings";

export const DEFAULT_CLUB_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "La Nueva Guardia";

export const DEFAULT_APP_SETTINGS: AppSettings = {
  clubName: DEFAULT_CLUB_NAME,
  logoUrl: "",
  whatsAppMessageTemplate:
    process.env.NEXT_PUBLIC_REMINDER_TEMPLATE ??
    "Buenas {nombre}, ¿cómo estás? Porfa acordate de pagar la cuota de {mes}.\nEl monto es {monto}.\nY completar el formulario! https://forms.gle/FFmGxDKRM4UNhM5h6",
  monthlyFee: parsePositiveNumber(process.env.NEXT_PUBLIC_DEFAULT_MONTHLY_FEE),
  primaryColor: normalizeHexColor(process.env.NEXT_PUBLIC_PRIMARY_COLOR) ?? "#0f766e",
  darkMode: false,
};

export const APP_SETTINGS_ROWS: Array<{
  key: keyof AppSettings;
  label: string;
}> = [
  { key: "clubName", label: "club_name" },
  { key: "logoUrl", label: "logo_url" },
  { key: "whatsAppMessageTemplate", label: "whatsapp_message_template" },
  { key: "monthlyFee", label: "monthly_fee" },
  { key: "primaryColor", label: "primary_color" },
  { key: "darkMode", label: "dark_mode" },
];

export function normalizeAppSettings(
  input: Partial<UpdateAppSettingsInput>,
): AppSettings {
  return {
    clubName: normalizeTextValue(input.clubName) || DEFAULT_APP_SETTINGS.clubName,
    logoUrl: normalizeTextValue(input.logoUrl),
    whatsAppMessageTemplate:
      normalizeTextValue(input.whatsAppMessageTemplate) ||
      DEFAULT_APP_SETTINGS.whatsAppMessageTemplate,
    monthlyFee: parsePositiveNumber(input.monthlyFee),
    primaryColor:
      normalizeHexColor(input.primaryColor) ?? DEFAULT_APP_SETTINGS.primaryColor,
    darkMode: Boolean(input.darkMode),
  };
}

export function normalizeHexColor(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const color = value.trim();

  return /^#[0-9a-fA-F]{6}$/.test(color) ? color.toLowerCase() : undefined;
}

export function parseBooleanValue(value: string) {
  return ["1", "true", "si", "sí", "yes", "dark", "oscuro"].includes(
    value.trim().toLowerCase(),
  );
}

export function getContrastingTextColor(hexColor: string) {
  const normalized = normalizeHexColor(hexColor) ?? DEFAULT_APP_SETTINGS.primaryColor;
  const red = Number.parseInt(normalized.slice(1, 3), 16);
  const green = Number.parseInt(normalized.slice(3, 5), 16);
  const blue = Number.parseInt(normalized.slice(5, 7), 16);
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;

  return luminance > 0.62 ? "#111827" : "#f8fafc";
}

function normalizeTextValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parsePositiveNumber(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : Number(
          String(value ?? "")
            .replace(/[^\d,.-]/g, "")
            .replace(",", "."),
        );

  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}
