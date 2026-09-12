import type { Request } from "express";
import type { AppContainer } from "../../bootstrap/container.js";
import { getRequestId } from "./request-context.js";

export function isDuplicateKey(error: unknown): boolean {
  return typeof error === "object" && error !== null && "errno" in error && error.errno === 1062;
}

export async function recordOperation(
  container: AppContainer,
  request: Request,
  input: { action: string; module: string; entityType: string; entityId: string | null; reason?: string; previousValues?: unknown; newValues?: unknown },
): Promise<void> {
  await container.auditRepository.record({
    actorUserId: request.auth?.user.id ?? null,
    actorSessionId: request.auth?.id ?? null,
    action: input.action,
    module: input.module,
    entityType: input.entityType,
    entityId: input.entityId,
    outcome: "SUCCESS",
    ...(input.reason === undefined ? {} : { reason: input.reason }),
    ...(input.previousValues === undefined ? {} : { previousValues: input.previousValues }),
    ...(input.newValues === undefined ? {} : { newValues: input.newValues }),
    requestId: getRequestId(),
    ipAddress: request.ip ?? null,
    userAgent: request.get("user-agent")?.slice(0, 500) ?? null,
  });
}
