"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import { manageAnnualMvpSurvey } from "@/app/(dashboard)/encuestas/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { annualMvpHref, type AnnualMvpSurvey } from "@/lib/annual-mvp";

export function SurveyManager({
  currentYear,
  surveys,
}: {
  currentYear: number;
  surveys: AnnualMvpSurvey[] | null;
}) {
  const [creating, setCreating] = useState(false);
  const [type, setType] = useState("");
  const [result, action, pending] = useActionState(manageAnnualMvpSurvey, null);

  return (
    <>
      <div className="flex justify-end">
        <Button
          type="button"
          aria-expanded={creating}
          aria-controls={creating ? "nueva-encuesta" : undefined}
          variant={creating ? "outline" : "default"}
          onClick={() => setCreating((current) => !current)}
        >
          {creating ? (
            "Ocultar formulario"
          ) : (
            <>
              <Plus aria-hidden="true" />
              Nueva encuesta
            </>
          )}
        </Button>
      </div>
      {creating ? (
        <Card id="nueva-encuesta">
          <CardContent className="grid gap-4 pt-6">
            <label className="grid max-w-xs gap-2 text-sm font-medium">
              Tipo de encuesta
              <select
                className="border-input bg-background h-10 rounded-md border px-3 text-sm"
                value={type}
                onChange={(event) => setType(event.target.value)}
              >
                <option value="">Elegí un tipo</option>
                <option value="mvp">MVP del año</option>
              </select>
            </label>
            {type === "mvp" ? (
              <form action={action} className="grid gap-3 sm:justify-items-start">
                <p className="text-muted-foreground text-sm">
                  La lista se arma al publicar con quienes jugaron al menos un partido en
                  el año elegido.
                </p>
                <input type="hidden" name="intent" value="publish" />
                <label className="grid gap-2 text-sm font-medium">
                  Año
                  <input
                    className="border-input bg-background h-10 rounded-md border px-3 text-sm"
                    type="number"
                    name="year"
                    min={1900}
                    max={currentYear}
                    defaultValue={currentYear}
                    required
                  />
                </label>
                <Button type="submit" disabled={pending}>
                  Publicar MVP del año
                </Button>
              </form>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
      {result ? (
        <p
          role="status"
          className={result.ok ? "text-primary text-sm" : "text-destructive text-sm"}
        >
          {result.message}
        </p>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Votaciones de MVP del año</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {!surveys ? (
            <p role="alert" className="text-destructive text-sm">
              No se pudo cargar el historial de encuestas. Volvé a intentar en unos
              minutos.
            </p>
          ) : null}
          {surveys?.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Todavía no hay votaciones publicadas.
            </p>
          ) : null}
          {surveys?.map((survey) => (
            <div
              key={survey.year}
              className="border-border flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">MVP del año {survey.year}</p>
                <Badge variant={survey.closed ? "secondary" : "success"}>
                  {survey.closed ? "Cerrada" : "Abierta"}
                </Badge>
                <span className="text-muted-foreground text-sm">
                  {survey.candidates.reduce(
                    (total, candidate) => total + candidate.votes,
                    0,
                  )}{" "}
                  votos
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href={annualMvpHref(survey.year)}>Ver votación</Link>
                </Button>
                {survey.closed ? null : (
                  <form
                    action={action}
                    onSubmit={(event) => {
                      if (
                        !window.confirm(
                          `¿Cerrar la votación de MVP del año ${survey.year}?`,
                        )
                      )
                        event.preventDefault();
                    }}
                  >
                    <input type="hidden" name="intent" value="close" />
                    <input type="hidden" name="year" value={survey.year} />
                    <Button disabled={pending} type="submit" variant="outline" size="sm">
                      Cerrar votación
                    </Button>
                  </form>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
