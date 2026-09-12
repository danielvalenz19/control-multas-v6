import { DomainError } from "./DomainError.js";

const decimalPattern = /^-?\d+(?:\.\d{1,2})?$/;

export function decimalToCents(value: string): bigint {
  if (!decimalPattern.test(value)) {
    throw new DomainError({ code: "MONEY_INVALID", message: "El monto debe tener como máximo dos decimales." });
  }
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole = "0", fraction = ""] = unsigned.split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return negative ? -cents : cents;
}

export function centsToDecimal(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / 100n;
  const cents = String(absolute % 100n).padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${cents}`;
}

export function normalizeMoney(value: string): string {
  return centsToDecimal(decimalToCents(value));
}
