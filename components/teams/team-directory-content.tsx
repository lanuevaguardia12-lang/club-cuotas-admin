"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Camera, Pencil, Save, Search, Shield, X } from "lucide-react";
import { useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { z } from "zod";

import { saveTeamProfile } from "@/app/(dashboard)/teams/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingModal } from "@/components/ui/loading-modal";
import {
  TEAM_SHORT_NAME_MAX_LENGTH,
  createTeamProfileId,
  getDefaultTeamShortName,
  normalizeTeamProfileKey,
} from "@/lib/team-profiles";
import type { TeamProfile, TeamsData } from "@/types/teams";

interface TeamDirectoryContentProps {
  data: TeamsData;
  detectedTeamNames: string[];
}

interface TeamListItem extends TeamProfile {
  detected: boolean;
}

const MAX_TEAM_CREST_LENGTH = 45000;

const teamSchema = z.object({
  crestDataUrl: z
    .string()
    .trim()
    .max(MAX_TEAM_CREST_LENGTH, "El escudo es demasiado grande.")
    .refine(
      (value) => !value || /^data:image\/(png|jpeg|webp);base64,/.test(value),
      "El escudo debe ser una imagen valida.",
    )
    .optional(),
  id: z.string().optional(),
  name: z.string().trim().min(2, "Ingresa el nombre del equipo.").max(120),
  shortName: z
    .string()
    .trim()
    .min(2, "Ingresa un nombre corto.")
    .max(TEAM_SHORT_NAME_MAX_LENGTH, `Maximo ${TEAM_SHORT_NAME_MAX_LENGTH} caracteres.`),
});

type TeamFormValues = z.infer<typeof teamSchema>;

export function TeamDirectoryContent({
  data,
  detectedTeamNames,
}: TeamDirectoryContentProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [editingId, setEditingId] = useState("");
  const [loadingMessage, setLoadingMessage] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    setValue,
    watch,
  } = useForm<TeamFormValues>({
    resolver: zodResolver(teamSchema),
    defaultValues: getDefaultValues(),
  });
  const watchedCrestDataUrl = watch("crestDataUrl") ?? "";
  const watchedName = watch("name") ?? "";
  const watchedShortName = watch("shortName") ?? "";
  const teams = useMemo(
    () => mergeTeamProfiles(data.teams, detectedTeamNames),
    [data.teams, detectedTeamNames],
  );
  const filteredTeams = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);

    if (!normalizedQuery) {
      return teams;
    }

    return teams.filter((team) =>
      [team.name, team.shortName, team.id]
        .map(normalizeSearch)
        .some((value) => value.includes(normalizedQuery)),
    );
  }, [query, teams]);
  const nameField = register("name");

  async function onSubmit(values: TeamFormValues) {
    setMessage("");
    setLoadingMessage(values.id ? "Actualizando equipo..." : "Guardando equipo...");

    try {
      await saveTeamProfile(values);
      reset(getDefaultValues());
      setEditingId("");
      setMessage(values.id ? "Equipo actualizado" : "Equipo guardado");
      router.refresh();
      window.setTimeout(() => setMessage(""), 2400);
    } finally {
      setLoadingMessage("");
    }
  }

  function handleEdit(team: TeamListItem) {
    setEditingId(team.id);
    reset({
      crestDataUrl: team.crestDataUrl,
      id: team.id,
      name: team.name,
      shortName: team.shortName,
    });
  }

  function handleCancelEdit() {
    setEditingId("");
    reset(getDefaultValues());
  }

  async function handleCrestChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setMessage("");
    setLoadingMessage("Procesando escudo...");

    try {
      const dataUrl = await resizeCrestImage(file);
      setValue("crestDataUrl", dataUrl, { shouldDirty: true });
    } catch {
      setMessage("No se pudo cargar el escudo.");
    } finally {
      setLoadingMessage("");
      event.target.value = "";
    }
  }

  function fillShortNameFromOfficialName(name: string) {
    if (!name || watchedShortName) {
      return;
    }

    setValue("shortName", getDefaultTeamShortName(name), {
      shouldDirty: true,
    });
  }

  return (
    <section className="grid gap-6">
      <LoadingModal open={Boolean(loadingMessage)} description={loadingMessage} />

      {data.source.status === "error" ? (
        <Card className="border-destructive/30 bg-destructive/10">
          <CardContent className="text-destructive p-5 text-sm">
            {data.source.message}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{editingId ? "Editar equipo" : "Nuevo equipo"}</CardTitle>
            <p className="text-muted-foreground text-sm">
              Escudo y nombre corto para fixture, home y placas.
            </p>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
              <input type="hidden" {...register("id")} />
              <input type="hidden" {...register("crestDataUrl")} />

              <div className="grid gap-2">
                <span className="text-sm font-medium">Escudo</span>
                <div className="flex flex-wrap items-center gap-3">
                  <TeamCrestPreview
                    crestDataUrl={watchedCrestDataUrl}
                    name={watchedName}
                  />
                  <div className="flex flex-wrap gap-2">
                    <input
                      ref={fileInputRef}
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={handleCrestChange}
                      type="file"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Camera />
                      Cargar escudo
                    </Button>
                    {watchedCrestDataUrl ? (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          setValue("crestDataUrl", "", { shouldDirty: true })
                        }
                      >
                        Quitar
                      </Button>
                    ) : null}
                  </div>
                </div>
                {errors.crestDataUrl?.message ? (
                  <span className="text-destructive text-sm">
                    {errors.crestDataUrl.message}
                  </span>
                ) : null}
              </div>

              <Field label="Nombre oficial" error={errors.name?.message}>
                <input
                  {...nameField}
                  list="detected-teams"
                  onBlur={(event) => {
                    nameField.onBlur(event);
                    fillShortNameFromOfficialName(event.currentTarget.value);
                  }}
                  className="border-input bg-background focus:ring-ring h-10 rounded-md border px-3 text-sm outline-none focus:ring-2"
                />
                <datalist id="detected-teams">
                  {detectedTeamNames.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </Field>

              <Field label="Nombre corto" error={errors.shortName?.message}>
                <div className="grid gap-1">
                  <input
                    {...register("shortName")}
                    maxLength={TEAM_SHORT_NAME_MAX_LENGTH}
                    className="border-input bg-background focus:ring-ring h-10 rounded-md border px-3 text-sm outline-none focus:ring-2"
                  />
                  <span className="text-muted-foreground text-xs">
                    {watchedShortName.length}/{TEAM_SHORT_NAME_MAX_LENGTH}
                  </span>
                </div>
              </Field>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button type="submit" disabled={isSubmitting}>
                  <Save />
                  {editingId ? "Actualizar" : "Guardar"}
                </Button>
                {editingId ? (
                  <Button type="button" variant="outline" onClick={handleCancelEdit}>
                    <X />
                    Cancelar
                  </Button>
                ) : null}
                {message ? (
                  <span className="text-primary text-sm font-medium">{message}</span>
                ) : null}
              </div>
            </form>
          </CardContent>
        </Card>

        <section className="grid gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Equipos del fixture</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                {data.teams.length} equipos guardados · {detectedTeamNames.length}{" "}
                detectados.
              </p>
            </div>

            <label className="relative lg:w-[360px]">
              <span className="sr-only">Buscar equipos</span>
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar equipo..."
                className="border-input bg-background focus:ring-ring h-10 w-full rounded-md border px-3 pl-9 text-sm outline-none focus:ring-2"
              />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {filteredTeams.map((team) => (
              <Card key={team.id} className="overflow-hidden">
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <TeamCrestPreview
                      className="size-14"
                      crestDataUrl={team.crestDataUrl}
                      name={team.name}
                    />
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold">{team.name}</h3>
                      <p className="text-muted-foreground mt-1 truncate text-sm">
                        Placa: {team.shortName}
                      </p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {team.detected ? "Detectado en fixture" : "Guardado manual"}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => handleEdit(team)}
                  >
                    <Pencil />
                    Editar
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredTeams.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="text-muted-foreground p-6 text-center text-sm">
                No hay equipos para mostrar.
              </CardContent>
            </Card>
          ) : null}
        </section>
      </div>
    </section>
  );
}

function TeamCrestPreview({
  className,
  crestDataUrl,
  name,
}: {
  className?: string;
  crestDataUrl?: string;
  name?: string;
}) {
  return (
    <div
      className={[
        "bg-muted grid size-20 shrink-0 place-items-center overflow-hidden rounded-full border",
        className ?? "",
      ].join(" ")}
    >
      {crestDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={`Escudo de ${name || "equipo"}`}
          className="size-full object-contain"
          src={crestDataUrl}
        />
      ) : (
        <Shield className="text-muted-foreground size-8" aria-hidden="true" />
      )}
    </div>
  );
}

function Field({
  children,
  error,
  label,
}: Readonly<{
  children: ReactNode;
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

function getDefaultValues(): TeamFormValues {
  return {
    crestDataUrl: "",
    id: "",
    name: "",
    shortName: "",
  };
}

function mergeTeamProfiles(
  teamProfiles: TeamProfile[],
  detectedTeamNames: string[],
): TeamListItem[] {
  const detectedKeys = new Set(detectedTeamNames.map(normalizeTeamProfileKey));
  const teamsByKey = new Map<string, TeamListItem>();

  teamProfiles.forEach((team) => {
    teamsByKey.set(normalizeTeamProfileKey(team.name), {
      ...team,
      detected: detectedKeys.has(normalizeTeamProfileKey(team.name)),
    });
  });

  detectedTeamNames.forEach((name) => {
    const key = normalizeTeamProfileKey(name);

    if (!key || teamsByKey.has(key)) {
      return;
    }

    teamsByKey.set(key, {
      crestDataUrl: "",
      detected: true,
      id: createTeamProfileId(name),
      name,
      shortName: getDefaultTeamShortName(name),
      updatedAt: "",
    });
  });

  return [...teamsByKey.values()].sort((left, right) =>
    left.name.localeCompare(right.name, "es"),
  );
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

async function resizeCrestImage(file: File) {
  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  const size = 320;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas no disponible.");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, size, size);

  const scale = Math.min(size / image.width, size / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  const x = (size - width) / 2;
  const y = (size - height) / 2;

  context.drawImage(image, x, y, width, height);

  return canvas.toDataURL("image/jpeg", 0.82);
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}
