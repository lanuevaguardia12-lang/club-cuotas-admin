"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Palette, RotateCcw, Save, ShieldCheck } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { saveAppSettings } from "@/app/(dashboard)/settings/actions";
import { useAppSettings } from "@/components/providers/app-settings-provider";
import { Button } from "@/components/ui/button";
import { LoadingModal } from "@/components/ui/loading-modal";
import { DEFAULT_APP_SETTINGS } from "@/lib/app-settings";
import type { AppSettings } from "@/types/settings";

interface ClubSettingsPanelProps {
  initialSettings: AppSettings;
}

const clubSettingsSchema = z.object({
  clubName: z
    .string()
    .trim()
    .min(2, "Ingresá el nombre del club.")
    .max(80, "El nombre no puede superar los 80 caracteres."),
  logoUrl: z
    .string()
    .trim()
    .max(500, "La URL no puede superar los 500 caracteres.")
    .refine((value) => !value || isValidLogoUrl(value), "Ingresá una URL válida."),
  whatsAppMessageTemplate: z
    .string()
    .trim()
    .min(1, "El mensaje no puede estar vacío.")
    .max(1200, "El mensaje no puede superar los 1200 caracteres."),
  monthlyFee: z
    .number()
    .min(0, "El valor no puede ser negativo.")
    .max(999999999, "El valor es demasiado alto."),
  primaryColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Usá un color hexadecimal válido."),
  darkMode: z.boolean(),
});

type ClubSettingsFormValues = z.infer<typeof clubSettingsSchema>;

export function ClubSettingsPanel({ initialSettings }: ClubSettingsPanelProps) {
  const { settings, setSettings } = useAppSettings();
  const { setTheme } = useTheme();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    watch,
  } = useForm<ClubSettingsFormValues>({
    resolver: zodResolver(clubSettingsSchema),
    defaultValues: settings ?? initialSettings,
  });

  useEffect(() => {
    reset(settings ?? initialSettings);
  }, [initialSettings, reset, settings]);

  const preview = watch();
  const logoUrl = preview.logoUrl?.trim();

  async function handleSave(values: ClubSettingsFormValues) {
    setSaved(false);
    setError("");

    try {
      const result = await saveAppSettings(values);

      setSettings(result.settings);
      setTheme(result.settings.darkMode ? "dark" : "light");
      reset(result.settings);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2200);
    } catch {
      setError("No se pudo guardar la configuración.");
    }
  }

  function handleReset() {
    reset(DEFAULT_APP_SETTINGS);
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <LoadingModal
        open={isSubmitting}
        description="Guardando configuración del club..."
      />

      <form
        className="border-border bg-card grid gap-5 rounded-lg border p-5"
        onSubmit={handleSubmit(handleSave)}
      >
        <div>
          <h2 className="text-lg font-semibold">Panel de configuración</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Ajustes principales del club y comunicación.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nombre del club" error={errors.clubName?.message}>
            <input
              {...register("clubName")}
              className="border-input bg-background focus:ring-ring h-10 rounded-md border px-3 text-sm outline-none focus:ring-2"
            />
          </Field>

          <Field label="Logo" error={errors.logoUrl?.message}>
            <input
              {...register("logoUrl")}
              placeholder="https://..."
              className="border-input bg-background focus:ring-ring h-10 rounded-md border px-3 text-sm outline-none focus:ring-2"
            />
          </Field>

          <Field label="Valor de cuota" error={errors.monthlyFee?.message}>
            <input
              type="number"
              min={0}
              step={1}
              {...register("monthlyFee", { valueAsNumber: true })}
              className="border-input bg-background focus:ring-ring h-10 rounded-md border px-3 text-sm outline-none focus:ring-2"
            />
          </Field>

          <Field label="Color principal" error={errors.primaryColor?.message}>
            <div className="grid grid-cols-[48px_1fr] gap-2">
              <input
                type="color"
                {...register("primaryColor")}
                className="border-input bg-background h-10 w-12 rounded-md border p-1"
                aria-label="Color principal"
              />
              <input
                {...register("primaryColor")}
                className="border-input bg-background focus:ring-ring h-10 rounded-md border px-3 text-sm outline-none focus:ring-2"
              />
            </div>
          </Field>
        </div>

        <Field
          label="Mensaje de WhatsApp"
          error={errors.whatsAppMessageTemplate?.message}
        >
          <textarea
            {...register("whatsAppMessageTemplate")}
            rows={8}
            className="border-input bg-background focus:ring-ring min-h-48 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
          />
          <p className="text-muted-foreground text-xs">
            Variables: <code>{"{nombre}"}</code>, <code>{"{mes}"}</code>,{" "}
            <code>{"{monto}"}</code>, <code>{"{club}"}</code>.
          </p>
        </Field>

        <label className="border-border bg-background flex items-center justify-between gap-4 rounded-lg border p-4">
          <span>
            <span className="block text-sm font-medium">Modo oscuro</span>
            <span className="text-muted-foreground mt-1 block text-xs">
              Se aplica como preferencia visual del panel.
            </span>
          </span>
          <input
            type="checkbox"
            {...register("darkMode")}
            className="accent-primary size-5"
          />
        </label>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button type="submit" disabled={isSubmitting}>
            <Save />
            Guardar configuración
          </Button>
          <Button type="button" variant="outline" onClick={handleReset}>
            <RotateCcw />
            Restaurar predeterminada
          </Button>
          {saved ? (
            <span className="text-primary text-sm font-medium">
              Configuración guardada
            </span>
          ) : null}
          {error ? <span className="text-destructive text-sm">{error}</span> : null}
        </div>
      </form>

      <aside className="border-border bg-card h-fit rounded-lg border p-5">
        <div className="flex items-center gap-2">
          <Palette className="text-muted-foreground size-4" aria-hidden="true" />
          <h2 className="text-base font-semibold">Vista previa</h2>
        </div>

        <div className="border-border bg-background mt-5 rounded-lg border p-4">
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <div
                className="border-border bg-muted size-12 rounded-md border bg-cover bg-center"
                role="img"
                aria-label="Logo configurado"
                style={{ backgroundImage: `url("${logoUrl}")` }}
              />
            ) : (
              <div
                className="grid size-12 place-items-center rounded-md text-sm font-semibold"
                style={{
                  backgroundColor: preview.primaryColor,
                  color: "#ffffff",
                }}
              >
                {getInitials(preview.clubName)}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{preview.clubName}</p>
              <p className="text-muted-foreground mt-1 text-xs">
                Cuota: {formatCurrency(Number(preview.monthlyFee || 0))}
              </p>
            </div>
          </div>

          <div
            className="mt-4 rounded-md p-3 text-sm"
            style={previewPrimaryStyle(preview)}
          >
            Botón principal
          </div>
        </div>

        <div className="text-muted-foreground mt-4 flex items-start gap-2 text-xs">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>La configuración se guarda en la fuente de datos activa.</p>
        </div>
      </aside>
    </section>
  );
}

function Field({
  children,
  error,
  label,
}: Readonly<{
  children: React.ReactNode;
  error?: string;
  label: string;
}>) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {error ? <span className="text-destructive text-sm">{error}</span> : null}
    </label>
  );
}

function isValidLogoUrl(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function getInitials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

function previewPrimaryStyle(values: ClubSettingsFormValues) {
  return {
    backgroundColor: values.primaryColor,
    color: "#ffffff",
  };
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}
