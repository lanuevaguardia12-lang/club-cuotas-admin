export function getCompetitionStageLabel(tournamentName: string, categoryName = "") {
  const normalized = `${tournamentName} ${categoryName}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (/\bpromocion\b/.test(normalized)) {
    const divisions = /\b([abc])\s*[-–—/]\s*([abc])\b/.exec(normalized);
    return divisions
      ? `Promoción ${divisions[1].toUpperCase()}–${divisions[2].toUpperCase()}`
      : "Promoción";
  }

  if (/play\s*off|semifinal|\bfinal\b/.test(normalized)) return "Playoffs";
  return undefined;
}
