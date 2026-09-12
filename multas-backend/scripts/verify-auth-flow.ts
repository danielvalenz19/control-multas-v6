import { createInterface } from "node:readline/promises";
import "dotenv/config";
import { hiddenQuestion, requireInteractiveTerminal } from "./interactive.js";

requireInteractiveTerminal("auth:verify");
const prompts = createInterface({ input: process.stdin, output: process.stdout });
try {
  const identifier = (await prompts.question("Usuario o correo: ")).trim();
  const password = await hiddenQuestion("Contraseña: ");
  const baseUrl = `http://${process.env["HOST"] ?? "127.0.0.1"}:${process.env["PORT"] ?? "3000"}/api/v1`;
  const health = await fetch(`${baseUrl}/system/health`);
  const readiness = await fetch(`${baseUrl}/system/readiness`);
  const first = await login(baseUrl, identifier, password);
  const second = await login(baseUrl, identifier, password);
  const me = await fetch(`${baseUrl}/auth/me`, { headers: { cookie: first.cookie } });
  const sessions = await fetch(`${baseUrl}/auth/sessions`, { headers: { cookie: first.cookie } });
  const sessionsBody = await sessions.json() as { data?: { sessions?: unknown[] } };
  const logout = await fetch(`${baseUrl}/auth/logout`, { method: "POST", headers: { cookie: first.cookie } });
  const afterLogout = await fetch(`${baseUrl}/auth/me`, { headers: { cookie: first.cookie } });
  const logoutAll = await fetch(`${baseUrl}/auth/logout-all`, { method: "POST", headers: { cookie: second.cookie } });
  const afterLogoutAll = await fetch(`${baseUrl}/auth/me`, { headers: { cookie: second.cookie } });
  process.stdout.write(`${JSON.stringify({
    health: health.status,
    readiness: readiness.status,
    login: first.status,
    me: me.status,
    sessions: sessions.status,
    sessionCountBeforeLogout: sessionsBody.data?.sessions?.length ?? 0,
    logout: logout.status,
    revokedSessionCheck: afterLogout.status,
    logoutAll: logoutAll.status,
    revokedAllCheck: afterLogoutAll.status,
    secretsPrinted: false,
  }, null, 2)}\n`);
  if ([health.status, readiness.status, first.status, second.status, me.status, sessions.status].some((status) => status !== 200)
      || logout.status !== 204 || afterLogout.status !== 401 || logoutAll.status !== 204 || afterLogoutAll.status !== 401) {
    process.exitCode = 1;
  }
} finally {
  prompts.close();
}

async function login(baseUrl: string, identifier: string, password: string): Promise<{ status: number; cookie: string }> {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  if (response.status !== 200 || !cookie) throw new Error(`Login físico falló con HTTP ${response.status}.`);
  return { status: response.status, cookie };
}
