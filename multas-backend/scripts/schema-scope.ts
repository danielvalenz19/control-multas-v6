import type { SchemaScope } from "../src/shared/infrastructure/mysql/SchemaInspector.js";

export function parseSchemaScope(arguments_: string[]): SchemaScope {
  const inline = arguments_.find((argument) => argument.startsWith("--scope="));
  const flagIndex = arguments_.indexOf("--scope");
  const value = inline?.slice("--scope=".length) ?? (flagIndex >= 0 ? arguments_[flagIndex + 1] : undefined) ?? "auth";
  if (value !== "auth" && value !== "full") {
    throw new Error("El alcance debe ser auth o full.");
  }
  return value;
}
