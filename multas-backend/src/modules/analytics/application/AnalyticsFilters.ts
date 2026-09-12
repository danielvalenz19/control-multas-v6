import { z } from "zod";
import { HttpError } from "../../../shared/http/HttpError.js";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "La fecha no es válida.");

export const analyticsFilterSchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  departmentId: z.coerce.number().int().positive().optional(),
}).transform((input) => {
  const today = new Date();
  const defaultTo = today.toISOString().slice(0, 10);
  const defaultFromDate = new Date(today);
  defaultFromDate.setUTCDate(defaultFromDate.getUTCDate() - 29);
  const from = input.from ?? defaultFromDate.toISOString().slice(0, 10);
  const to = input.to ?? defaultTo;
  const start = new Date(`${from}T00:00:00.000Z`);
  const endInclusive = new Date(`${to}T00:00:00.000Z`);
  const days = Math.floor((endInclusive.getTime() - start.getTime()) / 86_400_000) + 1;
  if (days < 1 || days > 366) {
    throw new HttpError({ code: "ANALYTICS_DATE_RANGE_INVALID", message: "El rango debe contener entre 1 y 366 días.", statusCode: 422 });
  }
  const endExclusive = new Date(endInclusive);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  return { from, to, start, endExclusive, departmentId: input.departmentId };
});

export type AnalyticsFilter = z.output<typeof analyticsFilterSchema>;

export function dependencyClause(alias: string, filter: AnalyticsFilter, values: unknown[]): string {
  if (!filter.departmentId) return "";
  values.push(filter.departmentId);
  return ` AND ${alias}.department_id=?`;
}
