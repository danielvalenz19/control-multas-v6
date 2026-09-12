import { createInterface } from "node:readline/promises";
import { z } from "zod";
import { CreateAdminUseCase } from "../src/modules/auth/application/CreateAdminUseCase.js";
import { hiddenQuestion, requireInteractiveTerminal, strongPasswordSchema } from "./interactive.js";
import { withContainer } from "./runtime.js";

const adminSchema = z.object({
  username: z.string().trim().min(3).max(50).regex(/^[a-zA-Z0-9._-]+$/),
  email: z.union([z.literal(""), z.email().max(191)]).transform((value) => value === "" ? null : value),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  password: strongPasswordSchema,
});

requireInteractiveTerminal("admin:create");

const prompts = createInterface({ input: process.stdin, output: process.stdout });
try {
  const username = await prompts.question("Usuario: ");
  const email = await prompts.question("Correo (opcional): ");
  const firstName = await prompts.question("Nombres: ");
  const lastName = await prompts.question("Apellidos: ");
  const password = await hiddenQuestion("Contraseña: ");
  const confirmation = await hiddenQuestion("Confirmar contraseña: ");
  if (password !== confirmation) throw new Error("Las contraseñas no coinciden.");
  const input = adminSchema.parse({ username, email, firstName, lastName, password });

  await withContainer(async ({ schema, rbac, authRepository, auditRepository, passwordHasher }) => {
    const report = await schema.inspect("auth");
    if (!report.matches) {
      throw new Error(`El esquema no coincide; no se creó el administrador: ${JSON.stringify(report.differences)}`);
    }
    const rbacReport = await rbac.inspect();
    if (!rbacReport.matches) {
      throw new Error(`RBAC no es consistente; no se creó el administrador: ${JSON.stringify(rbacReport)}`);
    }
    const user = await new CreateAdminUseCase(authRepository, auditRepository, passwordHasher).execute(input);
    process.stdout.write(`Administrador ${user.username} creado correctamente.\n`);
  });
} finally {
  prompts.close();
}
