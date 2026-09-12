import { emitKeypressEvents } from "node:readline";
import { z } from "zod";

export const strongPasswordSchema = z.string().min(12).max(128)
  .regex(/[a-z]/, "Debe incluir una minúscula")
  .regex(/[A-Z]/, "Debe incluir una mayúscula")
  .regex(/\d/, "Debe incluir un número")
  .regex(/[^a-zA-Z0-9]/, "Debe incluir un símbolo");

export function requireInteractiveTerminal(command: string): void {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(`${command} requiere una terminal interactiva para no exponer la contraseña.`);
  }
}

export async function hiddenQuestion(label: string): Promise<string> {
  process.stdout.write(label);
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  let value = "";
  try {
    return await new Promise<string>((resolve, reject) => {
      const cleanup = () => process.stdin.off("keypress", onKeypress);
      const onKeypress = (character: string, key: { name?: string; ctrl?: boolean }) => {
        if (key.ctrl && key.name === "c") {
          cleanup();
          reject(new Error("Operación cancelada."));
        } else if (key.name === "return" || key.name === "enter") {
          cleanup();
          process.stdout.write("\n");
          resolve(value);
        } else if (key.name === "backspace") value = value.slice(0, -1);
        else if (character && !key.ctrl) value += character;
      };
      process.stdin.on("keypress", onKeypress);
    });
  } finally {
    process.stdin.setRawMode(false);
    process.stdin.pause();
  }
}
