import type { AuthUser } from "@/types/auth";
import type { AuditActor } from "@/types/premium";

export function userToAuditActor(user: AuthUser): AuditActor {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
  };
}

export const systemAuditActor: AuditActor = {
  id: "system",
  name: "Sistema",
  role: "system",
};

export const apiAuditActor: AuditActor = {
  id: "api",
  name: "API",
  role: "api",
};
