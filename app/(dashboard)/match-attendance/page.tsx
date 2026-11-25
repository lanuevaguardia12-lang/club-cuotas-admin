import { initialMatchAttendance } from "@/lib/match-attendance";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/roles";
import { matchesDatabaseEnabled } from "@/services/database/matches-store";
import { getDataService } from "@/services/data-service";
import { MatchAttendanceEditor } from "@/components/match-attendance/match-attendance-editor";

export const dynamic = "force-dynamic";
export default async function MatchAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{
    date?: string;
    rival?: string;
    sourceType?: string;
    player?: string | string[];
    convoked?: string;
    fixtureId?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasPermission(user, "matches:manage"))
    return <p>Tu rol no puede registrar asistencias.</p>;
  if (!matchesDatabaseEnabled())
    return <p>El registro interno de asistencias todavía no está activado.</p>;
  const params = await searchParams;
  const data = await getDataService().getMatchAttendanceData();
  const initial = initialMatchAttendance(params, data);
  return (
    <main className="grid gap-6">
      <header>
        <Link href="/fixture" className="text-primary text-sm">
          Volver al fixture
        </Link>
        <h1 className="mt-3 text-2xl font-semibold">Partidos y asistencias</h1>
        <p className="text-muted-foreground mt-2">
          Confirmá local o visitante y marcá cuáles de los convocados ingresaron a jugar.
        </p>
      </header>
      <MatchAttendanceEditor
        key={`${initial.date}:${initial.rival}:${initial.sourceType}`}
        matches={data.matches}
        players={data.players.map(({ id, name, status }) => ({ id, name, status }))}
        initial={initial}
      />
    </main>
  );
}
