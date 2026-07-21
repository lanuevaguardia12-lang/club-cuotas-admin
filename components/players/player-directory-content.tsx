"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Mail,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { z } from "zod";

import {
  deletePlayer,
  restoreDefaultRoster,
  savePlayer,
} from "@/app/(dashboard)/players/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PlayerDirectoryData, PlayerDirectoryItem } from "@/types/players";

interface PlayerDirectoryContentProps {
  canWrite: boolean;
  canRestoreRoster: boolean;
  data: PlayerDirectoryData;
}

const playerSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Ingresá nombre y apellido.").max(120),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().email("Ingresá un email válido.").optional().or(z.literal("")),
  category: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(500).optional(),
});

type PlayerFormValues = z.infer<typeof playerSchema>;

export function PlayerDirectoryContent({
  canRestoreRoster,
  canWrite,
  data,
}: PlayerDirectoryContentProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [restoringRoster, setRestoringRoster] = useState(false);
  const [message, setMessage] = useState("");
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
  } = useForm<PlayerFormValues>({
    resolver: zodResolver(playerSchema),
    defaultValues: getDefaultValues(),
  });

  const filteredPlayers = useMemo(() => {
    const normalizedQuery = normalize(query);

    return data.players.filter((player) => {
      const matchesQuery =
        !normalizedQuery ||
        [player.name, player.phone, player.email, player.category, player.notes]
          .map(normalize)
          .some((value) => value.includes(normalizedQuery));

      return matchesQuery;
    });
  }, [data.players, query]);

  const withContact = data.players.filter(
    (player) => player.phone || player.email,
  ).length;
  const withEmail = data.players.filter((player) => player.email).length;

  async function onSubmit(values: PlayerFormValues) {
    setMessage("");
    await savePlayer(values);
    reset(getDefaultValues());
    setEditingId("");
    setMessage(values.id ? "Jugador actualizado" : "Jugador creado");
    router.refresh();
    window.setTimeout(() => setMessage(""), 2200);
  }

  function handleEdit(player: PlayerDirectoryItem) {
    setEditingId(player.id);
    reset({
      id: player.id,
      name: player.name,
      phone: player.phone,
      email: player.email,
      category: player.category,
      notes: player.notes,
    });
  }

  function handleCancelEdit() {
    setEditingId("");
    reset(getDefaultValues());
  }

  async function handleDelete(player: PlayerDirectoryItem) {
    if (!window.confirm(`¿Eliminar a ${player.name} del listado de jugadores?`)) {
      return;
    }

    setDeletingId(player.id);
    await deletePlayer(player.id);
    setDeletingId("");
    setMessage(`${player.name} eliminado`);
    router.refresh();
    window.setTimeout(() => setMessage(""), 2200);
  }

  async function handleRestoreRoster() {
    if (
      !window.confirm(
        "Esto reemplaza el listado completo por el plantel base de La Nueva Guardia. ¿Continuar?",
      )
    ) {
      return;
    }

    setRestoringRoster(true);
    setMessage("");
    const result = await restoreDefaultRoster();
    setRestoringRoster(false);
    setMessage(`Plantel restaurado: ${result.players} jugadores`);
    router.refresh();
    window.setTimeout(() => setMessage(""), 2600);
  }

  return (
    <section className="grid gap-6">
      {data.source.status === "error" ? (
        <Card className="border-destructive/30 bg-destructive/10">
          <CardContent className="text-destructive p-5 text-sm">
            {data.source.message}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          icon={UsersRound}
          label="Total jugadores"
          value={String(data.players.length)}
          detail="ABM de la app"
        />
        <MetricCard
          icon={Mail}
          label="Con email"
          value={String(withEmail)}
          detail="Contacto digital"
        />
        <MetricCard
          icon={Phone}
          label="Con contacto"
          value={String(withContact)}
          detail="Teléfono o email"
        />
      </div>

      {canRestoreRoster ? (
        <Card className="border-[#0094dc]/30 bg-[#0094dc]/5">
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold">Plantel base La Nueva Guardia</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                Reemplaza el ABM actual por el listado oficial cargado en la app.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={restoringRoster}
              onClick={handleRestoreRoster}
            >
              <RotateCcw />
              Restaurar plantel
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{editingId ? "Editar jugador" : "Nuevo jugador"}</CardTitle>
            <p className="text-muted-foreground text-sm">
              Esta información alimenta la calculadora de cuota.
            </p>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
              <input type="hidden" {...register("id")} />

              <Field label="Nombre y apellido" error={errors.name?.message}>
                <input
                  {...register("name")}
                  disabled={!canWrite}
                  className="border-input bg-background focus:ring-ring h-10 rounded-md border px-3 text-sm outline-none focus:ring-2"
                />
              </Field>

              <Field label="Teléfono" error={errors.phone?.message}>
                <input
                  {...register("phone")}
                  disabled={!canWrite}
                  inputMode="tel"
                  className="border-input bg-background focus:ring-ring h-10 rounded-md border px-3 text-sm outline-none focus:ring-2"
                />
              </Field>

              <Field label="Email" error={errors.email?.message}>
                <input
                  {...register("email")}
                  disabled={!canWrite}
                  inputMode="email"
                  className="border-input bg-background focus:ring-ring h-10 rounded-md border px-3 text-sm outline-none focus:ring-2"
                />
              </Field>

              <Field label="Categoría" error={errors.category?.message}>
                <input
                  {...register("category")}
                  disabled={!canWrite}
                  className="border-input bg-background focus:ring-ring h-10 rounded-md border px-3 text-sm outline-none focus:ring-2"
                />
              </Field>

              <Field label="Observaciones" error={errors.notes?.message}>
                <textarea
                  {...register("notes")}
                  disabled={!canWrite}
                  rows={3}
                  className="border-input bg-background focus:ring-ring rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
                />
              </Field>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button type="submit" disabled={!canWrite || isSubmitting}>
                  {editingId ? <Save /> : <Plus />}
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
              <h2 className="text-lg font-semibold">Base de jugadores</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                Alta y edición del padrón que alimenta el calculador de cuota.
              </p>
            </div>

            <div className="grid gap-2 lg:w-[360px]">
              <label className="relative">
                <span className="sr-only">Buscar jugadores</span>
                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar nombre, teléfono..."
                  className="border-input bg-background focus:ring-ring h-10 w-full rounded-md border px-3 pl-9 text-sm outline-none focus:ring-2"
                />
              </label>
            </div>
          </div>

          <PlayersDesktopTable
            canWrite={canWrite}
            deletingId={deletingId}
            onDelete={handleDelete}
            onEdit={handleEdit}
            players={filteredPlayers}
          />
          <PlayersMobileList
            canWrite={canWrite}
            deletingId={deletingId}
            onDelete={handleDelete}
            onEdit={handleEdit}
            players={filteredPlayers}
          />

          <p className="text-muted-foreground text-sm">
            {filteredPlayers.length} resultados
          </p>
        </section>
      </div>
    </section>
  );
}

function PlayersDesktopTable({
  canWrite,
  deletingId,
  onDelete,
  onEdit,
  players,
}: {
  canWrite: boolean;
  deletingId: string;
  onDelete: (player: PlayerDirectoryItem) => void;
  onEdit: (player: PlayerDirectoryItem) => void;
  players: PlayerDirectoryItem[];
}) {
  return (
    <div className="border-border bg-card hidden overflow-hidden rounded-lg border md:block">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-muted/60">
            <tr className="border-border border-b">
              <TableHead>Nombre</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Observaciones</TableHead>
              <TableHead>Acciones</TableHead>
            </tr>
          </thead>
          <tbody>
            {players.length > 0 ? (
              players.map((player) => (
                <tr key={player.id} className="border-border border-b last:border-b-0">
                  <td className="px-4 py-3 font-medium">{player.name}</td>
                  <td className="px-4 py-3">{player.phone || "-"}</td>
                  <td className="px-4 py-3">{player.email || "-"}</td>
                  <td className="px-4 py-3">{player.category}</td>
                  <td className="px-4 py-3">
                    <span className="line-clamp-2">{player.notes || "-"}</span>
                  </td>
                  <td className="px-4 py-3">
                    <PlayerActions
                      canWrite={canWrite}
                      deletingId={deletingId}
                      onDelete={onDelete}
                      onEdit={onEdit}
                      player={player}
                    />
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="text-muted-foreground h-24 px-4 text-center">
                  No hay jugadores para mostrar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PlayersMobileList({
  canWrite,
  deletingId,
  onDelete,
  onEdit,
  players,
}: {
  canWrite: boolean;
  deletingId: string;
  onDelete: (player: PlayerDirectoryItem) => void;
  onEdit: (player: PlayerDirectoryItem) => void;
  players: PlayerDirectoryItem[];
}) {
  return (
    <div className="grid gap-3 md:hidden">
      {players.length > 0 ? (
        players.map((player) => (
          <Card key={player.id}>
            <CardContent className="grid gap-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold">{player.name}</h3>
                  <p className="text-muted-foreground mt-1 text-sm">{player.category}</p>
                </div>
              </div>

              <div className="grid gap-2 text-sm">
                <ContactLine icon={Phone} value={player.phone || "-"} />
                <ContactLine icon={Mail} value={player.email || "-"} />
              </div>

              {player.notes ? (
                <p className="text-muted-foreground text-sm">{player.notes}</p>
              ) : null}

              <PlayerActions
                canWrite={canWrite}
                deletingId={deletingId}
                onDelete={onDelete}
                onEdit={onEdit}
                player={player}
              />
            </CardContent>
          </Card>
        ))
      ) : (
        <Card>
          <CardContent className="text-muted-foreground p-5 text-center text-sm">
            No hay jugadores para mostrar.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PlayerActions({
  canWrite,
  deletingId,
  onDelete,
  onEdit,
  player,
}: {
  canWrite: boolean;
  deletingId: string;
  onDelete: (player: PlayerDirectoryItem) => void;
  onEdit: (player: PlayerDirectoryItem) => void;
  player: PlayerDirectoryItem;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={!canWrite}
        onClick={() => onEdit(player)}
      >
        <Pencil />
        Editar
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!canWrite || deletingId === player.id}
        onClick={() => onDelete(player)}
      >
        <Trash2 />
        Eliminar
      </Button>
    </div>
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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-muted-foreground text-sm font-medium">
          {label}
        </CardTitle>
        <div className="bg-primary/10 text-primary rounded-md p-2">
          <Icon className="size-4" aria-hidden="true" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
        <p className="text-muted-foreground mt-1 text-sm">{detail}</p>
      </CardContent>
    </Card>
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

function ContactLine({ icon: Icon, value }: { icon: LucideIcon; value: string }) {
  return (
    <p className="text-muted-foreground inline-flex min-w-0 items-center gap-2">
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{value}</span>
    </p>
  );
}

function TableHead({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-muted-foreground h-12 px-4 text-left align-middle font-medium">
      {children}
    </th>
  );
}

function getDefaultValues(): PlayerFormValues {
  return {
    id: "",
    name: "",
    phone: "",
    email: "",
    category: "Plantel",
    notes: "",
  };
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
