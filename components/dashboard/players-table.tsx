"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Eye,
  Search,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReminderButton } from "@/components/reminders/reminder-button";
import type { PlayerPaymentStatus, PlayerTableRow } from "@/types/dashboard";

interface PlayersTableProps {
  rows: PlayerTableRow[];
}

const statusLabels: Record<PlayerPaymentStatus, string> = {
  paid: "Pagó",
  debt: "Debe",
  pending: "Pendiente",
};

const statusVariants: Record<PlayerPaymentStatus, "success" | "danger" | "warning"> = {
  paid: "success",
  debt: "danger",
  pending: "warning",
};

const statusOptions: Array<{ value: "all" | PlayerPaymentStatus; label: string }> = [
  { value: "all", label: "Todos los estados" },
  { value: "paid", label: "Pagó" },
  { value: "debt", label: "Debe" },
  { value: "pending", label: "Pendiente" },
];

export function PlayersTable({ rows }: PlayersTableProps) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([{ id: "name", desc: false }]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | PlayerPaymentStatus>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const categories = useMemo(
    () => Array.from(new Set(rows.map((row) => row.category))).sort(),
    [rows],
  );

  const filteredRows = useMemo(() => {
    const normalizedQuery = normalize(query);

    return rows.filter((row) => {
      const matchesQuery =
        !normalizedQuery ||
        [row.name, row.category, row.phone, row.fee, row.observations]
          .map(normalize)
          .some((value) => value.includes(normalizedQuery));
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      const matchesCategory = categoryFilter === "all" || row.category === categoryFilter;

      return matchesQuery && matchesStatus && matchesCategory;
    });
  }, [categoryFilter, query, rows, statusFilter]);

  const columns = useMemo<ColumnDef<PlayerTableRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => (
          <SortButton
            label="Nombre"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => (
          <div>
            <Link
              href={getPlayerHref(row.original.id)}
              onClick={(event) => event.stopPropagation()}
              className="font-medium underline-offset-4 hover:underline"
            >
              {row.original.name}
            </Link>
            <p className="text-muted-foreground text-xs">{row.original.id}</p>
          </div>
        ),
      },
      {
        accessorKey: "category",
        header: ({ column }) => (
          <SortButton
            label="Categoría"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
      },
      {
        accessorKey: "phone",
        header: "Teléfono",
      },
      {
        accessorFn: (row) => row.feeAmount,
        id: "fee",
        header: ({ column }) => (
          <SortButton
            label="Cuota"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => row.original.fee,
      },
      {
        accessorKey: "status",
        header: ({ column }) => (
          <SortButton
            label="Estado"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        accessorFn: (row) => row.lastPaymentDate ?? "",
        id: "lastPayment",
        header: ({ column }) => (
          <SortButton
            label="Último pago"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        cell: ({ row }) => row.original.lastPayment,
      },
      {
        accessorKey: "observations",
        header: "Observaciones",
        cell: ({ row }) => (
          <span className="line-clamp-2 text-sm">{row.original.observations}</span>
        ),
      },
      {
        id: "actions",
        header: "Acciones",
        cell: ({ row }) => <RowActions player={row.original} />,
      },
    ],
    [],
  );

  const table = useReactTable({
    data: filteredRows,
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 8,
      },
    },
  });

  useEffect(() => {
    table.setPageIndex(0);
  }, [categoryFilter, query, statusFilter, table]);

  return (
    <section className="grid gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Jugadores y cuotas</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Tabla operativa con búsqueda, filtros, ordenamiento y paginación.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_180px_180px] lg:w-[660px]">
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

          <label>
            <span className="sr-only">Filtrar por estado</span>
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as "all" | PlayerPaymentStatus)
              }
              className="border-input bg-background focus:ring-ring h-10 w-full rounded-md border px-3 text-sm outline-none focus:ring-2"
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="sr-only">Filtrar por categoría</span>
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="border-input bg-background focus:ring-ring h-10 w-full rounded-md border px-3 text-sm outline-none focus:ring-2"
            >
              <option value="all">Todas las categorías</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="border-border bg-card hidden overflow-hidden rounded-lg border md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-muted/60">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-border border-b">
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="text-muted-foreground h-12 px-4 text-left align-middle font-medium"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    role="link"
                    tabIndex={0}
                    aria-label={`Abrir ficha de ${row.original.name}`}
                    onClick={() => router.push(getPlayerHref(row.original.id))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        router.push(getPlayerHref(row.original.id));
                      }
                    }}
                    className="border-border hover:bg-muted/40 focus-visible:ring-ring cursor-pointer border-b transition-colors last:border-b-0 focus-visible:ring-2 focus-visible:outline-none"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3 align-middle">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={columns.length} className="h-24 px-4 text-center">
                    No hay jugadores para los filtros aplicados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-3 md:hidden">
        {table.getRowModel().rows.length ? (
          table
            .getRowModel()
            .rows.map((row) => <PlayerCard key={row.original.id} row={row.original} />)
        ) : (
          <Card>
            <CardContent className="text-muted-foreground p-5 text-center text-sm">
              No hay jugadores para los filtros aplicados.
            </CardContent>
          </Card>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground text-sm">
          {filteredRows.length} resultados · Página{" "}
          {table.getState().pagination.pageIndex + 1} de{" "}
          {Math.max(table.getPageCount(), 1)}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft />
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Siguiente
            <ChevronRight />
          </Button>
        </div>
      </div>
    </section>
  );
}

function SortButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hover:bg-muted hover:text-foreground -ml-2 inline-flex h-8 items-center gap-1 rounded-md px-2 text-left text-sm font-medium transition-colors"
    >
      {label}
      <ArrowUpDown className="size-3.5" aria-hidden="true" />
    </button>
  );
}

function StatusBadge({ status }: { status: PlayerPaymentStatus }) {
  return <Badge variant={statusVariants[status]}>{statusLabels[status]}</Badge>;
}

function RowActions({ player }: { player: PlayerTableRow }) {
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <Button asChild variant="ghost" size="sm">
        <Link href={getPlayerHref(player.id)} aria-label={`Ver ${player.name}`}>
          <Eye />
          Ver
        </Link>
      </Button>
      <Button asChild variant="outline" size="sm">
        <Link href={getPlayerHref(player.id)} aria-label={`Cobrar ${player.name}`}>
          <CreditCard />
          Cobrar
        </Link>
      </Button>
      <ReminderButton
        playerName={player.name}
        phone={player.phone}
        feeAmount={player.fee}
      />
    </div>
  );
}

function PlayerCard({ row }: { row: PlayerTableRow }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate text-base">
              <Link
                href={getPlayerHref(row.id)}
                className="underline-offset-4 hover:underline"
              >
                {row.name}
              </Link>
            </CardTitle>
            <p className="text-muted-foreground mt-1 text-sm">{row.category}</p>
          </div>
          <StatusBadge status={row.status} />
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Info label="Teléfono" value={row.phone} />
          <Info label="Cuota" value={row.fee} />
          <Info label="Último pago" value={row.lastPayment} />
          <Info label="Observaciones" value={row.observations} />
        </div>
        <RowActions player={row} />
      </CardContent>
    </Card>
  );
}

function getPlayerHref(playerId: string) {
  return `/players/${encodeURIComponent(playerId)}`;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="truncate text-sm font-medium">{value}</p>
    </div>
  );
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
