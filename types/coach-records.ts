import type { DataSourceState } from "@/types/dashboard";
import type { LeagueCompetitionKind } from "@/types/fixture";

export interface CoachRecordMatch {
  competitionKind?: LeagueCompetitionKind;
  competitionLabel: string;
  date: string;
  hours: number;
  id: string;
  rival: string;
  venue: string;
}

export interface CoachRecordsData {
  costName: string;
  emailBody: string;
  emailCc: string[];
  emailSubject: string;
  emailTo: string;
  emptyState: {
    title: string;
    description: string;
  };
  hourlyRate: number;
  matches: CoachRecordMatch[];
  paymentPeriod: string;
  period: string;
  source: DataSourceState;
  totalCost: number;
  totalHours: number;
}
