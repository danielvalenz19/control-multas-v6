import { describe, expect, it } from "vitest";
import { centsToDecimal, decimalToCents, normalizeMoney } from "../../src/shared/domain/Money.js";

describe("dinero exacto", () => {
  it("convierte DECIMAL a centavos bigint sin flotantes", () => {
    expect(decimalToCents("90071992547409.91")).toBe(9_007_199_254_740_991n);
    expect(centsToDecimal(15_001n)).toBe("150.01");
    expect(normalizeMoney("150.5")).toBe("150.50");
  });

  it("conserva signos para débitos y créditos", () => {
    expect(decimalToCents("-25.09") + decimalToCents("150.10")).toBe(12_501n);
    expect(centsToDecimal(-2_509n)).toBe("-25.09");
  });

  it("rechaza más de dos decimales", () => {
    expect(() => decimalToCents("1.001")).toThrow(expect.objectContaining({ code: "MONEY_INVALID" }));
  });
});
