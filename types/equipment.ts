export type EquipmentType = "balls" | "shirt";

export interface EquipmentAssignment {
  id: string;
  assignedAt: string;
  createdAt: string;
  createdByName: string;
  createdByUserId: string;
  equipmentType: EquipmentType;
  matchDate?: string;
  matchId?: string;
  matchLabel?: string;
  notes?: string;
  playerId: string;
  playerName: string;
}

export interface CreateEquipmentAssignmentInput {
  assignedAt: string;
  createdByName: string;
  createdByUserId: string;
  equipmentType: EquipmentType;
  matchDate?: string;
  matchId?: string;
  matchLabel?: string;
  notes?: string;
  playerId: string;
  playerName: string;
}
