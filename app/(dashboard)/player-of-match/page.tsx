import { redirect } from "next/navigation";
import { Trophy } from "lucide-react";

import { PlayerOfMatchContent } from "@/components/player-of-match/player-of-match-content";
import { Badge } from "@/components/ui/badge";
import { LOGIN_PATH } from "@/lib/auth/constants";
import { hasPermission } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { getDataService } from "@/services/data-service";

export const dynamic = "force-dynamic";

export default async function PlayerOfMatchPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect(LOGIN_PATH);
  }

  const data = await getDataService().getPlayerOfMatchData(user.id, user.playerId);
  const canManage = hasPermission(user, "player-of-match:manage");
  const canVote = user.role !== "admin" && hasPermission(user, "player-of-match:vote");

  return (
    <main className="grid min-w-0 gap-6 overflow-hidden">
      <header className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-muted-foreground text-sm font-medium">
            Votación del plantel
          </p>
          <h1 className="mt-2 flex min-w-0 flex-wrap items-center gap-2 text-2xl font-semibold tracking-normal sm:text-3xl">
            <Trophy className="text-primary size-7 shrink-0" />
            MVP y rachas
          </h1>
          <p className="text-muted-foreground mt-2 max-w-full text-sm break-words sm:max-w-2xl">
            Votá el MVP, revisá resultados y compará rankings internos del plantel.
          </p>
        </div>
        <Badge variant={data.source.status === "ready" ? "success" : "secondary"}>
          {data.source.status}
        </Badge>
      </header>

      <PlayerOfMatchContent
        canManage={canManage}
        canVote={canVote}
        data={data}
        voteMode={user.role === "fan" ? "fan" : "player"}
      />
    </main>
  );
}
