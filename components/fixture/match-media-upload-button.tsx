"use client";

import { Camera, CheckCircle2, ImagePlus, X } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

import { Button } from "@/components/ui/button";

interface MatchMediaUploadButtonProps {
  matchDate: string;
  matchId: string;
  rival: string;
}

interface LocalMatchMediaDraft {
  comment: string;
  createdAt: string;
  fileName: string;
  fileType: string;
  id: string;
}

export function MatchMediaUploadButton({
  matchDate,
  matchId,
  rival,
}: MatchMediaUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [comment, setComment] = useState("");
  const [drafts, setDrafts] = useState<LocalMatchMediaDraft[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [open, setOpen] = useState(false);
  const storageKey = useMemo(() => `lng-match-media:${matchId}`, [matchId]);

  useEffect(() => {
    try {
      const storedValue = window.localStorage.getItem(storageKey);

      setDrafts(storedValue ? JSON.parse(storedValue) : []);
    } catch {
      setDrafts([]);
    }
  }, [storageKey]);

  function saveDrafts(nextDrafts: LocalMatchMediaDraft[]) {
    setDrafts(nextDrafts);
    window.localStorage.setItem(storageKey, JSON.stringify(nextDrafts));
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;

    setFile(nextFile);
    setOpen(Boolean(nextFile));
  }

  function handleSave() {
    if (!file) {
      return;
    }

    saveDrafts([
      {
        comment: comment.trim(),
        createdAt: new Date().toISOString(),
        fileName: file.name,
        fileType: file.type || "archivo",
        id: `${Date.now()}-${file.name}`,
      },
      ...drafts,
    ]);
    setComment("");
    setFile(null);
    setOpen(false);

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function handleCancel() {
    setComment("");
    setFile(null);
    setOpen(false);

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  return (
    <div className="grid gap-2">
      <input
        ref={inputRef}
        accept="image/*,video/*"
        capture="environment"
        className="sr-only"
        onChange={handleFileChange}
        type="file"
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => inputRef.current?.click()}
      >
        <ImagePlus />
        Agregar fotos
      </Button>

      {open ? (
        <div className="border-border bg-background club-animate-fade-up grid gap-3 rounded-md border p-3">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Camera className="text-primary size-4" />
                Material del partido
              </p>
              <p className="text-muted-foreground mt-1 truncate text-xs">
                {file?.name} · vs {rival} · {matchDate || "sin fecha"}
              </p>
            </div>
            <Button size="icon" type="button" variant="ghost" onClick={handleCancel}>
              <X className="size-4" />
            </Button>
          </div>
          <label className="grid gap-2 text-sm">
            <span className="font-medium">Comentario</span>
            <textarea
              className="border-input bg-background focus-visible:ring-ring min-h-20 rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2"
              maxLength={240}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Ej: festejo del gol, atajada, tribuna..."
              value={comment}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={handleSave}>
              <CheckCircle2 />
              Guardar borrador
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={handleCancel}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}

      {drafts.length > 0 ? (
        <p className="text-muted-foreground text-xs">
          {drafts.length}{" "}
          {drafts.length === 1 ? "archivo preparado" : "archivos preparados"} en este
          dispositivo.
        </p>
      ) : null}
    </div>
  );
}
