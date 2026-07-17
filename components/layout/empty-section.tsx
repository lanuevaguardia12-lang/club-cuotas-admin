import { PanelTop } from "lucide-react";

interface EmptySectionProps {
  eyebrow: string;
  title: string;
  description: string;
}

export function EmptySection({ eyebrow, title, description }: EmptySectionProps) {
  return (
    <main className="grid gap-6">
      <header>
        <p className="text-muted-foreground text-sm font-medium">{eyebrow}</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-normal sm:text-3xl">
          {title}
        </h1>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm">{description}</p>
      </header>

      <section className="border-border bg-card grid min-h-80 place-items-center rounded-lg border border-dashed p-6 text-center">
        <div className="max-w-sm">
          <div className="bg-muted mx-auto grid size-12 place-items-center rounded-lg">
            <PanelTop className="text-muted-foreground size-6" aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-lg font-semibold">Modulo vacio</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            Agrega aqui los componentes, servicios y flujos propios del producto.
          </p>
        </div>
      </section>
    </main>
  );
}
