"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Camera, KeyRound, Save, UserRound } from "lucide-react";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  changeAccountPassword,
  saveAccountProfile,
} from "@/app/(dashboard)/account/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingModal } from "@/components/ui/loading-modal";
import type { AccountProfile } from "@/types/account";

const profileSchema = z.object({
  email: z.string().trim().email("Ingresá un email válido.").optional().or(z.literal("")),
  name: z.string().trim().min(2, "Ingresá tu nombre.").max(120),
  phone: z.string().trim().max(40).optional(),
  profilePhotoDataUrl: z.string().optional(),
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
  const {
    formState: { errors: profileErrors, isSubmitting: profileSubmitting },
    handleSubmit: handleProfileSubmit,
    register: registerProfile,
    setValue,
    watch,
  } = useForm<ProfileFormValues>({
    defaultValues: {
      email: profile.email,
      name: profile.name,
      phone: profile.phone,
      profilePhotoDataUrl: profile.profilePhotoDataUrl,
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
  const photoDataUrl = watch("profilePhotoDataUrl");
  const isLoading = profileSubmitting || passwordSubmitting || Boolean(loadingMessage);

  async function onProfileSubmit(values: ProfileFormValues) {
    setProfileMessage("");
    setLoadingMessage("Guardando tu información...");

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
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <LoadingModal open={isLoading} description={loadingMessage || "Guardando..."} />

      <form className="grid gap-4" onSubmit={handleProfileSubmit(onProfileSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserRound className="text-primary size-5" />
              Tu información
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
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
              <Field label="Usuario">
                <input
                  value={profile.username}
                  readOnly
                  className={`${inputClassName} text-muted-foreground`}
                />
              </Field>
            </div>

            <input type="hidden" {...registerProfile("profilePhotoDataUrl")} />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button type="submit" disabled={profileSubmitting}>
                <Save />
                Guardar información
              </Button>
              {profileMessage ? (
                <span className="text-muted-foreground text-sm">{profileMessage}</span>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </form>

      <aside className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Camera className="text-primary size-5" />
              Foto de perfil
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="bg-muted mx-auto grid size-36 place-items-center overflow-hidden rounded-full border">
              {photoDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoDataUrl}
                  alt="Foto de perfil"
                  className="size-full object-cover"
                />
              ) : (
                <UserRound className="text-muted-foreground size-12" />
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handlePhotoChange}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
            >
              <Camera />
              Cargar foto
            </Button>
            {photoDataUrl ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setValue("profilePhotoDataUrl", "", { shouldDirty: true })}
              >
                Quitar foto
              </Button>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="text-primary size-5" />
              Cambiar contraseña
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4"
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
              <Field label="Nueva contraseña" error={passwordErrors.newPassword?.message}>
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
          </CardContent>
        </Card>
      </aside>
    </section>
  );
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

const inputClassName =
  "border-input bg-background focus:ring-ring h-10 rounded-md border px-3 text-sm outline-none focus:ring-2";

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
