import { ClipboardList } from "lucide-react";
import { redirect } from "next/navigation";

import { SurveyManager } from "@/components/surveys/survey-manager";
import { hasPermission } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { attendanceToday } from "@/lib/match-attendance";
import { AnnualMvpStore } from "@/services/database/annual-mvp-store";

export default async function SurveysPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasPermission(user, "surveys:manage")) redirect("/");

  const surveys = await new AnnualMvpStore().list().catch(() => null);

  return (
    <main className="grid min-w-0 gap-6">
      <h1 className="flex items-center gap-2 text-2xl font-semibold sm:text-3xl">
        <ClipboardList className="text-primary size-7" />
        Encuestas
      </h1>
      {surveys ? (
        <SurveyManager
          currentYear={Number(attendanceToday().slice(0, 4))}
          surveys={surveys}
        />
      ) : (
        <p role="alert" className="text-destructive text-sm">
          No se pudieron cargar las encuestas.
        </p>
      )}
    </main>
  );
}
