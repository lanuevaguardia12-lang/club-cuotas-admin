"use client";

import { Plus, Send } from "lucide-react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createManualNotificationAction } from "@/app/(dashboard)/notifications/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { roleLabels } from "@/lib/auth/roles";
import {
  manualNotificationSchema,
  notificationVariables,
  renderNotificationTemplate,
  type NotificationRecipient,
} from "@/lib/manual-notification-template";

const field =
  "border-input bg-background w-full min-w-0 rounded-md border px-3 py-2 text-base";

export function NotificationComposer({ users }: { users: NotificationRecipient[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [focused, setFocused] = useState<"title" | "message">("message");
  const [previewId, setPreviewId] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const requestId = useRef("");
  const titleRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const sending = useRef(false);
  const locked = useRef(false);
  const selectedUsers = users.filter((user) => selected.includes(user.userId));
  const preview =
    selectedUsers.find((user) => user.userId === previewId) ?? selectedUsers[0];
  const filtered = users.filter(
    (user) =>
      (role === "all" || user.role === role) &&
      `${user.name} ${user.username}`
        .toLocaleLowerCase("es")
        .includes(search.toLocaleLowerCase("es")),
  );

  function insertVariable(variable: string) {
    const input = focused === "title" ? titleRef.current : messageRef.current;
    const text = focused === "title" ? title : message;
    const start = input?.selectionStart ?? text.length;
    const end = input?.selectionEnd ?? start;
    const token = `{{${variable}}}`;
    const value = text.slice(0, start) + token + text.slice(end);
    if (focused === "title") setTitle(value);
    else setMessage(value);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  function startNew() {
    requestId.current = "";
    locked.current = false;
    setSelected([]);
    setTitle("");
    setMessage("");
    setResult("");
    setError("");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    requestId.current ||= crypto.randomUUID();
    const input = { requestId: requestId.current, userIds: selected, title, message };
    const parsed = manualNotificationSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Revisá los datos.");
      return;
    }
    sending.current = true;
    locked.current = true;
    setPending(true);
    setError("");
    try {
      const response = await createManualNotificationAction(parsed.data);
      if ("error" in response) {
        setError(response.error || "No se pudo crear el aviso.");
        return;
      }
      setResult(
        `${response.created + response.alreadyCreated} avisos guardados en la campana. Push: ${response.pushSent} entregados, ${response.noDevice} sin dispositivo, ${response.pushFailed} fallidos.${response.deliveryTrackingFailed ? " No se pudo actualizar el estado del push en el historial." : ""}`,
      );
      router.refresh();
    } catch {
      setError(
        "No pudimos confirmar el resultado. Reintentá el mismo envío; los avisos ya guardados no se vuelven a enviar.",
      );
    } finally {
      sending.current = false;
      setPending(false);
    }
  }

  return (
    <section className="grid min-w-0 gap-3">
      <Button
        type="button"
        className="w-full justify-self-start sm:w-auto"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls="notification-composer"
      >
        <Plus className="size-4" aria-hidden="true" /> Nueva notificación
      </Button>
      {open ? (
        <Card id="notification-composer" className="min-w-0">
          <CardHeader>
            <CardTitle>Nueva notificación</CardTitle>
          </CardHeader>
          <CardContent>
            {result ? (
              <div role="status" className="grid gap-3">
                <p className="text-sm">{result}</p>
                <Button type="button" className="justify-self-start" onClick={startNew}>
                  Crear otro aviso
                </Button>
              </div>
            ) : (
              <form onSubmit={submit} className="grid min-w-0 gap-5">
                <fieldset
                  disabled={pending || locked.current}
                  className="grid min-w-0 gap-5 disabled:opacity-70"
                >
                  <legend className="mb-2 font-medium">Destinatarios</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1 text-sm">
                      Buscar usuario
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className={field}
                        placeholder="Nombre o usuario"
                      />
                    </label>
                    <label className="grid gap-1 text-sm">
                      Filtrar por rol
                      <select
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                        className={field}
                      >
                        <option value="all">Todos los roles</option>
                        {Object.entries(roleLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setSelected([
                          ...new Set([
                            ...selected,
                            ...filtered.map((user) => user.userId),
                          ]),
                        ])
                      }
                    >
                      Seleccionar {search || role !== "all" ? "resultados" : "todos"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelected([])}
                    >
                      Quitar selección
                    </Button>
                    <p aria-live="polite" className="text-muted-foreground text-sm">
                      {selected.length} seleccionados
                    </p>
                  </div>
                  <div
                    className="border-border grid max-h-60 gap-1 overflow-y-auto rounded-md border p-2"
                    role="group"
                    aria-label="Usuarios destinatarios"
                  >
                    {filtered.map((user) => (
                      <label
                        key={user.userId}
                        className="hover:bg-muted flex min-h-12 min-w-0 items-center gap-3 rounded-md p-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          className="size-5 shrink-0"
                          checked={selected.includes(user.userId)}
                          onChange={(e) =>
                            setSelected(
                              e.target.checked
                                ? [...selected, user.userId]
                                : selected.filter((id) => id !== user.userId),
                            )
                          }
                        />
                        <span className="min-w-0 break-words">
                          <span className="block font-medium">
                            {user.name || user.username}
                          </span>
                          <span className="text-muted-foreground">
                            {user.username} · {roleLabels[user.role]}
                          </span>
                        </span>
                      </label>
                    ))}
                    {!filtered.length ? (
                      <p className="p-2 text-sm">No hay usuarios para este filtro.</p>
                    ) : null}
                  </div>
                  <label className="grid gap-1 text-sm">
                    Título
                    <input
                      ref={titleRef}
                      required
                      maxLength={120}
                      value={title}
                      onFocus={() => setFocused("title")}
                      onChange={(e) => setTitle(e.target.value)}
                      className={field}
                      placeholder="Hola {{nombre}}"
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Texto
                    <textarea
                      ref={messageRef}
                      required
                      rows={4}
                      maxLength={2000}
                      value={message}
                      onFocus={() => setFocused("message")}
                      onChange={(e) => setMessage(e.target.value)}
                      className={field}
                    />
                  </label>
                  <div className="grid gap-2">
                    <p className="text-muted-foreground text-sm">
                      Insertar variable en{" "}
                      {focused === "title" ? "el título" : "el texto"}:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {notificationVariables.map((variable) => (
                        <Button
                          type="button"
                          key={variable}
                          size="sm"
                          variant="outline"
                          onClick={() => insertVariable(variable)}
                        >{`{{${variable}}}`}</Button>
                      ))}
                    </div>
                    <p className="text-muted-foreground text-xs">
                      Se usa la primera palabra del nombre como nombre y el resto como
                      apellido. Revisá la vista previa.
                    </p>
                  </div>
                </fieldset>
                {preview ? (
                  <div className="bg-muted grid min-w-0 gap-2 rounded-md p-3">
                    <label className="grid gap-1 text-sm">
                      Vista previa para
                      <select
                        className={field}
                        value={preview.userId}
                        onChange={(e) => setPreviewId(e.target.value)}
                      >
                        {selectedUsers.map((user) => (
                          <option key={user.userId} value={user.userId}>
                            {user.name || user.username}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="font-semibold break-words">
                      {renderNotificationTemplate(title, preview) || "Título del aviso"}
                    </p>
                    <p className="text-sm break-words whitespace-pre-wrap">
                      {renderNotificationTemplate(message, preview) || "Texto del aviso"}
                    </p>
                  </div>
                ) : null}
                <p className="text-muted-foreground text-sm">
                  Cada usuario recibirá el aviso en su campana y, si tiene un dispositivo
                  activo, también por push.
                </p>
                {error ? (
                  <p role="alert" className="text-destructive text-sm">
                    {error}
                  </p>
                ) : null}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="submit"
                    disabled={
                      pending || !selected.length || !title.trim() || !message.trim()
                    }
                  >
                    <Send className="size-4" aria-hidden="true" />
                    {pending
                      ? "Enviando…"
                      : locked.current
                        ? "Reintentar el mismo envío"
                        : `Enviar a ${selected.length} usuarios`}
                  </Button>
                  {!locked.current ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setOpen(false)}
                    >
                      Cancelar
                    </Button>
                  ) : null}
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}
