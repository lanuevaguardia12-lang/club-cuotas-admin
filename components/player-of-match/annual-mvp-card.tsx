"use client";

import { CheckCircle2, Eye, Lock, Timer, Trophy, UsersRound } from "lucide-react";
import { useActionState, useState } from "react";

import { submitAnnualMvpVote } from "@/app/(dashboard)/player-of-match/annual-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingModal } from "@/components/ui/loading-modal";
import type { AnnualMvpBallot } from "@/lib/annual-mvp";

export function AnnualMvpCard({
  ballot,
  canVote,
}: {
  ballot: AnnualMvpBallot;
  canVote: boolean;
}) {
  const [result, action, pending] = useActionState(submitAnnualMvpVote, null);
  const [showResults, setShowResults] = useState(false);
  const votedFor = ballot.votedFor ?? result?.votedFor;
  const totalVotes = ballot.results?.reduce(
    (total, candidate) => total + candidate.votes,
    0,
  );
  const results = ballot.results
    ?.filter((candidate) => candidate.votes > 0)
    .sort((left, right) => right.votes - left.votes);

  return (
    <Card
      id={`mvp-del-ano-${ballot.year}`}
      className="club-animate-fade-up scroll-mt-20 overflow-hidden"
    >
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="text-primary size-5" />
            MVP del año {ballot.year}
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <Badge variant={ballot.closed ? "secondary" : "success"} className="gap-1.5">
              {ballot.closed ? (
                <Lock className="size-3.5" />
              ) : (
                <Timer className="size-3.5" />
              )}
              {ballot.closed ? "Cerrada" : "Abierta"}
            </Badge>
            {votedFor || result?.ok ? (
              <Badge variant="success" className="gap-1.5">
                <CheckCircle2 className="size-3.5" />
                Votado
              </Badge>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        {ballot.results ? (
          <div className="border-border bg-muted/30 flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
            <span className="flex items-center gap-2">
              <UsersRound className="text-muted-foreground size-4" />
              {ballot.results.length} jugadores en la votación
            </span>
            <span className="text-muted-foreground text-xs">{totalVotes} votantes</span>
          </div>
        ) : null}

        {votedFor || result?.ok ? (
          <div
            role="status"
            className="border-primary/30 bg-primary/5 grid gap-2 rounded-md border p-4 text-sm"
          >
            <p className="text-primary font-semibold">Voto registrado correctamente</p>
            {votedFor ? <p>Tu voto fue para {votedFor}.</p> : null}
          </div>
        ) : !ballot.closed && canVote && ballot.choices.length > 0 ? (
          <form action={action} className="grid gap-3">
            <LoadingModal open={pending} description="Guardando voto..." />
            <input type="hidden" name="year" value={ballot.year} />
            <label className="grid gap-2 text-sm font-medium">
              Elegí al MVP del año
              <select
                name="candidateId"
                required
                disabled={pending}
                defaultValue=""
                className="border-input bg-background focus-visible:ring-ring h-10 min-w-0 rounded-md border px-3 text-sm outline-none focus-visible:ring-2"
              >
                <option value="">Elegí un jugador</option>
                {ballot.choices.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" disabled={pending}>
              <Trophy />
              Votar MVP del año
            </Button>
            {result ? (
              <p role="alert" className="text-destructive text-sm">
                {result.message}
              </p>
            ) : null}
          </form>
        ) : !ballot.closed && canVote ? (
          <p className="text-muted-foreground text-sm">
            No hay jugadores disponibles para tu voto.
          </p>
        ) : null}

        {results ? (
          <div className="border-border grid gap-3 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              aria-expanded={showResults}
              onClick={() => setShowResults((current) => !current)}
            >
              <Eye />
              {showResults ? "Ocultar resultados" : "Ver resultados"}
            </Button>
            {showResults ? (
              results.length > 0 ? (
                <ul className="grid gap-2 text-sm">
                  {results.map((candidate) => (
                    <li
                      key={candidate.id}
                      className="border-border flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
                    >
                      <span className="font-medium">{candidate.name}</span>
                      <Badge variant="secondary">
                        {candidate.votes} {candidate.votes === 1 ? "voto" : "votos"}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Todavía no se registraron votos.
                </p>
              )
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
