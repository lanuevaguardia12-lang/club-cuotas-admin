export interface FundraisingAllocation {
  playerId: string;
  playerName: string;
  amount: number;
}

export interface FundraisingSource {
  id: string;
  concept: string;
  date: string;
  period: string;
  amount: number;
  allocations: (FundraisingAllocation & { usedAmount: number; balance: number })[];
  balance: number;
}

export interface FundraisingBenefitApplication {
  reversalOf?: string;
  costId?: string;
  costName?: string;
  costAmounts?: Record<string, number>;
  id: string;
  fundraisingId: string;
  concept: string;
  period: string;
  percent: number;
  createdAt: string;
  allocations: FundraisingAllocation[];
}

export interface ApplyFundraisingBenefitInput {
  costId?: string;
  playerIds?: string[];
  fundraisingId: string;
  period: string;
  percent: number;
}

export interface FundraisingAccount {
  totalCollected: number;
  totalUsed: number;
  balance: number;
  movements: {
    id: string;
    date: string;
    concept: string;
    period: string;
    kind: "credit" | "benefit" | "reversal";
    amount: number;
    balance: number;
  }[];
}
