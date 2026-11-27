import "server-only";

import {
  isAnnualMvpSelfVote,
  type AnnualMvpCandidate,
  type AnnualMvpSurvey,
} from "@/lib/annual-mvp";
import { directoryDatabase } from "@/services/database/directory-store";
import type { AuthUser } from "@/types/auth";

export class AnnualMvpError extends Error {}

export class AnnualMvpStore {
  async list({ voterUserId }: { voterUserId?: string } = {}): Promise<AnnualMvpSurvey[]> {
    const sql = directoryDatabase();
    const privateBallot = voterUserId !== undefined;
    const voterFilter = privateBallot ? sql`and vote.user_id = ${voterUserId}` : sql``;
    const rows = await sql<
      {
        year: number;
        closed: boolean;
        candidate_id: string;
        name: string;
        player_id: string | null;
        votes: number;
      }[]
    >`
      select poll.year, poll.closed_at is not null as closed,
        candidate.candidate_id, candidate.name, candidate.player_id,
        count(vote.user_id)::integer as votes
      from club_surveys.annual_mvp poll
      join club_surveys.annual_mvp_candidates candidate using (year)
      left join club_surveys.annual_mvp_votes vote
        on vote.year = candidate.year and vote.candidate_id = candidate.candidate_id ${voterFilter}
      group by poll.year, candidate.year, candidate.candidate_id
      order by poll.year desc, candidate.name, candidate.candidate_id
    `;
    const surveys = new Map<number, AnnualMvpSurvey>();
    for (const row of rows) {
      let survey = surveys.get(row.year);
      if (!survey) {
        survey = { year: row.year, closed: row.closed, candidates: [] };
        surveys.set(row.year, survey);
      }
      survey.candidates.push({
        id: row.candidate_id,
        name: row.name,
        playerId: row.player_id ?? undefined,
        votes: row.votes,
      });
      if (privateBallot && row.votes > 0) survey.userVoteId = row.candidate_id;
    }
    for (const survey of surveys.values()) {
      survey.candidates.sort((left, right) => left.name.localeCompare(right.name, "es"));
    }
    return [...surveys.values()];
  }

  async publish(year: number, candidates: AnnualMvpCandidate[]) {
    if (!candidates.length) {
      throw new AnnualMvpError(
        "Todavía no hay jugadores con partidos registrados para ese año.",
      );
    }
    await directoryDatabase().begin(async (tx) => {
      const [poll] = await tx`
        insert into club_surveys.annual_mvp (year) values (${year})
        on conflict (year) do nothing returning year
      `;
      if (!poll) throw new AnnualMvpError("Ya existe una votación de MVP para ese año.");
      const rows = candidates.map((candidate) => ({
        year,
        candidate_id: candidate.id,
        player_id: candidate.playerId ?? null,
        name: candidate.name,
      }));
      await tx`insert into club_surveys.annual_mvp_candidates ${tx(rows, "year", "candidate_id", "player_id", "name")}`;
    });
  }

  async close(year: number) {
    const sql = directoryDatabase();
    const [poll] = await sql`
      update club_surveys.annual_mvp set closed_at = clock_timestamp()
      where year = ${year} and closed_at is null returning year
    `;
    if (!poll) throw new AnnualMvpError("La votación ya cerró o no está publicada.");
  }

  async vote(year: number, candidateId: string, user: AuthUser) {
    return directoryDatabase().begin(async (tx) => {
      const [poll] = await tx`
        select year from club_surveys.annual_mvp
        where year = ${year} and closed_at is null for share
      `;
      if (!poll) throw new AnnualMvpError("La votación de MVP del año no está abierta.");
      const [candidate] = await tx<{ name: string; player_id: string | null }[]>`
        select name, player_id from club_surveys.annual_mvp_candidates
        where year = ${year} and candidate_id = ${candidateId}
      `;
      if (!candidate) throw new AnnualMvpError("Elegí un jugador de la votación.");
      if (
        isAnnualMvpSelfVote(
          {
            id: candidateId,
            name: candidate.name,
            playerId: candidate.player_id ?? undefined,
          },
          user,
        )
      ) {
        throw new AnnualMvpError("No podés votarte a vos mismo.");
      }
      const [vote] = await tx`
        insert into club_surveys.annual_mvp_votes (year, user_id, candidate_id)
        values (${year}, ${user.id}, ${candidateId})
        on conflict (year, user_id) do nothing returning year
      `;
      if (!vote) throw new AnnualMvpError("Ya registraste tu voto al MVP de este año.");
      return candidate.name;
    });
  }

  async withNoticeLock<T>(year: number, create: () => Promise<T>) {
    return directoryDatabase().begin(async (tx) => {
      const [poll] = await tx`
        select year from club_surveys.annual_mvp
        where year = ${year} and closed_at is null for update
      `;
      if (!poll)
        throw new AnnualMvpError(
          "Publicá una votación de MVP del año antes de enviar el aviso.",
        );
      return create();
    });
  }
}
