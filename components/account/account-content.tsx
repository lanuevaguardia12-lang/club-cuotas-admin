"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Cake,
  Camera,
  ChevronDown,
  CircleDot,
  Flame,
  IdCard,
  KeyRound,
  Mail,
  Percent,
  Phone,
  Save,
  Shield,
  Target,
  Trophy,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  changeAccountPassword,
  saveAccountProfile,
} from "@/app/(dashboard)/account/actions";
import { LogoutButton } from "@/components/auth/logout-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingModal } from "@/components/ui/loading-modal";
import { PLAYER_POSITIONS, isPlayerPosition } from "@/lib/player-positions";
import type { AccountProfile } from "@/types/account";

const profileSchema = z.object({
  birthDate: z.string().trim().max(20).optional(),
  dni: z.string().trim().max(20).optional(),
  email: z.string().trim().email("Ingresá un email válido.").optional().or(z.literal("")),
  name: z.string().trim().min(2, "Ingresá tu nombre.").max(120),
  phone: z.string().trim().max(40).optional(),
  position: z
    .string()
    .trim()
    .refine((value) => !value || isPlayerPosition(value), "Elegí una posición válida.")
    .optional(),
  profilePhotoDataUrl: z.string().optional(),
  secondPosition: z
    .string()
    .trim()
    .refine((value) => !value || isPlayerPosition(value), "Elegí una posición válida.")
    .optional(),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Ingresá tu contraseña actual."),
    newPassword: z.string().min(8, "Mínimo 8 caracteres."),
    repeatPassword: z.string().min(1, "Repetí la nueva contraseña."),
  })
  .refine((value) => value.newPassword === value.repeatPassword, {
    message: "Las contraseñas no coinciden.",
    path: ["repeatPassword"],
  });

type ProfileFormValues = z.infer<typeof profileSchema>;
type PasswordFormValues = z.infer<typeof passwordSchema>;

interface AccountContentProps {
  profile: AccountProfile;
}

export function AccountContent({ profile }: AccountContentProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [profileMessage, setProfileMessage] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [loadingMessage, setLoadingMessage] = useState("");
  const [photoFailed, setPhotoFailed] = useState(false);
  const {
    formState: { errors: profileErrors, isSubmitting: profileSubmitting },
    handleSubmit: handleProfileSubmit,
    register: registerProfile,
    setValue,
    watch,
  } = useForm<ProfileFormValues>({
    defaultValues: {
      birthDate: profile.player?.birthDate || profile.birthDate,
      dni: profile.player?.dni ?? "",
      email: profile.email,
      name: profile.name,
      phone: profile.phone,
      position: profile.player?.position ?? "",
      profilePhotoDataUrl: profile.profilePhotoDataUrl,
      secondPosition: profile.player?.secondPosition ?? "",
    },
    resolver: zodResolver(profileSchema),
  });
  const {
    formState: { errors: passwordErrors, isSubmitting: passwordSubmitting },
    handleSubmit: handlePasswordSubmit,
    register: registerPassword,
    reset: resetPassword,
  } = useForm<PasswordFormValues>({
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      repeatPassword: "",
    },
    resolver: zodResolver(passwordSchema),
  });
  const watchedPhotoDataUrl = watch("profilePhotoDataUrl");
  const photoDataUrl = photoFailed ? "" : watchedPhotoDataUrl;
  const player = profile.player;
  const attendance = player?.attendance;
  const birthDate = player?.birthDate || profile.birthDate;
  const positions = [player?.position, player?.secondPosition].filter(
    (position): position is string => Boolean(position),
  );
  const isLoading = profileSubmitting || passwordSubmitting || Boolean(loadingMessage);

  useEffect(() => {
    setPhotoFailed(false);
  }, [watchedPhotoDataUrl]);

  async function onProfileSubmit(values: ProfileFormValues) {
    setProfileMessage("");
    setLoadingMessage("Guardando tu perfil...");

    try {
      const result = await saveAccountProfile(values);
      setProfileMessage(result.message);
    } finally {
      setLoadingMessage("");
    }
  }

  async function onPasswordSubmit(values: PasswordFormValues) {
    setPasswordMessage("");
    setLoadingMessage("Actualizando contraseña...");

    try {
      const result = await changeAccountPassword(values);
      setPasswordMessage(result.message);

      if (result.ok) {
        resetPassword();
      }
    } finally {
      setLoadingMessage("");
    }
  }

  async function handlePhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setProfileMessage("");
    setLoadingMessage("Procesando foto...");

    try {
      const dataUrl = await resizeImage(file);
      setValue("profilePhotoDataUrl", dataUrl, { shouldDirty: true });
    } catch {
      setProfileMessage("No se pudo cargar la foto.");
    } finally {
      setLoadingMessage("");
      event.target.value = "";
    }
  }

  return (
    <section className="mx-auto grid w-full max-w-5xl gap-4">
      <LoadingModal open={isLoading} description={loadingMessage || "Guardando..."} />

      <section className="from-primary to-secondary text-primary-foreground overflow-hidden rounded-md bg-linear-to-br">
        <div className="grid gap-4 p-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:p-5">
          <div className="relative size-28">
            <div className="grid size-28 shrink-0 place-items-center overflow-hidden rounded-2xl border-2 border-white/70 bg-white/15">
              {photoDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoDataUrl}
                  alt="Foto de perfil"
                  className="size-full object-cover"
                  onError={() => setPhotoFailed(true)}
                />
              ) : (
                <UserRound className="size-11 text-white/80" />
              )}
            </div>
            <button
              type="button"
              className="bg-background text-foreground absolute -right-2 -bottom-2 grid size-10 place-items-center rounded-full border shadow-sm"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Cargar foto"
            >
              <Camera className="size-4" aria-hidden="true" />
            </button>
          </div>

          <div className="min-w-0">
            <p className="text-2xl leading-tight font-semibold sm:text-3xl">
              {profile.name}
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-sm text-white/80">
              {player?.dni ? (
                <span className="inline-flex items-center gap-1">
                  <IdCard className="size-4" aria-hidden="true" />
                  DNI {player.dni}
                </span>
              ) : null}
              {birthDate ? (
                <span className="inline-flex items-center gap-1">
                  <Cake className="size-4" aria-hidden="true" />
                  {formatDate(birthDate)}
                </span>
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {positions.length > 0 ? (
                positions.map((position) => (
                  <PositionBadge key={position} position={position} />
                ))
              ) : (
                <span className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium text-white">
                  {profile.role === "fan" ? "Fan LNG" : "Sin posición cargada"}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handlePhotoChange}
      />

      {player ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="text-primary size-5" />
              Resumen del jugador
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="border-accent bg-accent/15 grid gap-3 rounded-md border p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
              <div className="bg-accent text-accent-foreground grid size-12 place-items-center rounded-md">
                <Flame className="size-6" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">Racha activa</p>
                <p className="mt-1 text-base font-semibold">
                  {attendance && attendance.currentStreak > 0
                    ? `Llevás ${attendance.currentStreak} partidos consecutivos yendo a jugar`
                    : "Todavía no empezaste una racha"}
                </p>
                {attendance?.lastAttendanceRival ? (
                  <p className="text-muted-foreground mt-1 text-sm">
                    Última asistencia: vs {attendance.lastAttendanceRival}
                  </p>
                ) : null}
                <p className="text-muted-foreground mt-1 text-sm">
                  Mejor racha histórica: {attendance?.bestStreak ?? 0} partidos.
                </p>
              </div>
              <div className="bg-primary text-primary-foreground grid size-14 place-items-center rounded-md text-2xl font-semibold">
                {attendance?.currentStreak ?? 0}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <MetricCard
                icon={Trophy}
                label="MVP ganados"
                value={String(player.mvpWins)}
                detail="Votaciones cerradas"
              />
              <MetricCard
                icon={Flame}
                label="Mejor racha"
                value={String(attendance?.bestStreak ?? 0)}
                detail="Récord histórico"
              />
              <MetricCard
                icon={Percent}
                label="Asistencia"
                value={formatPercent(attendance?.attendanceRate ?? 0)}
                detail={`${attendance?.attendedMatches ?? 0}/${attendance?.totalMatches ?? 0} partidos`}
              />
              <MetricCard
                icon={CircleDot}
                label="Temporada"
                value={String(attendance?.seasonYear ?? 2026)}
                detail={`Desde ${formatDate(attendance?.seasonStartDate ?? "2026-08-11")}`}
              />
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserRound className="text-primary size-5" />
            Información personal
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          <form className="grid gap-4" onSubmit={handleProfileSubmit(onProfileSubmit)}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Nombre" error={profileErrors.name?.message}>
                <input {...registerProfile("name")} className={inputClassName} />
              </Field>
              <Field label="Teléfono" error={profileErrors.phone?.message}>
                <input {...registerProfile("phone")} className={inputClassName} />
              </Field>
              <Field label="Email" error={profileErrors.email?.message}>
                <input
                  {...registerProfile("email")}
                  autoComplete="email"
                  className={inputClassName}
                />
              </Field>
              {player || profile.role === "fan" ? (
                <>
                  <Field
                    label="Fecha de nacimiento"
                    error={profileErrors.birthDate?.message}
                  >
                    <input
                      {...registerProfile("birthDate")}
                      type="date"
                      className={inputClassName}
                    />
                  </Field>
                  {player ? (
                    <>
                      <Field label="DNI" error={profileErrors.dni?.message}>
                        <input
                          {...registerProfile("dni")}
                          inputMode="numeric"
                          className={inputClassName}
                        />
                      </Field>
                      <Field label="Posición" error={profileErrors.position?.message}>
                        <select
                          {...registerProfile("position")}
                          className={inputClassName}
                        >
                          <option value="">Sin posición</option>
                          {PLAYER_POSITIONS.map((position) => (
                            <option key={position} value={position}>
                              {position}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field
                        label="Segunda posición"
                        error={profileErrors.secondPosition?.message}
                      >
                        <select
                          {...registerProfile("secondPosition")}
                          className={inputClassName}
                        >
                          <option value="">Sin segunda posición</option>
                          {PLAYER_POSITIONS.map((position) => (
                            <option key={position} value={position}>
                              {position}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </>
                  ) : null}
                </>
              ) : null}
              <Field label="Usuario">
                <input
                  value={profile.username}
                  readOnly
                  className={`${inputClassName} text-muted-foreground`}
                />
              </Field>
            </div>

            <input type="hidden" {...registerProfile("profilePhotoDataUrl")} />
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button type="submit" disabled={profileSubmitting}>
                <Save />
                Guardar perfil
              </Button>
              {photoDataUrl ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    setValue("profilePhotoDataUrl", "", { shouldDirty: true })
                  }
                >
                  Quitar foto
                </Button>
              ) : null}
              {profileMessage ? (
                <span className="text-muted-foreground text-sm">{profileMessage}</span>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="text-primary size-5" />
              Contacto
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <InfoRow icon={Phone} label="Teléfono" value={profile.phone || "-"} />
            <InfoRow icon={Mail} label="Correo" value={profile.email || "-"} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid gap-1 p-0">
            <details className="group border-border border-b p-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-2">
                  <KeyRound className="text-primary size-5" />
                  Cambiar contraseña
                </span>
                <ChevronDown className="text-muted-foreground size-4 transition-transform group-open:rotate-180" />
              </summary>
              <form
                className="mt-4 grid gap-4"
                onSubmit={handlePasswordSubmit(onPasswordSubmit)}
              >
                <Field
                  label="Contraseña actual"
                  error={passwordErrors.currentPassword?.message}
                >
                  <input
                    type="password"
                    autoComplete="current-password"
                    {...registerPassword("currentPassword")}
                    className={inputClassName}
                  />
                </Field>
                <Field
                  label="Nueva contraseña"
                  error={passwordErrors.newPassword?.message}
                >
                  <input
                    type="password"
                    autoComplete="new-password"
                    {...registerPassword("newPassword")}
                    className={inputClassName}
                  />
                </Field>
                <Field
                  label="Repetir nueva contraseña"
                  error={passwordErrors.repeatPassword?.message}
                >
                  <input
                    type="password"
                    autoComplete="new-password"
                    {...registerPassword("repeatPassword")}
                    className={inputClassName}
                  />
                </Field>
                <Button type="submit" disabled={passwordSubmitting}>
                  <KeyRound />
                  Cambiar contraseña
                </Button>
                {passwordMessage ? (
                  <p className="text-muted-foreground text-sm">{passwordMessage}</p>
                ) : null}
              </form>
            </details>
            <div className="p-4">
              <LogoutButton className="w-full" />
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function MetricCard({
  detail,
  icon: Icon,
  label,
  value,
}: {
  detail: string;
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-muted/40 grid gap-2 rounded-md border p-3">
      <div className="text-muted-foreground flex items-center gap-2 text-xs font-medium">
        <Icon className="size-4" aria-hidden="true" />
        {label}
      </div>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-muted-foreground text-xs">{detail}</p>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="text-muted-foreground mt-0.5 size-4" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="font-medium break-words">{value}</p>
      </div>
    </div>
  );
}

function PositionBadge({ position }: { position: string }) {
  const config = getPositionConfig(position);
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${config.className}`}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {position}
    </span>
  );
}

function getPositionConfig(position: string): {
  className: string;
  icon: LucideIcon;
} {
  const normalized = normalizePosition(position);

  if (normalized.includes("arquero") || normalized.includes("portero")) {
    return {
      className:
        "bg-violet-100 text-violet-900 dark:bg-violet-500/20 dark:text-violet-100",
      icon: Target,
    };
  }

  if (
    normalized.includes("defensor") ||
    normalized.includes("defensa") ||
    normalized.includes("lateral") ||
    normalized.includes("zaguero") ||
    normalized.includes("marcador")
  ) {
    return {
      className: "bg-sky-100 text-sky-900 dark:bg-sky-500/20 dark:text-sky-100",
      icon: Shield,
    };
  }

  if (
    normalized.includes("delantero") ||
    normalized.includes("atacante") ||
    normalized.includes("extremo") ||
    normalized.includes("punta")
  ) {
    return {
      className: "bg-red-100 text-red-900 dark:bg-red-500/20 dark:text-red-100",
      icon: Target,
    };
  }

  return {
    className: "bg-yellow-100 text-yellow-950 dark:bg-yellow-400/20 dark:text-yellow-100",
    icon: CircleDot,
  };
}

function Field({
  children,
  error,
  label,
}: {
  children: React.ReactNode;
  error?: string;
  label: string;
}) {
  return (
    <label className="grid gap-2 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {error ? <span className="text-destructive text-xs">{error}</span> : null}
    </label>
  );
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 0,
    style: "percent",
  }).format(value);
}

function formatDate(value: string) {
  if (!value) {
    return "-";
  }

  const date = new Date(`${value}T12:00:00-03:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function normalizePosition(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const inputClassName =
  "border-input bg-background focus:ring-ring h-10 w-full rounded-md border px-3 text-sm outline-none focus:ring-2";

async function resizeImage(file: File) {
  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  const size = 256;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas no disponible.");
  }

  const scale = Math.max(size / image.width, size / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  const x = (size - width) / 2;
  const y = (size - height) / 2;

  context.drawImage(image, x, y, width, height);

  return canvas.toDataURL("image/jpeg", 0.78);
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
