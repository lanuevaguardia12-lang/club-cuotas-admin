"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { RotateCcw, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  DEFAULT_REMINDER_TEMPLATE,
  REMINDER_TEMPLATE_STORAGE_KEY,
} from "@/lib/reminders";

const reminderTemplateSchema = z.object({
  template: z
    .string()
    .trim()
    .min(1, "La plantilla no puede estar vacia.")
    .max(1200, "La plantilla no puede superar los 1200 caracteres."),
});

type ReminderTemplateFormValues = z.infer<typeof reminderTemplateSchema>;

export function ReminderTemplateSettings() {
  const [saved, setSaved] = useState(false);
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
  } = useForm<ReminderTemplateFormValues>({
    resolver: zodResolver(reminderTemplateSchema),
    defaultValues: {
      template: DEFAULT_REMINDER_TEMPLATE,
    },
  });

  useEffect(() => {
    reset({
      template:
        window.localStorage.getItem(REMINDER_TEMPLATE_STORAGE_KEY) ??
        DEFAULT_REMINDER_TEMPLATE,
    });
  }, [reset]);

  function handleSave(values: ReminderTemplateFormValues) {
    window.localStorage.setItem(REMINDER_TEMPLATE_STORAGE_KEY, values.template);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  }

  function handleReset() {
    reset({ template: DEFAULT_REMINDER_TEMPLATE });
    window.localStorage.removeItem(REMINDER_TEMPLATE_STORAGE_KEY);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  }

  return (
    <section className="border-border bg-card grid gap-4 rounded-lg border p-5">
      <div>
        <h2 className="text-lg font-semibold">Plantilla de recordatorio</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Se usa para generar el mensaje de WhatsApp desde la tabla y la ficha del
          jugador. Variables disponibles: <code>{"{nombre}"}</code> y{" "}
          <code>{"{mes}"}</code>.
        </p>
      </div>

      <form className="grid gap-4" onSubmit={handleSubmit(handleSave)}>
        <label className="grid gap-2">
          <span className="text-sm font-medium">Mensaje</span>
          <textarea
            {...register("template")}
            rows={8}
            className="border-input bg-background focus:ring-ring min-h-48 rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
          />
          {errors.template ? (
            <span className="text-destructive text-sm">{errors.template.message}</span>
          ) : null}
        </label>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button type="submit" disabled={isSubmitting}>
            <Save />
            Guardar plantilla
          </Button>
          <Button type="button" variant="outline" onClick={handleReset}>
            <RotateCcw />
            Restaurar predeterminada
          </Button>
          {saved ? (
            <span className="text-primary text-sm font-medium">
              Plantilla actualizada
            </span>
          ) : null}
        </div>
      </form>
    </section>
  );
}
