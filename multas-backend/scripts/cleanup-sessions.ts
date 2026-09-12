import { withContainer } from "./runtime.js";

await withContainer(async ({ authRepository }) => {
  const affected = await authRepository.cleanupExpiredSessions();
  process.stdout.write(`${JSON.stringify({ cleanup: "expired_sessions", affected, auditDeleted: false })}\n`);
});
