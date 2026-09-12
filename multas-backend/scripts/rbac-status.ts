import { withContainer } from "./runtime.js";

await withContainer(async ({ rbac }) => {
  const report = await rbac.inspect();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.matches) process.exitCode = 2;
});
