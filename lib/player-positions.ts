export const PLAYER_POSITIONS = [
  "Arquero",
  "Defensor Central",
  "Lateral Izquierdo",
  "Lateral Derecho",
  "Mediocampista central",
  "Volante",
  "Mediocampista por afuera",
  "Mediocampista ofensivo",
  "Extremo",
  "Delantero centro",
] as const;

export type PlayerPosition = (typeof PLAYER_POSITIONS)[number];

export function isPlayerPosition(value: string): value is PlayerPosition {
  return PLAYER_POSITIONS.some((position) => position === value);
}
