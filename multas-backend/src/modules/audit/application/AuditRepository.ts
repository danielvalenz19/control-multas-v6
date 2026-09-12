import type { RequestMetadata } from "../../auth/application/AuthRepository.js";

export type AuditEvent = RequestMetadata & {
  actorUserId: string | null;
  actorSessionId: string | null;
  action: string;
  module: string;
  entityType: string;
  entityId: string | null;
  outcome: "SUCCESS" | "FAILURE" | "DENIED" | "WARNING";
  reason?: string;
  previousValues?: unknown;
  newValues?: unknown;
  requestId?: string;
};

export type AuditRepository = {
  record: (event: AuditEvent) => Promise<void>;
};
