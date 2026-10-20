// Argentina uses UTC-3: Monday 11:00/17:00 and Wednesday 11:00.
export function getLeagueRefreshSlot(now = new Date()) {
  for (let daysAgo = 0; daysAgo < 8; daysAgo += 1) {
    const day = new Date(now);
    day.setUTCDate(day.getUTCDate() - daysAgo);
    const hours = day.getUTCDay() === 1 ? [20, 14] : day.getUTCDay() === 3 ? [14] : [];

    for (const hour of hours) {
      const slot = new Date(day);
      slot.setUTCHours(hour, 0, 0, 0);
      if (slot <= now) return slot.toISOString();
    }
  }

  throw new Error("No se pudo calcular la actualizacion programada de la liga.");
}
