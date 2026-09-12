import { withContainer } from "./runtime.js";
import { parseSchemaScope } from "./schema-scope.js";

await withContainer(async ({ schema }) => {
  const report = await schema.inspect(parseSchemaScope(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.matches) process.exitCode = 2;
});
