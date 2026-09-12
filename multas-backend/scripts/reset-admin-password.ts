import { createInterface } from "node:readline/promises";
import { ResetAdminPasswordUseCase } from "../src/modules/auth/application/PasswordUseCases.js";
import { hiddenQuestion, requireInteractiveTerminal, strongPasswordSchema } from "./interactive.js";
import { withContainer } from "./runtime.js";

requireInteractiveTerminal("admin:reset-password");
const prompts = createInterface({ input: process.stdin, output: process.stdout });
try {
  const identifier = (await prompts.question("Usuario o correo del administrador: ")).trim();
  const password = await hiddenQuestion("Nueva contraseña: ");
  const confirmation = await hiddenQuestion("Confirmar nueva contraseña: ");
  if (password !== confirmation) throw new Error("Las contraseñas no coinciden.");
  const validatedPassword = strongPasswordSchema.parse(password);
  await withContainer(async ({ authRepository, auditRepository, passwordHasher, schema, rbac }) => {
    if (!(await schema.inspect("auth")).matches) throw new Error("El contrato auth no coincide.");
    if (!(await rbac.inspect()).matches) throw new Error("RBAC no es consistente.");
    await new ResetAdminPasswordUseCase(authRepository, auditRepository, passwordHasher).execute(identifier, validatedPassword);
    process.stdout.write("Contraseña del administrador restablecida y sesiones previas revocadas.\n");
  });
} finally {
  prompts.close();
}
