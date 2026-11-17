import type { CashFlowTransaction } from "@/types/dashboard";
import type { FeeCalculatorData } from "@/types/fee-calculator";
import type {
  ApplyFundraisingBenefitInput,
  FundraisingAccount,
  FundraisingAllocation,
  FundraisingBenefitApplication,
  FundraisingSource,
} from "@/types/fundraising";

export const ALL_FUNDRAISING_SOURCES = "__all__";

export function planFundraisingBenefit(
  data: FeeCalculatorData,
  input: ApplyFundraisingBenefitInput,
) {
  const sources = (data.fundraisingSources ?? [])
    .filter(
      (source) =>
        source.period <= input.period &&
        (input.fundraisingId === ALL_FUNDRAISING_SOURCES ||
          source.id === input.fundraisingId),
    )
    .sort(
      (a, b) =>
        a.period.localeCompare(b.period) ||
        a.date.localeCompare(b.date) ||
        a.id.localeCompare(b.id),
    );
  const previous = (data.benefitApplications ?? []).filter(
    (item) => item.period === input.period,
  );
  const cost = input.costId
    ? data.costs.find((item) => item.id === input.costId)
    : undefined;
  const previews = new Map<
    string,
    {
      playerId: string;
      playerName: string;
      amount: number;
      balance: number;
      discount: number;
      remaining: number;
      costAmount: number;
      quota: number;
    }
  >();
  const applications: Omit<FundraisingBenefitApplication, "id" | "createdAt">[] = [];
  for (const source of sources) {
    const allocations: FundraisingAllocation[] = [];
    const costAmounts: Record<string, number> = {};
    for (const credit of source.allocations) {
      const player = data.playerCalculations.find(
        (item) => item.playerId === credit.playerId,
      );
      const costAmount = input.costId
        ? (data.benefitCostShares?.[input.costId]?.[credit.playerId] ?? 0)
        : (player?.finalQuota ?? 0);
      if (credit.balance <= 0 || !player || costAmount <= 0 || player.finalQuota <= 0)
        continue;
      if (
        previous.some(
          (item) =>
            item.fundraisingId === source.id &&
            (item.costId ?? "") === (input.costId ?? "") &&
            item.allocations.some(
              (allocation) => allocation.playerId === credit.playerId,
            ),
        )
      )
        continue;
      const costUsed = input.costId
        ? previous
            .filter((item) => item.costId === input.costId)
            .reduce(
              (sum, item) =>
                sum +
                (item.allocations.find(
                  (allocation) => allocation.playerId === credit.playerId,
                )?.amount ?? 0),
              0,
            )
        : 0;
      const preview = previews.get(credit.playerId) ?? {
        playerId: credit.playerId,
        playerName: credit.playerName,
        amount: 0,
        balance: 0,
        discount: 0,
        remaining: 0,
        costAmount,
        quota: player.finalQuota,
      };
      const selected = !input.playerIds || input.playerIds.includes(credit.playerId);
      const amount = selected
        ? roundMoney(
            Math.max(
              0,
              Math.min(
                roundMoney((credit.amount * input.percent) / 100),
                credit.balance,
                player.finalQuota - preview.discount,
                costAmount - costUsed - preview.discount,
              ),
            ),
          )
        : 0;
      preview.amount = roundMoney(preview.amount + credit.amount);
      preview.balance = roundMoney(preview.balance + credit.balance);
      preview.discount = roundMoney(preview.discount + amount);
      preview.remaining = roundMoney(preview.balance - preview.discount);
      previews.set(credit.playerId, preview);
      if (amount > 0) {
        allocations.push({
          playerId: credit.playerId,
          playerName: credit.playerName,
          amount,
        });
        costAmounts[credit.playerId] = costAmount;
      }
    }
    if (allocations.length)
      applications.push({
        fundraisingId: source.id,
        concept: source.concept,
        period: input.period,
        percent: input.percent,
        costId: cost?.id,
        costName: cost?.name,
        costAmounts: cost ? costAmounts : undefined,
        allocations,
      });
  }
  return {
    applications,
    previews: [...previews.values()].sort((a, b) =>
      a.playerName.localeCompare(b.playerName),
    ),
  };
}

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function splitFundraisingAmount(amount: number, playerIds: string[]) {
  const ids = [...new Set(playerIds)].sort();
  const cents = Math.round(amount * 100);
  if (!Number.isSafeInteger(cents) || cents <= 0 || !ids.length) {
    throw new Error("Ingresá un monto válido y seleccioná al menos un jugador.");
  }
  const share = Math.floor(cents / ids.length);
  const remainder = cents % ids.length;
  return ids.map((playerId, index) => ({
    playerId,
    amount: (share + (index < remainder ? 1 : 0)) / 100,
  }));
}

export function parseFundraisingAllocations(value: string): FundraisingAllocation[] {
  if (!value) return [];
  const parsed: unknown = JSON.parse(value);
  if (
    !Array.isArray(parsed) ||
    parsed.some(
      (item) =>
        !item ||
        typeof item.playerId !== "string" ||
        typeof item.playerName !== "string" ||
        !Number.isFinite(item.amount) ||
        item.amount < 0,
    ) ||
    new Set(parsed.map((item) => item.playerId)).size !== parsed.length
  ) {
    throw new Error("La cuenta corriente contiene un reparto inválido.");
  }
  return parsed;
}

/** Replay append-only applications in sheet order. First application per source/month/cost/player
 * wins, including retries; cents are capped to available credit even for concurrent writes. */
export function buildFundraisingLedger(
  transactions: CashFlowTransaction[],
  applications: FundraisingBenefitApplication[],
) {
  const sources: FundraisingSource[] = transactions
    .filter(
      (item) =>
        item.active &&
        item.type === "income" &&
        item.scenario === "real" &&
        item.incomeKind === "fundraising",
    )
    .map((item) => ({
      id: item.id,
      concept: item.concept,
      date: item.date ?? `${item.period}-01`,
      period: item.period,
      amount: item.amount,
      allocations: (item.fundraisingAllocations ?? []).map((allocation) => ({
        ...allocation,
        usedAmount: 0,
        balance: allocation.amount,
      })),
      balance: item.amount,
    }));
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  const seen = new Set<string>();
  const usedByCost = new Map<string, number>();
  const effectiveApplications: FundraisingBenefitApplication[] = [];
  for (const application of applications) {
    const source = sourceMap.get(application.fundraisingId);
    if (!source || source.period > application.period) continue;
    const allocations = application.allocations.flatMap((allocation) => {
      const key = `${application.fundraisingId}:${application.period}:${application.costId ?? ""}:${allocation.playerId}`;
      if (seen.has(key)) return [];
      seen.add(key);
      const credit = source.allocations.find(
        (item) => item.playerId === allocation.playerId,
      );
      if (!credit) return [];
      const costKey = `${application.period}:${application.costId}:${allocation.playerId}`;
      const costUsed = usedByCost.get(costKey) ?? 0;
      const costAvailable = application.costId
        ? Math.max(0, (application.costAmounts?.[allocation.playerId] ?? 0) - costUsed)
        : Infinity;
      const amount = roundMoney(
        Math.min(allocation.amount, credit.balance, costAvailable),
      );
      if (application.costId) usedByCost.set(costKey, roundMoney(costUsed + amount));
      credit.usedAmount = roundMoney(credit.usedAmount + amount);
      credit.balance = roundMoney(credit.balance - amount);
      return amount > 0 ? [{ ...allocation, amount }] : [];
    });
    source.balance = roundMoney(
      source.allocations.reduce((total, item) => total + item.balance, 0),
    );
    if (allocations.length) effectiveApplications.push({ ...application, allocations });
  }
  return { sources, applications: effectiveApplications };
}

export function buildFundraisingAccount(
  playerId: string,
  ledger: ReturnType<typeof buildFundraisingLedger>,
): FundraisingAccount {
  const movements: FundraisingAccount["movements"] = [];
  for (const source of ledger.sources) {
    const allocation = source.allocations.find((item) => item.playerId === playerId);
    if (allocation)
      movements.push({
        id: source.id,
        date: source.date,
        concept: source.concept,
        period: source.period,
        kind: "credit",
        amount: allocation.amount,
        balance: 0,
      });
  }
  for (const application of ledger.applications) {
    const allocation = application.allocations.find((item) => item.playerId === playerId);
    if (allocation)
      movements.push({
        id: application.id,
        date: application.createdAt,
        concept: application.costName
          ? `${application.costName} · ${application.concept}`
          : application.concept,
        period: application.period,
        kind: "benefit",
        amount: allocation.amount,
        balance: 0,
      });
  }
  movements.sort(
    (a, b) => a.date.localeCompare(b.date) || (a.kind === "credit" ? -1 : 1),
  );
  let balance = 0;
  for (const movement of movements) {
    balance = roundMoney(
      balance + (movement.kind === "credit" ? movement.amount : -movement.amount),
    );
    movement.balance = balance;
  }
  return {
    totalCollected: roundMoney(
      movements
        .filter((item) => item.kind === "credit")
        .reduce((sum, item) => sum + item.amount, 0),
    ),
    totalUsed: roundMoney(
      movements
        .filter((item) => item.kind === "benefit")
        .reduce((sum, item) => sum + item.amount, 0),
    ),
    balance,
    movements,
  };
}
